/* ============================================================================
   ARCHIVO:  07_etl_cargar_datamart_sqlserver.sql
   PROYECTO: MMET_BI — Proceso ETL Idempotente hacia el Data Mart (esquema dm)
   ÁMBITO:   Universidad Nacional de Trujillo (Semestre 2026-II)
   MOTOR:    Microsoft SQL Server 2019 / 2022 (T-SQL)
   ============================================================================
   Uso en SSMS o sqlcmd:
     sqlcmd -S localhost -E -C -i "sql_server\07_etl_cargar_datamart_sqlserver.sql"

   Implementa:
     - dm.usp_ejecutar_etl @fecha_corte DATE
       Extrae de dbo.*, transforma aplicando reglas oficiales (D01, D02,
       calidad de pares PSS-10/PCL-5) y carga de forma idempotente en dm.*.
     - Ejecución inicial para cortes clave del semestre 2026-II, incluyendo
       el corte oficial 2026-11-23.
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE MMET_BI_OLTP;
GO

CREATE OR ALTER PROCEDURE dm.usp_ejecutar_etl
    @fecha_corte DATE
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @sk_tiempo_corte      INT = CONVERT(INT, CONVERT(CHAR(8), @fecha_corte, 112));
    DECLARE @id_ejecucion_etl     BIGINT;
    DECLARE @filas_continuidad    INT = 0;
    DECLARE @filas_cumplimiento   INT = 0;
    DECLARE @filas_resultados     INT = 0;
    DECLARE @incidencias          INT = 0;

    IF NOT EXISTS (SELECT 1 FROM dm.DimTiempo WHERE sk_tiempo = @sk_tiempo_corte AND es_no_aplica = 0)
    BEGIN
        THROW 52001, N'La fecha de corte especificada no existe en dm.DimTiempo.', 1;
    END

    -- 1. Registrar inicio de ejecución en tabla de control (fuera de la transacción de carga)
    INSERT INTO dm.etl_log_ejecuciones (fecha_corte, estado, mensaje)
    VALUES (@fecha_corte, N'EN_PROCESO', N'Ejecución ETL iniciada.');
    SET @id_ejecucion_etl = SCOPE_IDENTITY();

    BEGIN TRY
        BEGIN TRANSACTION;

        -- ====================================================================
        -- 2. SINCRONIZACIÓN IDEMPOTENTE DE DIMENSIONES DINÁMICAS (MERGE)
        -- ====================================================================

        -- 2.1 DimEstudiante
        MERGE dm.DimEstudiante AS tgt
        USING dbo.estudiantes AS src
           ON tgt.id_estudiante = src.id_estudiante
        WHEN MATCHED THEN
            UPDATE SET
                tgt.codigo_anonimizado = src.codigo_anonimizado,
                tgt.edad_anios         = src.edad_anios,
                tgt.grupo_etario       = src.grupo_etario,
                tgt.sexo_codificado    = src.sexo_codificado,
                tgt.facultad_o_area    = src.facultad_o_area,
                tgt.ciclo_academico    = src.ciclo_academico
        WHEN NOT MATCHED THEN
            INSERT (id_estudiante, codigo_anonimizado, edad_anios, grupo_etario, sexo_codificado, facultad_o_area, ciclo_academico)
            VALUES (src.id_estudiante, src.codigo_anonimizado, src.edad_anios, src.grupo_etario, src.sexo_codificado, src.facultad_o_area, src.ciclo_academico);

        -- 2.2 DimPrograma
        MERGE dm.DimPrograma AS tgt
        USING dbo.programas AS src
           ON tgt.id_programa = src.id_programa
        WHEN MATCHED THEN
            UPDATE SET
                tgt.codigo_programa   = src.codigo_programa,
                tgt.nombre_programa   = src.nombre_programa,
                tgt.periodo_academico = src.periodo_academico,
                tgt.fecha_inicio      = src.fecha_inicio,
                tgt.fecha_cierre      = src.fecha_cierre,
                tgt.estado_programa   = src.estado_programa
        WHEN NOT MATCHED THEN
            INSERT (id_programa, codigo_programa, nombre_programa, periodo_academico, fecha_inicio, fecha_cierre, estado_programa)
            VALUES (src.id_programa, src.codigo_programa, src.nombre_programa, src.periodo_academico, src.fecha_inicio, src.fecha_cierre, src.estado_programa);

        -- 2.3 DimPractica (P-01..P-04 y MIXTO, tipo Unicomponente/Mixto)
        MERGE dm.DimPractica AS tgt
        USING dbo.cat_practicas AS src
           ON tgt.id_practica = src.id_practica
        WHEN MATCHED THEN
            UPDATE SET
                tgt.codigo_practica = src.codigo_practica,
                tgt.nombre_practica = src.nombre_practica,
                tgt.tipo_practica   = CASE WHEN src.es_mixto = 1 THEN N'Mixto' ELSE N'Unicomponente' END,
                tgt.es_mixto        = src.es_mixto
        WHEN NOT MATCHED THEN
            INSERT (id_practica, codigo_practica, nombre_practica, tipo_practica, es_mixto)
            VALUES (
                src.id_practica,
                src.codigo_practica,
                src.nombre_practica,
                CASE WHEN src.es_mixto = 1 THEN N'Mixto' ELSE N'Unicomponente' END,
                src.es_mixto
            );

        -- 2.4 DimInstrumento (PSS-10 y PCL-5 estrictamente separados)
        MERGE dm.DimInstrumento AS tgt
        USING dbo.cat_instrumentos AS src
           ON tgt.id_instrumento = src.id_instrumento
        WHEN MATCHED THEN
            UPDATE SET
                tgt.codigo_instrumento       = src.codigo_instrumento,
                tgt.version_instrumento      = src.version_instrumento,
                tgt.nombre_instrumento       = src.nombre_instrumento,
                tgt.puntaje_minimo           = src.puntaje_minimo,
                tgt.puntaje_maximo           = src.puntaje_maximo,
                tgt.meta_reduccion_operativa = CASE WHEN src.codigo_instrumento = N'PSS-10' THEN 4.00 ELSE 10.00 END,
                tgt.requiere_evento_indice   = src.requiere_evento_indice
        WHEN NOT MATCHED THEN
            INSERT (
                id_instrumento, codigo_instrumento, version_instrumento, nombre_instrumento,
                puntaje_minimo, puntaje_maximo, meta_reduccion_operativa, requiere_evento_indice
            )
            VALUES (
                src.id_instrumento, src.codigo_instrumento, src.version_instrumento, src.nombre_instrumento,
                src.puntaje_minimo, src.puntaje_maximo,
                CASE WHEN src.codigo_instrumento = N'PSS-10' THEN 4.00 ELSE 10.00 END,
                src.requiere_evento_indice
            );

        -- 2.5 DimEventoIndice (preserva fila -1 'No aplica' para PSS-10)
        MERGE dm.DimEventoIndice AS tgt
        USING (
            SELECT
                ei.id_evento_indice,
                ei.codigo_evento_local,
                cat.codigo_categoria,
                cat.nombre_categoria,
                ei.anio_ocurrencia_aprox
              FROM dbo.eventos_indice ei
              JOIN dbo.cat_categorias_evento_indice cat
                ON cat.id_categoria_evento = ei.id_categoria_evento
        ) AS src
           ON tgt.id_evento_indice = src.id_evento_indice
        WHEN MATCHED THEN
            UPDATE SET
                tgt.codigo_evento_local   = src.codigo_evento_local,
                tgt.codigo_categoria      = src.codigo_categoria,
                tgt.nombre_categoria      = src.nombre_categoria,
                tgt.anio_ocurrencia_aprox = src.anio_ocurrencia_aprox
        WHEN NOT MATCHED THEN
            INSERT (id_evento_indice, codigo_evento_local, codigo_categoria, nombre_categoria, anio_ocurrencia_aprox, es_no_aplica)
            VALUES (src.id_evento_indice, src.codigo_evento_local, src.codigo_categoria, src.nombre_categoria, src.anio_ocurrencia_aprox, 0);

        -- ====================================================================
        -- 3. IDEMPOTENCIA: LIMPIAR CARGA PREVIA DEL MISMO CORTE
        -- ====================================================================
        DELETE FROM dm.HechoResultadosEvaluacion     WHERE sk_tiempo_corte = @sk_tiempo_corte;
        DELETE FROM dm.HechoCumplimientoEvaluaciones WHERE sk_tiempo_corte = @sk_tiempo_corte;
        DELETE FROM dm.HechoContinuidad              WHERE sk_tiempo_corte = @sk_tiempo_corte;

        -- ====================================================================
        -- 4. CARGA DE dm.HechoContinuidad (KPI-03 — REGLA D02)
        --    Evaluar fecha_retiro <= @fecha_corte ANTES que sesiones < 3.
        --    Si se retiró antes de 3 sesiones: Retirado con EsEvaluable = 0.
        -- ====================================================================
        ;WITH BaseAsignaciones AS (
            SELECT
                a.id_asignacion,
                a.id_estudiante,
                a.id_programa,
                p.id_practica_principal,
                a.fecha_retiro,
                CASE
                    WHEN a.fecha_retiro IS NOT NULL AND a.fecha_retiro <= @fecha_corte THEN 1
                    ELSE 0
                END AS es_retirado_al_corte,
                CASE
                    WHEN a.fecha_retiro IS NOT NULL AND a.fecha_retiro <= @fecha_corte THEN a.fecha_retiro
                    ELSE @fecha_corte
                END AS fecha_limite_exigibilidad
              FROM dbo.asignaciones a
              JOIN dbo.programas p ON p.id_programa = a.id_programa
             WHERE a.fecha_inscripcion <= @fecha_corte
        ),
        PrimeraAsistencia AS (
            SELECT
                ba.id_asignacion,
                MIN(s.fecha_sesion) AS fecha_primera_asistencia
              FROM BaseAsignaciones ba
              JOIN dbo.sesiones s
                ON s.id_programa = ba.id_programa
               AND s.estado_sesion = N'REALIZADA'
               AND s.fecha_sesion <= ba.fecha_limite_exigibilidad
              JOIN dbo.asistencias asis
                ON asis.id_asignacion = ba.id_asignacion
               AND asis.id_sesion = s.id_sesion
               AND asis.estado_asistencia = N'ASISTIO'
             GROUP BY ba.id_asignacion
        ),
        SesionesExigiblesDetalle AS (
            SELECT
                ba.id_asignacion,
                s.id_sesion,
                s.fecha_sesion,
                s.numero_sesion,
                asis.estado_asistencia,
                ISNULL(asis.minutos_asistidos, 0) AS minutos_asistidos,
                ROW_NUMBER() OVER (
                    PARTITION BY ba.id_asignacion
                    ORDER BY s.fecha_sesion DESC, s.numero_sesion DESC
                ) AS rn_reciente
              FROM BaseAsignaciones ba
              JOIN PrimeraAsistencia pa
                ON pa.id_asignacion = ba.id_asignacion
              JOIN dbo.sesiones s
                ON s.id_programa = ba.id_programa
               AND s.estado_sesion = N'REALIZADA'
               AND s.fecha_sesion >= pa.fecha_primera_asistencia
               AND s.fecha_sesion <= ba.fecha_limite_exigibilidad
              LEFT JOIN dbo.asistencias asis
                ON asis.id_asignacion = ba.id_asignacion
               AND asis.id_sesion = s.id_sesion
        ),
        ResumenAsistencia AS (
            SELECT
                id_asignacion,
                COUNT(*) AS sesiones_exigibles,
                SUM(CASE WHEN estado_asistencia = N'ASISTIO' THEN 1 ELSE 0 END) AS asistencias,
                SUM(CASE WHEN estado_asistencia = N'INASISTENCIA' THEN 1 ELSE 0 END) AS inasistencias,
                SUM(minutos_asistidos) AS minutos_asistidos,
                MAX(CASE WHEN estado_asistencia = N'ASISTIO' THEN fecha_sesion END) AS fecha_ultima_asistencia,
                MAX(CASE WHEN rn_reciente = 1 AND estado_asistencia = N'ASISTIO' THEN 1 ELSE 0 END) AS asistio_ultima,
                MAX(CASE WHEN rn_reciente <= 3 AND estado_asistencia = N'ASISTIO' THEN 1 ELSE 0 END) AS asistio_ultimas_3
              FROM SesionesExigiblesDetalle
             GROUP BY id_asignacion
        ),
        Clasificado AS (
            SELECT
                ba.id_asignacion,
                ba.id_estudiante,
                ba.id_programa,
                ba.id_practica_principal,
                pa.fecha_primera_asistencia,
                ra.fecha_ultima_asistencia,
                ISNULL(ra.sesiones_exigibles, 0) AS sesiones_exigibles,
                ISNULL(ra.asistencias, 0)        AS asistencias,
                ISNULL(ra.inasistencias, 0)      AS inasistencias,
                ISNULL(ra.minutos_asistidos, 0)  AS minutos_asistidos,
                CAST(CASE WHEN ISNULL(ra.sesiones_exigibles, 0) >= 3 THEN 1 ELSE 0 END AS TINYINT) AS EsEvaluable,
                -- D02: Retiro se evalúa ANTES que sesiones < 3
                CASE
                    WHEN ba.es_retirado_al_corte = 1             THEN N'RETIRADO'
                    WHEN ISNULL(ra.sesiones_exigibles, 0) < 3    THEN N'NO_EVALUABLE'
                    WHEN ISNULL(ra.asistio_ultima, 0) = 1        THEN N'ACTIVO'
                    WHEN ISNULL(ra.asistio_ultimas_3, 0) = 1     THEN N'EN_RIESGO'
                    ELSE N'ABANDONO'
                END AS codigo_estado
              FROM BaseAsignaciones ba
              LEFT JOIN PrimeraAsistencia pa ON pa.id_asignacion = ba.id_asignacion
              LEFT JOIN ResumenAsistencia ra ON ra.id_asignacion = ba.id_asignacion
        )
        INSERT INTO dm.HechoContinuidad (
            sk_tiempo_corte, sk_estudiante, sk_programa, sk_practica, sk_estado_continuidad,
            id_asignacion, EsEvaluable, Continua,
            SesionesExigibles, Asistencias, Inasistencias, MinutosAsistidos,
            fecha_primera_asistencia, fecha_ultima_asistencia, id_ejecucion_etl
        )
        SELECT
            @sk_tiempo_corte,
            de.sk_estudiante,
            dp.sk_programa,
            dpr.sk_practica,
            dec.sk_estado_continuidad,
            c.id_asignacion,
            c.EsEvaluable,
            CAST(CASE WHEN c.codigo_estado IN (N'ACTIVO', N'EN_RIESGO') AND c.EsEvaluable = 1 THEN 1 ELSE 0 END AS TINYINT),
            c.sesiones_exigibles,
            c.asistencias,
            c.inasistencias,
            c.minutos_asistidos,
            c.fecha_primera_asistencia,
            c.fecha_ultima_asistencia,
            @id_ejecucion_etl
          FROM Clasificado c
          JOIN dm.DimEstudiante        de  ON de.id_estudiante = c.id_estudiante
          JOIN dm.DimPrograma          dp  ON dp.id_programa   = c.id_programa
          JOIN dm.DimPractica          dpr ON dpr.id_practica  = c.id_practica_principal
          JOIN dm.DimEstadoContinuidad dec ON dec.codigo_estado = c.codigo_estado
                                          AND dec.EsEvaluable   = c.EsEvaluable;

        SET @filas_continuidad = @@ROWCOUNT;

        -- ====================================================================
        -- 5. DETECCIÓN DE INCIDENCIAS DE CALIDAD EN RESULTADOS VIGENTES
        -- ====================================================================

        -- 5.1 Oportunidades con más de un resultado vigente al corte
        INSERT INTO dm.etl_incidencias_calidad (
            id_ejecucion_etl, fecha_corte, regla_codigo, severidad,
            entidad_origen, id_registro_origen, detalle
        )
        SELECT
            @id_ejecucion_etl,
            @fecha_corte,
            N'DUPLICADO_RESULTADO_VIGENTE',
            N'EXCLUSION',
            N'dbo.oportunidades_evaluacion',
            r.id_oportunidad,
            CONCAT(N'Oportunidad con ', COUNT(*), N' resultados vigentes (es_vigente=1) al corte ', CONVERT(NVARCHAR(10), @fecha_corte, 23), N'. Excluida del hecho de resultados.')
          FROM dbo.resultados_evaluacion r
         WHERE r.es_vigente = 1
           AND r.estado_validez = N'VALIDO'
           AND r.fecha_realizacion <= @fecha_corte
         GROUP BY r.id_oportunidad
        HAVING COUNT(*) > 1;

        SET @incidencias += @@ROWCOUNT;

        -- ====================================================================
        -- 6. CARGA DE dm.HechoCumplimientoEvaluaciones (KPI-04 — REGLA D01)
        --    Elegible cuando aplicable = 1 y fecha_ventana_fin <= @fecha_corte.
        --    Excluye futuras (fecha_ventana_inicio > @fecha_corte) y no aplicables.
        -- ====================================================================
        ;WITH OportunidadesConDuplicado AS (
            SELECT r.id_oportunidad
              FROM dbo.resultados_evaluacion r
             WHERE r.es_vigente = 1
               AND r.estado_validez = N'VALIDO'
               AND r.fecha_realizacion <= @fecha_corte
             GROUP BY r.id_oportunidad
            HAVING COUNT(*) > 1
        ),
        ResultadoVigenteUnico AS (
            SELECT
                r.id_oportunidad,
                r.id_resultado,
                r.puntaje_total,
                r.numero_version,
                r.fecha_realizacion,
                r.en_ventana
              FROM dbo.resultados_evaluacion r
             WHERE r.es_vigente = 1
               AND r.estado_validez = N'VALIDO'
               AND r.fecha_realizacion <= @fecha_corte
               AND NOT EXISTS (
                   SELECT 1 FROM OportunidadesConDuplicado d WHERE d.id_oportunidad = r.id_oportunidad
               )
        ),
        BaseCumplimiento AS (
            SELECT
                op.id_oportunidad,
                op.id_estudiante,
                op.id_programa,
                p.id_practica_principal,
                op.id_instrumento,
                op.id_evento_indice,
                op.momento,
                op.fecha_ventana_fin,
                op.fecha_prevista,
                rv.id_resultado,
                rv.puntaje_total,
                rv.numero_version,
                rv.fecha_realizacion,
                rv.en_ventana,
                -- D01: elegible si fecha_ventana_fin <= @fecha_corte
                CAST(CASE WHEN op.fecha_ventana_fin <= @fecha_corte THEN 1 ELSE 0 END AS TINYINT) AS EsElegible,
                CAST(CASE WHEN op.fecha_ventana_fin <= @fecha_corte AND rv.id_resultado IS NOT NULL THEN 1 ELSE 0 END AS TINYINT) AS EsCompletadaElegible,
                CASE
                    WHEN rv.id_resultado IS NOT NULL AND rv.en_ventana = 1 THEN N'COMPLETADA_EN_VENTANA'
                    WHEN rv.id_resultado IS NOT NULL AND rv.en_ventana = 0 THEN N'COMPLETADA_TARDIA'
                    WHEN rv.id_resultado IS NULL AND op.fecha_ventana_fin > @fecha_corte THEN N'PENDIENTE_EN_VENTANA'
                    ELSE N'VENCIDA'
                END AS codigo_estado_eval
              FROM dbo.oportunidades_evaluacion op
              JOIN dbo.programas p ON p.id_programa = op.id_programa
              LEFT JOIN ResultadoVigenteUnico rv ON rv.id_oportunidad = op.id_oportunidad
             WHERE op.aplicable = 1
               AND op.fecha_ventana_inicio <= @fecha_corte
        )
        INSERT INTO dm.HechoCumplimientoEvaluaciones (
            id_oportunidad, sk_tiempo_corte, sk_tiempo_previsto, sk_tiempo_realizacion,
            sk_estudiante, sk_programa, sk_practica, sk_instrumento, sk_evento_indice,
            sk_momento, sk_estado_evaluacion,
            Oportunidad, EsElegible, EsCompletadaElegible,
            EsEnVentana, EsTardia, EsPendiente, EsVencida,
            PuntajeObtenido, NumeroVersion, id_resultado_vigente, id_ejecucion_etl
        )
        SELECT
            bc.id_oportunidad,
            @sk_tiempo_corte,
            CONVERT(INT, CONVERT(CHAR(8), bc.fecha_prevista, 112)),
            CASE
                WHEN bc.fecha_realizacion IS NOT NULL THEN CONVERT(INT, CONVERT(CHAR(8), bc.fecha_realizacion, 112))
                ELSE -1
            END,
            de.sk_estudiante,
            dp.sk_programa,
            dpr.sk_practica,
            di.sk_instrumento,
            ISNULL(devt.sk_evento_indice, -1),
            dmom.sk_momento,
            deval.sk_estado_evaluacion,
            1,
            bc.EsElegible,
            bc.EsCompletadaElegible,
            CAST(CASE WHEN bc.codigo_estado_eval = N'COMPLETADA_EN_VENTANA' THEN 1 ELSE 0 END AS TINYINT),
            CAST(CASE WHEN bc.codigo_estado_eval = N'COMPLETADA_TARDIA'     THEN 1 ELSE 0 END AS TINYINT),
            CAST(CASE WHEN bc.codigo_estado_eval = N'PENDIENTE_EN_VENTANA'  THEN 1 ELSE 0 END AS TINYINT),
            CAST(CASE WHEN bc.codigo_estado_eval = N'VENCIDA'               THEN 1 ELSE 0 END AS TINYINT),
            bc.puntaje_total,
            bc.numero_version,
            bc.id_resultado,
            @id_ejecucion_etl
          FROM BaseCumplimiento bc
          JOIN dm.DimEstudiante       de    ON de.id_estudiante    = bc.id_estudiante
          JOIN dm.DimPrograma         dp    ON dp.id_programa      = bc.id_programa
          JOIN dm.DimPractica         dpr   ON dpr.id_practica     = bc.id_practica_principal
          JOIN dm.DimInstrumento      di    ON di.id_instrumento   = bc.id_instrumento
          LEFT JOIN dm.DimEventoIndice devt ON devt.id_evento_indice = bc.id_evento_indice
          JOIN dm.DimMomento          dmom  ON dmom.codigo_momento = bc.momento
          JOIN dm.DimEstadoEvaluacion deval ON deval.codigo_estado = bc.codigo_estado_eval;

        SET @filas_cumplimiento = @@ROWCOUNT;

        -- ====================================================================
        -- 7. CARGA DE dm.HechoResultadosEvaluacion (KPI-01, KPI-02, KPI-05)
        --    Solo pares válidos INICIAL-FINAL en ventana (en_ventana = 1),
        --    mismo estudiante, programa, instrumento, versión y mismo evento
        --    índice en PCL-5. Tardías y anomalías quedan excluidas.
        -- ====================================================================

        -- 7.1 Registrar incidencia si existen pares PCL-5 con eventos índice distintos en misma asignación
        INSERT INTO dm.etl_incidencias_calidad (
            id_ejecucion_etl, fecha_corte, regla_codigo, severidad,
            entidad_origen, id_registro_origen, detalle
        )
        SELECT DISTINCT
            @id_ejecucion_etl,
            @fecha_corte,
            N'PCL5_EVENTO_INDICE_DISTINTO',
            N'EXCLUSION',
            N'dbo.asignaciones',
            op_i.id_asignacion,
            CONCAT(
                N'Par PCL-5 con eventos índice distintos (Inicial=', ISNULL(CAST(op_i.id_evento_indice AS NVARCHAR(20)), N'NULL'),
                N', Final=', ISNULL(CAST(op_f.id_evento_indice AS NVARCHAR(20)), N'NULL'),
                N'). Excluido de HechoResultadosEvaluacion.'
            )
          FROM dbo.oportunidades_evaluacion op_i
          JOIN dbo.resultados_evaluacion r_i
            ON r_i.id_oportunidad = op_i.id_oportunidad
           AND r_i.es_vigente = 1 AND r_i.estado_validez = N'VALIDO'
           AND r_i.en_ventana = 1 AND r_i.fecha_realizacion <= @fecha_corte
          JOIN dbo.oportunidades_evaluacion op_f
            ON op_f.id_asignacion = op_i.id_asignacion
           AND op_f.id_instrumento = op_i.id_instrumento
           AND op_f.momento = N'FINAL'
           AND op_f.aplicable = 1
          JOIN dbo.resultados_evaluacion r_f
            ON r_f.id_oportunidad = op_f.id_oportunidad
           AND r_f.es_vigente = 1 AND r_f.estado_validez = N'VALIDO'
           AND r_f.en_ventana = 1 AND r_f.fecha_realizacion <= @fecha_corte
         WHERE op_i.codigo_instrumento = N'PCL-5'
           AND op_i.momento = N'INICIAL'
           AND op_i.aplicable = 1
           AND ISNULL(op_i.id_evento_indice, -1) <> ISNULL(op_f.id_evento_indice, -1)
           AND NOT EXISTS (
               -- Solo reportar si no existe ya un par válido coincidente para ese evento
               SELECT 1
                 FROM dbo.oportunidades_evaluacion op_ok
                 JOIN dbo.resultados_evaluacion r_ok
                   ON r_ok.id_oportunidad = op_ok.id_oportunidad
                  AND r_ok.es_vigente = 1 AND r_ok.estado_validez = N'VALIDO'
                  AND r_ok.en_ventana = 1 AND r_ok.fecha_realizacion <= @fecha_corte
                WHERE op_ok.id_asignacion = op_i.id_asignacion
                  AND op_ok.id_instrumento = op_i.id_instrumento
                  AND op_ok.momento = N'FINAL'
                  AND op_ok.id_evento_indice = op_i.id_evento_indice
           );

        SET @incidencias += @@ROWCOUNT;

        -- 7.2 Registrar incidencia si un par en ventana tiene versiones de formulario incompatibles
        INSERT INTO dm.etl_incidencias_calidad (
            id_ejecucion_etl, fecha_corte, regla_codigo, severidad,
            entidad_origen, id_registro_origen, detalle
        )
        SELECT
            @id_ejecucion_etl,
            @fecha_corte,
            N'VERSION_INSTRUMENTO_DISTINTA',
            N'EXCLUSION',
            N'dbo.asignaciones',
            op_i.id_asignacion,
            CONCAT(
                N'Par ', op_i.codigo_instrumento, N' con versiones de formulario distintas (Inicial=',
                ISNULL(CAST(op_i.id_version_instrumento AS NVARCHAR(20)), N'HEREDADO'),
                N', Final=', ISNULL(CAST(op_f.id_version_instrumento AS NVARCHAR(20)), N'HEREDADO'),
                N'). Excluido de HechoResultadosEvaluacion.'
            )
          FROM dbo.oportunidades_evaluacion op_i
          JOIN dbo.resultados_evaluacion r_i
            ON r_i.id_oportunidad = op_i.id_oportunidad
           AND r_i.es_vigente = 1 AND r_i.estado_validez = N'VALIDO'
           AND r_i.en_ventana = 1 AND r_i.fecha_realizacion <= @fecha_corte
          JOIN dbo.oportunidades_evaluacion op_f
            ON op_f.id_asignacion = op_i.id_asignacion
           AND op_f.id_instrumento = op_i.id_instrumento
           AND op_f.momento = N'FINAL'
           AND op_f.aplicable = 1
           AND (
               (op_i.codigo_instrumento = N'PSS-10' AND op_i.id_evento_indice IS NULL AND op_f.id_evento_indice IS NULL)
               OR
               (op_i.codigo_instrumento = N'PCL-5' AND op_i.id_evento_indice IS NOT NULL AND op_i.id_evento_indice = op_f.id_evento_indice)
           )
          JOIN dbo.resultados_evaluacion r_f
            ON r_f.id_oportunidad = op_f.id_oportunidad
           AND r_f.es_vigente = 1 AND r_f.estado_validez = N'VALIDO'
           AND r_f.en_ventana = 1 AND r_f.fecha_realizacion <= @fecha_corte
         WHERE op_i.momento = N'INICIAL'
           AND op_i.aplicable = 1
           AND ISNULL(op_i.id_version_instrumento, -1) <> ISNULL(op_f.id_version_instrumento, -1);

        SET @incidencias += @@ROWCOUNT;

        -- 7.3 Inserción de pares válidos limpios en dm.HechoResultadosEvaluacion
        ;WITH OportunidadesConDuplicado AS (
            SELECT r.id_oportunidad
              FROM dbo.resultados_evaluacion r
             WHERE r.es_vigente = 1
               AND r.estado_validez = N'VALIDO'
               AND r.fecha_realizacion <= @fecha_corte
             GROUP BY r.id_oportunidad
            HAVING COUNT(*) > 1
        ),
        ResultadosEnVentanaValidos AS (
            SELECT
                op.id_oportunidad,
                op.id_asignacion,
                op.id_estudiante,
                op.id_programa,
                op.id_instrumento,
                op.codigo_instrumento,
                op.id_version_instrumento,
                op.id_evento_indice,
                op.momento,
                r.id_resultado,
                r.puntaje_total,
                r.fecha_realizacion
              FROM dbo.oportunidades_evaluacion op
              JOIN dbo.resultados_evaluacion r
                ON r.id_oportunidad = op.id_oportunidad
             WHERE op.aplicable = 1
               AND r.es_vigente = 1
               AND r.estado_validez = N'VALIDO'
               AND r.en_ventana = 1
               AND r.fecha_realizacion <= @fecha_corte
               AND NOT EXISTS (
                   SELECT 1 FROM OportunidadesConDuplicado d WHERE d.id_oportunidad = op.id_oportunidad
               )
        ),
        ParesValidos AS (
            SELECT
                ini.id_asignacion,
                ini.id_estudiante,
                ini.id_programa,
                p.id_practica_principal,
                ini.id_instrumento,
                ini.codigo_instrumento,
                ini.id_version_instrumento,
                ini.id_evento_indice,
                ini.id_resultado       AS id_resultado_inicial,
                fin.id_resultado       AS id_resultado_final,
                fin.fecha_realizacion  AS fecha_realizacion_final,
                ini.puntaje_total      AS SumaInicial,
                fin.puntaje_total      AS SumaFinal,
                CAST(ini.puntaje_total - fin.puntaje_total AS SMALLINT) AS PuntosReduccion
              FROM ResultadosEnVentanaValidos ini
              JOIN ResultadosEnVentanaValidos fin
                ON fin.id_asignacion  = ini.id_asignacion
               AND fin.id_estudiante  = ini.id_estudiante
               AND fin.id_programa    = ini.id_programa
               AND fin.id_instrumento = ini.id_instrumento
               AND fin.momento        = N'FINAL'
               AND ISNULL(fin.id_version_instrumento, -1) = ISNULL(ini.id_version_instrumento, -1)
               AND (
                   (ini.codigo_instrumento = N'PSS-10' AND ini.id_evento_indice IS NULL AND fin.id_evento_indice IS NULL)
                   OR
                   (ini.codigo_instrumento = N'PCL-5' AND ini.id_evento_indice IS NOT NULL AND ini.id_evento_indice = fin.id_evento_indice)
               )
               AND fin.fecha_realizacion >= ini.fecha_realizacion
              JOIN dbo.programas p ON p.id_programa = ini.id_programa
             WHERE ini.momento = N'INICIAL'
        )
        INSERT INTO dm.HechoResultadosEvaluacion (
            sk_tiempo_corte, sk_tiempo_final, sk_estudiante, sk_programa, sk_practica,
            sk_instrumento, sk_evento_indice,
            id_asignacion, id_resultado_inicial, id_resultado_final, id_version_instrumento,
            ParesValidos, SumaInicial, SumaFinal, PuntosReduccion,
            EsReduccion, EsSinCambio, EsIncremento, CumpleMetaIndividual, id_ejecucion_etl
        )
        SELECT
            @sk_tiempo_corte,
            CONVERT(INT, CONVERT(CHAR(8), pv.fecha_realizacion_final, 112)),
            de.sk_estudiante,
            dp.sk_programa,
            dpr.sk_practica,
            di.sk_instrumento,
            ISNULL(devt.sk_evento_indice, -1),
            pv.id_asignacion,
            pv.id_resultado_inicial,
            pv.id_resultado_final,
            pv.id_version_instrumento,
            1,
            pv.SumaInicial,
            pv.SumaFinal,
            pv.PuntosReduccion,
            CAST(CASE WHEN pv.PuntosReduccion > 0 THEN 1 ELSE 0 END AS TINYINT),
            CAST(CASE WHEN pv.PuntosReduccion = 0 THEN 1 ELSE 0 END AS TINYINT),
            CAST(CASE WHEN pv.PuntosReduccion < 0 THEN 1 ELSE 0 END AS TINYINT),
            CAST(CASE WHEN pv.PuntosReduccion >= di.meta_reduccion_operativa THEN 1 ELSE 0 END AS TINYINT),
            @id_ejecucion_etl
          FROM ParesValidos pv
          JOIN dm.DimEstudiante        de   ON de.id_estudiante     = pv.id_estudiante
          JOIN dm.DimPrograma          dp   ON dp.id_programa       = pv.id_programa
          JOIN dm.DimPractica          dpr  ON dpr.id_practica      = pv.id_practica_principal
          JOIN dm.DimInstrumento       di   ON di.id_instrumento    = pv.id_instrumento
          LEFT JOIN dm.DimEventoIndice devt ON devt.id_evento_indice = pv.id_evento_indice;

        SET @filas_resultados = @@ROWCOUNT;

        COMMIT TRANSACTION;

        -- 8. Actualizar log de ejecución como EXITOSO
        UPDATE dm.etl_log_ejecuciones
           SET fin_ejecucion          = SYSDATETIMEOFFSET(),
               estado                 = N'EXITOSO',
               filas_continuidad      = @filas_continuidad,
               filas_cumplimiento     = @filas_cumplimiento,
               filas_resultados       = @filas_resultados,
               incidencias_detectadas = @incidencias,
               mensaje                = CONCAT(
                   N'Carga exitosa al corte ', CONVERT(NVARCHAR(10), @fecha_corte, 23),
                   N'. Cont=', @filas_continuidad,
                   N', Cump=', @filas_cumplimiento,
                   N', Res=', @filas_resultados,
                   N', Inc=', @incidencias
               )
         WHERE id_ejecucion_etl = @id_ejecucion_etl;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @err_msg NVARCHAR(500) = LEFT(ERROR_MESSAGE(), 500);

        UPDATE dm.etl_log_ejecuciones
           SET fin_ejecucion = SYSDATETIMEOFFSET(),
               estado        = N'ERROR',
               mensaje       = @err_msg
         WHERE id_ejecucion_etl = @id_ejecucion_etl;

        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- CARGA INICIAL PARA CORTES CLAVE DEL SEMESTRE 2026-II (INCLUYENDO 2026-11-23)
-- ============================================================================
EXEC dm.usp_ejecutar_etl @fecha_corte = '2026-09-15';
EXEC dm.usp_ejecutar_etl @fecha_corte = '2026-10-15';
EXEC dm.usp_ejecutar_etl @fecha_corte = '2026-11-05';
EXEC dm.usp_ejecutar_etl @fecha_corte = '2026-11-23';
GO

SELECT
    id_ejecucion_etl,
    fecha_corte,
    estado,
    filas_continuidad,
    filas_cumplimiento,
    filas_resultados,
    incidencias_detectadas,
    mensaje
  FROM dm.etl_log_ejecuciones
 ORDER BY id_ejecucion_etl;
GO

PRINT N'Proceso ETL dm.usp_ejecutar_etl creado y carga inicial 2026-II completada.';
GO
