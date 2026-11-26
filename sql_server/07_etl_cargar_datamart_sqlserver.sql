/* ============================================================================
   ARCHIVO:  07_etl_cargar_datamart_sqlserver.sql
   PROYECTO: MMET_BI — Proceso ETL Incremental e Idempotente (esquema dm)
   ÁMBITO:   Universidad Nacional de Trujillo (Semestre 2026-II)
   MOTOR:    Microsoft SQL Server 2019 / 2022 (T-SQL)
   ============================================================================
   Uso en SSMS o sqlcmd:
     sqlcmd -S localhost -E -C -i "sql_server\07_etl_cargar_datamart_sqlserver.sql"

   Implementa:
     - [MMET_BI_DM].dm.usp_ejecutar_etl @fecha_corte DATE
       * MERGE incremental en dimensiones dm.Dim* (actualiza solo cambios reales).
       * MERGE idempotente por @sk_tiempo_corte en dm.Hecho* (sin borrar cortes previos).
       * Validaciones independientes RQ-BI-13 (duplicados, faltantes, puntajes
         inválidos, eventos índice inconsistentes y fechas fuera de rango) usando
         variable de tabla @incidencias para preservar trazabilidad ante ROLLBACK.
     - Ejecución inicial para cortes clave del semestre 2026-II, incluyendo
       el corte oficial 2026-11-23.
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE MMET_BI_DM;
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
    DECLARE @total_incidencias    INT = 0;

    -- Variable de tabla: NO se revierte ante ROLLBACK TRANSACTION (RQ-BI-13)
    DECLARE @incidencias TABLE (
        regla_codigo       NVARCHAR(40)  NOT NULL,
        severidad          NVARCHAR(15)  NOT NULL,
        entidad_origen     NVARCHAR(60)  NOT NULL,
        id_registro_origen BIGINT        NULL,
        detalle            NVARCHAR(500) NOT NULL
    );

    -- 1. Registrar inicio de ejecución en tabla de control (fuera de la transacción de carga)
    INSERT INTO dm.etl_log_ejecuciones (fecha_corte, estado, mensaje)
    VALUES (@fecha_corte, N'EN_PROCESO', N'Ejecución ETL iniciada.');
    SET @id_ejecucion_etl = SCOPE_IDENTITY();

    IF NOT EXISTS (SELECT 1 FROM dm.DimTiempo WHERE sk_tiempo = @sk_tiempo_corte AND es_no_aplica = 0)
    BEGIN
        INSERT INTO dm.etl_incidencias_calidad (
            id_ejecucion_etl, fecha_corte, regla_codigo, severidad,
            entidad_origen, id_registro_origen, detalle
        )
        VALUES (
            @id_ejecucion_etl, @fecha_corte, N'FECHA_CORTE_INVALIDA', N'ERROR',
            N'dm.DimTiempo', NULL,
            CONCAT(N'La fecha de corte ', CONVERT(NVARCHAR(10), @fecha_corte, 23), N' no existe en dm.DimTiempo.')
        );

        UPDATE dm.etl_log_ejecuciones
           SET fin_ejecucion          = SYSDATETIMEOFFSET(),
               estado                 = N'ERROR',
               incidencias_detectadas = 1,
               mensaje                = N'La fecha de corte especificada no existe en dm.DimTiempo.'
         WHERE id_ejecucion_etl = @id_ejecucion_etl;

        THROW 52001, N'La fecha de corte especificada no existe en dm.DimTiempo.', 1;
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        -- ====================================================================
        -- 2. VALIDACIONES INDEPENDIENTES DE CALIDAD DE DATOS (RQ-BI-13)
        --    Todas las anomalías se acumulan en @incidencias (sobreviven ROLLBACK).
        -- ====================================================================

        -- 2.A DUPLICADOS
        -- 2.A.1 Oportunidades con más de un resultado vigente válido al corte
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'DUPLICADO_RESULTADO_VIGENTE',
            N'EXCLUSION',
            N'dbo.oportunidades_evaluacion',
            r.id_oportunidad,
            CONCAT(N'Oportunidad con ', COUNT(*), N' resultados vigentes (es_vigente=1) al corte ', CONVERT(NVARCHAR(10), @fecha_corte, 23), N'. Excluida de hechos.')
          FROM [MMET_BI_OLTP].dbo.resultados_evaluacion r
         WHERE r.es_vigente = 1
           AND r.estado_validez = N'VALIDO'
           AND r.fecha_realizacion <= @fecha_corte
         GROUP BY r.id_oportunidad
        HAVING COUNT(*) > 1;

        -- 2.A.2 Códigos de estudiante duplicados
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'DUPLICADO_ESTUDIANTE_CODIGO',
            N'ADVERTENCIA',
            N'dbo.estudiantes',
            MIN(e.id_estudiante),
            CONCAT(N'Código de estudiante duplicado (', e.codigo_estudiante, N', repeticiones=', COUNT(*), N').')
          FROM [MMET_BI_OLTP].dbo.estudiantes e
         GROUP BY e.codigo_estudiante
        HAVING COUNT(*) > 1;

        -- 2.A.3 Asignaciones duplicadas (mismo estudiante y programa)
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'DUPLICADO_ASIGNACION',
            N'EXCLUSION',
            N'dbo.asignaciones',
            MIN(a.id_asignacion),
            CONCAT(N'Asignación duplicada para estudiante=', a.id_estudiante, N', programa=', a.id_programa, N' (total=', COUNT(*), N').')
          FROM [MMET_BI_OLTP].dbo.asignaciones a
         WHERE a.fecha_inscripcion <= @fecha_corte
         GROUP BY a.id_estudiante, a.id_programa
        HAVING COUNT(*) > 1;

        -- 2.A.4 Asistencias duplicadas (misma asignación y sesión)
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'DUPLICADO_ASISTENCIA',
            N'ADVERTENCIA',
            N'dbo.asistencias',
            MIN(asis.id_asistencia),
            CONCAT(N'Asistencia duplicada para asignacion=', asis.id_asignacion, N', sesion=', asis.id_sesion, N' (total=', COUNT(*), N').')
          FROM [MMET_BI_OLTP].dbo.asistencias asis
         GROUP BY asis.id_asignacion, asis.id_sesion
        HAVING COUNT(*) > 1;

        -- 2.A.5 Oportunidades aplicables duplicadas en misma asignación/instrumento/momento/evento
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'DUPLICADO_OPORTUNIDAD',
            N'EXCLUSION',
            N'dbo.oportunidades_evaluacion',
            MIN(op.id_oportunidad),
            CONCAT(
                N'Oportunidad duplicada en asignacion=', op.id_asignacion,
                N', instrumento=', op.codigo_instrumento,
                N', momento=', op.momento,
                N', evento=', ISNULL(CAST(op.id_evento_indice AS NVARCHAR(20)), N'NULL'),
                N' (total=', COUNT(*), N').'
            )
          FROM [MMET_BI_OLTP].dbo.oportunidades_evaluacion op
         WHERE op.aplicable = 1
           AND op.fecha_ventana_inicio <= @fecha_corte
         GROUP BY op.id_asignacion, op.id_instrumento, op.codigo_instrumento, op.momento, op.id_evento_indice
        HAVING COUNT(*) > 1;

        -- 2.B FALTANTES RELEVANTES
        -- 2.B.1 Atributos obligatorios faltantes en estudiantes
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'FALTANTE_ESTUDIANTE',
            N'ADVERTENCIA',
            N'dbo.estudiantes',
            e.id_estudiante,
            N'Estudiante con atributo analítico faltante o vacío (facultad, carrera, sexo o edad).'
          FROM [MMET_BI_OLTP].dbo.estudiantes e
         WHERE LTRIM(RTRIM(ISNULL(e.codigo_estudiante, N''))) = N''
            OR LTRIM(RTRIM(ISNULL(e.facultad_o_area, N''))) = N''
            OR LTRIM(RTRIM(ISNULL(e.carrera, N''))) = N''
            OR LTRIM(RTRIM(ISNULL(e.sexo_codificado, N''))) = N''
            OR e.edad_anios IS NULL OR e.edad_anios <= 0;

        -- 2.B.2 Atributos obligatorios faltantes en programas
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'FALTANTE_PROGRAMA',
            N'ADVERTENCIA',
            N'dbo.programas',
            p.id_programa,
            N'Programa sin práctica principal o sin fechas de inicio/cierre.'
          FROM [MMET_BI_OLTP].dbo.programas p
         WHERE p.id_practica_principal IS NULL
            OR p.fecha_inicio IS NULL
            OR p.fecha_cierre IS NULL;

        -- 2.B.3 Oportunidades aplicables sin fechas de ventana o fecha prevista
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'FALTANTE_VENTANA_OPORTUNIDAD',
            N'EXCLUSION',
            N'dbo.oportunidades_evaluacion',
            op.id_oportunidad,
            N'Oportunidad aplicable sin fecha_prevista, fecha_ventana_inicio o fecha_ventana_fin.'
          FROM [MMET_BI_OLTP].dbo.oportunidades_evaluacion op
         WHERE op.aplicable = 1
           AND (op.fecha_prevista IS NULL OR op.fecha_ventana_inicio IS NULL OR op.fecha_ventana_fin IS NULL);

        -- 2.B.4 Resultados vigentes válidos sin puntaje o sin fecha de realización
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'FALTANTE_RESULTADO',
            N'EXCLUSION',
            N'dbo.resultados_evaluacion',
            r.id_resultado,
            N'Resultado vigente válido sin puntaje_total o sin fecha_realizacion.'
          FROM [MMET_BI_OLTP].dbo.resultados_evaluacion r
         WHERE r.es_vigente = 1
           AND r.estado_validez = N'VALIDO'
           AND (r.puntaje_total IS NULL OR r.fecha_realizacion IS NULL);

        -- 2.C PUNTAJES INVÁLIDOS (comprobación independiente del ETL)
        -- 2.C.1 Puntaje fuera del rango oficial del instrumento (PSS-10: 0..40, PCL-5: 0..80)
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'PUNTAJE_FUERA_RANGO',
            N'EXCLUSION',
            N'dbo.resultados_evaluacion',
            r.id_resultado,
            CONCAT(
                N'Puntaje fuera de rango para ', ci.codigo_instrumento,
                N': obtenido=', r.puntaje_total,
                N', permitido=[', ci.puntaje_minimo, N'..', ci.puntaje_maximo, N']. Excluido de hechos.'
            )
          FROM [MMET_BI_OLTP].dbo.resultados_evaluacion r
          JOIN [MMET_BI_OLTP].dbo.oportunidades_evaluacion op ON op.id_oportunidad = r.id_oportunidad
          JOIN [MMET_BI_OLTP].dbo.cat_instrumentos ci ON ci.id_instrumento = op.id_instrumento
         WHERE r.es_vigente = 1
           AND r.estado_validez = N'VALIDO'
           AND r.fecha_realizacion <= @fecha_corte
           AND (r.puntaje_total < ci.puntaje_minimo OR r.puntaje_total > ci.puntaje_maximo);

        -- 2.C.2 Discrepancia entre puntaje_total y suma de ítems puntuados (cuando existen respuestas)
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'PUNTAJE_INCONSISTENTE_ITEMS',
            N'ADVERTENCIA',
            N'dbo.resultados_evaluacion',
            r.id_resultado,
            CONCAT(
                N'Discrepancia entre puntaje_total (', r.puntaje_total,
                N') y suma de ítems en respuestas_evaluacion (', s.suma_items, N').'
            )
          FROM [MMET_BI_OLTP].dbo.resultados_evaluacion r
          JOIN (
              SELECT id_resultado, SUM(CAST(valor_puntuado AS INT)) AS suma_items
                FROM [MMET_BI_OLTP].dbo.respuestas_evaluacion
               GROUP BY id_resultado
          ) s ON s.id_resultado = r.id_resultado
         WHERE r.es_vigente = 1
           AND r.estado_validez = N'VALIDO'
           AND r.fecha_realizacion <= @fecha_corte
           AND r.puntaje_total <> s.suma_items;

        -- 2.D EVENTOS ÍNDICE INCONSISTENTES
        -- 2.D.1 Oportunidad PCL-5 aplicable sin evento índice
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'PCL5_SIN_EVENTO_INDICE',
            N'EXCLUSION',
            N'dbo.oportunidades_evaluacion',
            op.id_oportunidad,
            N'Oportunidad PCL-5 aplicable sin id_evento_indice asociado. Excluida de pares PCL-5.'
          FROM [MMET_BI_OLTP].dbo.oportunidades_evaluacion op
         WHERE op.aplicable = 1
           AND op.codigo_instrumento = N'PCL-5'
           AND op.fecha_ventana_inicio <= @fecha_corte
           AND op.id_evento_indice IS NULL;

        -- 2.D.2 Oportunidad PSS-10 aplicable con evento índice asignado (inconsistencia de instrumento)
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'PSS10_CON_EVENTO_INDICE',
            N'EXCLUSION',
            N'dbo.oportunidades_evaluacion',
            op.id_oportunidad,
            CONCAT(N'Oportunidad PSS-10 vinculada erróneamente a id_evento_indice=', op.id_evento_indice, N'. Excluida de pares.')
          FROM [MMET_BI_OLTP].dbo.oportunidades_evaluacion op
         WHERE op.aplicable = 1
           AND op.codigo_instrumento = N'PSS-10'
           AND op.fecha_ventana_inicio <= @fecha_corte
           AND op.id_evento_indice IS NOT NULL;

        -- 2.D.3 Evento índice asociado a un estudiante distinto al de la oportunidad
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'EVENTO_INDICE_ESTUDIANTE_MISMATCH',
            N'EXCLUSION',
            N'dbo.oportunidades_evaluacion',
            op.id_oportunidad,
            CONCAT(
                N'Evento índice ', op.id_evento_indice,
                N' pertenece a estudiante=', ei.id_estudiante,
                N', pero oportunidad corresponde a estudiante=', op.id_estudiante, N'.'
            )
          FROM [MMET_BI_OLTP].dbo.oportunidades_evaluacion op
          JOIN [MMET_BI_OLTP].dbo.eventos_indice ei ON ei.id_evento_indice = op.id_evento_indice
         WHERE op.aplicable = 1
           AND op.fecha_ventana_inicio <= @fecha_corte
           AND ei.id_estudiante <> op.id_estudiante;

        -- 2.D.4 Pares PCL-5 con eventos índice distintos en la misma asignación
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT DISTINCT
            N'PCL5_EVENTO_INDICE_DISTINTO',
            N'EXCLUSION',
            N'dbo.asignaciones',
            op_i.id_asignacion,
            CONCAT(
                N'Par PCL-5 con eventos índice distintos (Inicial=', ISNULL(CAST(op_i.id_evento_indice AS NVARCHAR(20)), N'NULL'),
                N', Final=', ISNULL(CAST(op_f.id_evento_indice AS NVARCHAR(20)), N'NULL'),
                N'). Excluido de HechoResultadosEvaluacion.'
            )
          FROM [MMET_BI_OLTP].dbo.oportunidades_evaluacion op_i
          JOIN [MMET_BI_OLTP].dbo.resultados_evaluacion r_i
            ON r_i.id_oportunidad = op_i.id_oportunidad
           AND r_i.es_vigente = 1 AND r_i.estado_validez = N'VALIDO'
           AND r_i.en_ventana = 1 AND r_i.fecha_realizacion <= @fecha_corte
          JOIN [MMET_BI_OLTP].dbo.oportunidades_evaluacion op_f
            ON op_f.id_asignacion = op_i.id_asignacion
           AND op_f.id_instrumento = op_i.id_instrumento
           AND op_f.momento = N'FINAL'
           AND op_f.aplicable = 1
          JOIN [MMET_BI_OLTP].dbo.resultados_evaluacion r_f
            ON r_f.id_oportunidad = op_f.id_oportunidad
           AND r_f.es_vigente = 1 AND r_f.estado_validez = N'VALIDO'
           AND r_f.en_ventana = 1 AND r_f.fecha_realizacion <= @fecha_corte
         WHERE op_i.codigo_instrumento = N'PCL-5'
           AND op_i.momento = N'INICIAL'
           AND op_i.aplicable = 1
           AND ISNULL(op_i.id_evento_indice, -1) <> ISNULL(op_f.id_evento_indice, -1)
           AND NOT EXISTS (
               SELECT 1
                 FROM [MMET_BI_OLTP].dbo.oportunidades_evaluacion op_ok
                 JOIN [MMET_BI_OLTP].dbo.resultados_evaluacion r_ok
                   ON r_ok.id_oportunidad = op_ok.id_oportunidad
                  AND r_ok.es_vigente = 1 AND r_ok.estado_validez = N'VALIDO'
                  AND r_ok.en_ventana = 1 AND r_ok.fecha_realizacion <= @fecha_corte
                WHERE op_ok.id_asignacion = op_i.id_asignacion
                  AND op_ok.id_instrumento = op_i.id_instrumento
                  AND op_ok.momento = N'FINAL'
                  AND op_ok.id_evento_indice = op_i.id_evento_indice
           );

        -- 2.D.5 Pares en ventana con versiones de formulario incompatibles
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
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
          FROM [MMET_BI_OLTP].dbo.oportunidades_evaluacion op_i
          JOIN [MMET_BI_OLTP].dbo.resultados_evaluacion r_i
            ON r_i.id_oportunidad = op_i.id_oportunidad
           AND r_i.es_vigente = 1 AND r_i.estado_validez = N'VALIDO'
           AND r_i.en_ventana = 1 AND r_i.fecha_realizacion <= @fecha_corte
          JOIN [MMET_BI_OLTP].dbo.oportunidades_evaluacion op_f
            ON op_f.id_asignacion = op_i.id_asignacion
           AND op_f.id_instrumento = op_i.id_instrumento
           AND op_f.momento = N'FINAL'
           AND op_f.aplicable = 1
           AND (
               (op_i.codigo_instrumento = N'PSS-10' AND op_i.id_evento_indice IS NULL AND op_f.id_evento_indice IS NULL)
               OR
               (op_i.codigo_instrumento = N'PCL-5' AND op_i.id_evento_indice IS NOT NULL AND op_i.id_evento_indice = op_f.id_evento_indice)
           )
          JOIN [MMET_BI_OLTP].dbo.resultados_evaluacion r_f
            ON r_f.id_oportunidad = op_f.id_oportunidad
           AND r_f.es_vigente = 1 AND r_f.estado_validez = N'VALIDO'
           AND r_f.en_ventana = 1 AND r_f.fecha_realizacion <= @fecha_corte
         WHERE op_i.momento = N'INICIAL'
           AND op_i.aplicable = 1
           AND ISNULL(op_i.id_version_instrumento, -1) <> ISNULL(op_f.id_version_instrumento, -1);

        -- 2.E FECHAS FUERA DE RANGO
        -- 2.E.1 Evaluaciones realizadas fuera de su ventana reglamentaria [fecha_ventana_inicio, fecha_ventana_fin]
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'FECHA_FUERA_VENTANA',
            N'ADVERTENCIA',
            N'dbo.resultados_evaluacion',
            r.id_resultado,
            CONCAT(
                N'Evaluación ', op.codigo_instrumento, N' (', op.momento, N') realizada el ',
                CONVERT(NVARCHAR(10), r.fecha_realizacion, 23),
                N' fuera de ventana [', CONVERT(NVARCHAR(10), op.fecha_ventana_inicio, 23),
                N' .. ', CONVERT(NVARCHAR(10), op.fecha_ventana_fin, 23), N']. Excluida de pares.'
            )
          FROM [MMET_BI_OLTP].dbo.resultados_evaluacion r
          JOIN [MMET_BI_OLTP].dbo.oportunidades_evaluacion op ON op.id_oportunidad = r.id_oportunidad
         WHERE op.aplicable = 1
           AND r.es_vigente = 1
           AND r.estado_validez = N'VALIDO'
           AND r.fecha_realizacion <= @fecha_corte
           AND (
               r.en_ventana = 0
               OR r.fecha_realizacion < op.fecha_ventana_inicio
               OR r.fecha_realizacion > op.fecha_ventana_fin
           );

        -- 2.E.2 Par INICIAL-FINAL con orden cronológico invertido (FINAL < INICIAL)
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'FECHA_ORDEN_INVERTIDO',
            N'EXCLUSION',
            N'dbo.asignaciones',
            op_i.id_asignacion,
            CONCAT(
                N'Par ', op_i.codigo_instrumento, N' con fecha FINAL (',
                CONVERT(NVARCHAR(10), r_f.fecha_realizacion, 23),
                N') anterior a fecha INICIAL (',
                CONVERT(NVARCHAR(10), r_i.fecha_realizacion, 23),
                N'). Excluido de HechoResultadosEvaluacion.'
            )
          FROM [MMET_BI_OLTP].dbo.oportunidades_evaluacion op_i
          JOIN [MMET_BI_OLTP].dbo.resultados_evaluacion r_i
            ON r_i.id_oportunidad = op_i.id_oportunidad
           AND r_i.es_vigente = 1 AND r_i.estado_validez = N'VALIDO'
           AND r_i.fecha_realizacion <= @fecha_corte
          JOIN [MMET_BI_OLTP].dbo.oportunidades_evaluacion op_f
            ON op_f.id_asignacion = op_i.id_asignacion
           AND op_f.id_instrumento = op_i.id_instrumento
           AND op_f.momento = N'FINAL'
           AND op_f.aplicable = 1
           AND ISNULL(op_f.id_evento_indice, -1) = ISNULL(op_i.id_evento_indice, -1)
          JOIN [MMET_BI_OLTP].dbo.resultados_evaluacion r_f
            ON r_f.id_oportunidad = op_f.id_oportunidad
           AND r_f.es_vigente = 1 AND r_f.estado_validez = N'VALIDO'
           AND r_f.fecha_realizacion <= @fecha_corte
         WHERE op_i.momento = N'INICIAL'
           AND op_i.aplicable = 1
           AND r_f.fecha_realizacion < r_i.fecha_realizacion;

        -- 2.E.3 Programas con fecha_cierre < fecha_inicio
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'FECHA_PROGRAMA_INVALIDA',
            N'ADVERTENCIA',
            N'dbo.programas',
            p.id_programa,
            CONCAT(
                N'Programa ', p.codigo_programa, N' con fecha_cierre (',
                CONVERT(NVARCHAR(10), p.fecha_cierre, 23),
                N') anterior a fecha_inicio (', CONVERT(NVARCHAR(10), p.fecha_inicio, 23), N').'
            )
          FROM [MMET_BI_OLTP].dbo.programas p
         WHERE p.fecha_cierre < p.fecha_inicio;

        -- 2.E.4 Sesiones con fecha fuera del rango del programa
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'FECHA_SESION_FUERA_PROGRAMA',
            N'ADVERTENCIA',
            N'dbo.sesiones',
            s.id_sesion,
            CONCAT(
                N'Sesión ', s.id_sesion, N' con fecha ', CONVERT(NVARCHAR(10), s.fecha_sesion, 23),
                N' fuera del rango del programa [', CONVERT(NVARCHAR(10), p.fecha_inicio, 23),
                N' .. ', CONVERT(NVARCHAR(10), p.fecha_cierre, 23), N'].'
            )
          FROM [MMET_BI_OLTP].dbo.sesiones s
          JOIN [MMET_BI_OLTP].dbo.programas p ON p.id_programa = s.id_programa
         WHERE s.fecha_sesion < p.fecha_inicio OR s.fecha_sesion > p.fecha_cierre;

        -- 2.E.5 Asistencias registradas sobre sesiones que no están en estado REALIZADA
        INSERT INTO @incidencias (regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
        SELECT
            N'ASISTENCIA_SESION_NO_REALIZADA',
            N'ADVERTENCIA',
            N'dbo.asistencias',
            asis.id_asistencia,
            CONCAT(
                N'Asistencia (', asis.estado_asistencia, N') registrada en sesión ', s.id_sesion,
                N' cuyo estado es ', s.estado_sesion, N'.'
            )
          FROM [MMET_BI_OLTP].dbo.asistencias asis
          JOIN [MMET_BI_OLTP].dbo.sesiones s ON s.id_sesion = asis.id_sesion
         WHERE asis.estado_asistencia IN (N'ASISTIO', N'INASISTENCIA')
           AND s.estado_sesion <> N'REALIZADA'
           AND s.fecha_sesion <= @fecha_corte;

        -- ====================================================================
        -- 3. SINCRONIZACIÓN INCREMENTAL DE DIMENSIONES DINÁMICAS (MERGE)
        --    Solo actualiza filas cuando existe cambio real en algún atributo.
        -- ====================================================================

        -- 3.1 DimEstudiante (minimización de datos: NO copia nombres, apellidos ni correo_institucional)
        MERGE dm.DimEstudiante AS tgt
        USING (
            SELECT
                e.id_estudiante,
                e.codigo_estudiante,
                e.edad_anios,
                CASE
                    WHEN e.edad_anios BETWEEN 18 AND 20 THEN N'18-20'
                    WHEN e.edad_anios BETWEEN 21 AND 24 THEN N'21-24'
                    ELSE N'25+'
                END AS grupo_etario,
                e.sexo_codificado,
                e.facultad_o_area,
                e.carrera,
                e.ciclo_academico
              FROM [MMET_BI_OLTP].dbo.estudiantes e
        ) AS src
           ON tgt.id_estudiante = src.id_estudiante
        WHEN MATCHED AND (
               tgt.codigo_estudiante <> src.codigo_estudiante
            OR tgt.edad_anios        <> src.edad_anios
            OR tgt.grupo_etario      <> src.grupo_etario
            OR tgt.sexo_codificado   <> src.sexo_codificado
            OR tgt.facultad_o_area   <> src.facultad_o_area
            OR tgt.carrera           <> src.carrera
            OR tgt.ciclo_academico   <> src.ciclo_academico
        ) THEN
            UPDATE SET
                tgt.codigo_estudiante = src.codigo_estudiante,
                tgt.edad_anios        = src.edad_anios,
                tgt.grupo_etario      = src.grupo_etario,
                tgt.sexo_codificado   = src.sexo_codificado,
                tgt.facultad_o_area   = src.facultad_o_area,
                tgt.carrera           = src.carrera,
                tgt.ciclo_academico   = src.ciclo_academico
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (id_estudiante, codigo_estudiante, edad_anios, grupo_etario, sexo_codificado, facultad_o_area, carrera, ciclo_academico)
            VALUES (src.id_estudiante, src.codigo_estudiante, src.edad_anios, src.grupo_etario, src.sexo_codificado, src.facultad_o_area, src.carrera, src.ciclo_academico);

        -- 3.2 DimPrograma
        MERGE dm.DimPrograma AS tgt
        USING [MMET_BI_OLTP].dbo.programas AS src
           ON tgt.id_programa = src.id_programa
        WHEN MATCHED AND (
               tgt.codigo_programa   <> src.codigo_programa
            OR tgt.nombre_programa   <> src.nombre_programa
            OR tgt.periodo_academico <> src.periodo_academico
            OR tgt.fecha_inicio      <> src.fecha_inicio
            OR tgt.fecha_cierre      <> src.fecha_cierre
            OR tgt.estado_programa   <> src.estado_programa
        ) THEN
            UPDATE SET
                tgt.codigo_programa   = src.codigo_programa,
                tgt.nombre_programa   = src.nombre_programa,
                tgt.periodo_academico = src.periodo_academico,
                tgt.fecha_inicio      = src.fecha_inicio,
                tgt.fecha_cierre      = src.fecha_cierre,
                tgt.estado_programa   = src.estado_programa
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (id_programa, codigo_programa, nombre_programa, periodo_academico, fecha_inicio, fecha_cierre, estado_programa)
            VALUES (src.id_programa, src.codigo_programa, src.nombre_programa, src.periodo_academico, src.fecha_inicio, src.fecha_cierre, src.estado_programa);

        -- 3.3 DimPractica (P-01..P-04 y MIXTO)
        MERGE dm.DimPractica AS tgt
        USING (
            SELECT
                cp.id_practica,
                cp.codigo_practica,
                cp.nombre_practica,
                CASE WHEN cp.es_mixto = 1 THEN N'Mixto' ELSE N'Unicomponente' END AS tipo_practica,
                cp.es_mixto
              FROM [MMET_BI_OLTP].dbo.cat_practicas cp
        ) AS src
           ON tgt.id_practica = src.id_practica
        WHEN MATCHED AND (
               tgt.codigo_practica <> src.codigo_practica
            OR tgt.nombre_practica <> src.nombre_practica
            OR tgt.tipo_practica   <> src.tipo_practica
            OR tgt.es_mixto        <> src.es_mixto
        ) THEN
            UPDATE SET
                tgt.codigo_practica = src.codigo_practica,
                tgt.nombre_practica = src.nombre_practica,
                tgt.tipo_practica   = src.tipo_practica,
                tgt.es_mixto        = src.es_mixto
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (id_practica, codigo_practica, nombre_practica, tipo_practica, es_mixto)
            VALUES (src.id_practica, src.codigo_practica, src.nombre_practica, src.tipo_practica, src.es_mixto);

        -- 3.4 DimInstrumento (PSS-10 y PCL-5 estrictamente separados)
        MERGE dm.DimInstrumento AS tgt
        USING (
            SELECT
                ci.id_instrumento,
                ci.codigo_instrumento,
                ci.version_instrumento,
                ci.nombre_instrumento,
                ci.puntaje_minimo,
                ci.puntaje_maximo,
                CAST(CASE WHEN ci.codigo_instrumento = N'PSS-10' THEN 4.00 ELSE 10.00 END AS DECIMAL(5,2)) AS meta_reduccion_operativa,
                ci.requiere_evento_indice
              FROM [MMET_BI_OLTP].dbo.cat_instrumentos ci
        ) AS src
           ON tgt.id_instrumento = src.id_instrumento
        WHEN MATCHED AND (
               tgt.codigo_instrumento       <> src.codigo_instrumento
            OR tgt.version_instrumento      <> src.version_instrumento
            OR tgt.nombre_instrumento       <> src.nombre_instrumento
            OR tgt.puntaje_minimo           <> src.puntaje_minimo
            OR tgt.puntaje_maximo           <> src.puntaje_maximo
            OR tgt.meta_reduccion_operativa <> src.meta_reduccion_operativa
            OR tgt.requiere_evento_indice   <> src.requiere_evento_indice
        ) THEN
            UPDATE SET
                tgt.codigo_instrumento       = src.codigo_instrumento,
                tgt.version_instrumento      = src.version_instrumento,
                tgt.nombre_instrumento       = src.nombre_instrumento,
                tgt.puntaje_minimo           = src.puntaje_minimo,
                tgt.puntaje_maximo           = src.puntaje_maximo,
                tgt.meta_reduccion_operativa = src.meta_reduccion_operativa,
                tgt.requiere_evento_indice   = src.requiere_evento_indice
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (
                id_instrumento, codigo_instrumento, version_instrumento, nombre_instrumento,
                puntaje_minimo, puntaje_maximo, meta_reduccion_operativa, requiere_evento_indice
            )
            VALUES (
                src.id_instrumento, src.codigo_instrumento, src.version_instrumento, src.nombre_instrumento,
                src.puntaje_minimo, src.puntaje_maximo, src.meta_reduccion_operativa, src.requiere_evento_indice
            );

        -- 3.5 DimEventoIndice (preserva fila -1 'No aplica'; minimización de datos)
        MERGE dm.DimEventoIndice AS tgt
        USING (
            SELECT
                ei.id_evento_indice,
                ei.codigo_evento_local,
                cat.codigo_categoria,
                cat.nombre_categoria,
                ei.anio_ocurrencia_aprox
              FROM [MMET_BI_OLTP].dbo.eventos_indice ei
              JOIN [MMET_BI_OLTP].dbo.cat_categorias_evento_indice cat
                ON cat.id_categoria_evento = ei.id_categoria_evento
        ) AS src
           ON tgt.id_evento_indice = src.id_evento_indice
        WHEN MATCHED AND (
               tgt.codigo_evento_local                 <> src.codigo_evento_local
            OR tgt.codigo_categoria                    <> src.codigo_categoria
            OR tgt.nombre_categoria                    <> src.nombre_categoria
            OR ISNULL(tgt.anio_ocurrencia_aprox, -1)   <> ISNULL(src.anio_ocurrencia_aprox, -1)
        ) THEN
            UPDATE SET
                tgt.codigo_evento_local   = src.codigo_evento_local,
                tgt.codigo_categoria      = src.codigo_categoria,
                tgt.nombre_categoria      = src.nombre_categoria,
                tgt.anio_ocurrencia_aprox = src.anio_ocurrencia_aprox
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (id_evento_indice, codigo_evento_local, codigo_categoria, nombre_categoria, anio_ocurrencia_aprox, es_no_aplica)
            VALUES (src.id_evento_indice, src.codigo_evento_local, src.codigo_categoria, src.nombre_categoria, src.anio_ocurrencia_aprox, 0);

        -- ====================================================================
        -- 4. MERGE POR @sk_tiempo_corte EN dm.HechoContinuidad (KPI-03 — D02)
        --    No borra cortes previos; solo sincroniza el corte actual.
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
              FROM [MMET_BI_OLTP].dbo.asignaciones a
              JOIN [MMET_BI_OLTP].dbo.programas p ON p.id_programa = a.id_programa
             WHERE a.fecha_inscripcion <= @fecha_corte
        ),
        PrimeraAsistencia AS (
            SELECT
                ba.id_asignacion,
                MIN(s.fecha_sesion) AS fecha_primera_asistencia
              FROM BaseAsignaciones ba
              JOIN [MMET_BI_OLTP].dbo.sesiones s
                ON s.id_programa = ba.id_programa
               AND s.estado_sesion = N'REALIZADA'
               AND s.fecha_sesion <= ba.fecha_limite_exigibilidad
              JOIN [MMET_BI_OLTP].dbo.asistencias asis
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
              JOIN [MMET_BI_OLTP].dbo.sesiones s
                ON s.id_programa = ba.id_programa
               AND s.estado_sesion = N'REALIZADA'
               AND s.fecha_sesion >= pa.fecha_primera_asistencia
               AND s.fecha_sesion <= ba.fecha_limite_exigibilidad
              LEFT JOIN [MMET_BI_OLTP].dbo.asistencias asis
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
        ),
        FuenteContinuidad AS (
            SELECT
                @sk_tiempo_corte AS sk_tiempo_corte,
                de.sk_estudiante,
                dp.sk_programa,
                dpr.sk_practica,
                dec.sk_estado_continuidad,
                c.id_asignacion,
                c.EsEvaluable,
                CAST(CASE WHEN c.codigo_estado IN (N'ACTIVO', N'EN_RIESGO') AND c.EsEvaluable = 1 THEN 1 ELSE 0 END AS TINYINT) AS Continua,
                c.sesiones_exigibles AS SesionesExigibles,
                c.asistencias        AS Asistencias,
                c.inasistencias      AS Inasistencias,
                c.minutos_asistidos  AS MinutosAsistidos,
                c.fecha_primera_asistencia,
                c.fecha_ultima_asistencia
              FROM Clasificado c
              JOIN dm.DimEstudiante        de  ON de.id_estudiante = c.id_estudiante
              JOIN dm.DimPrograma          dp  ON dp.id_programa   = c.id_programa
              JOIN dm.DimPractica          dpr ON dpr.id_practica  = c.id_practica_principal
              JOIN dm.DimEstadoContinuidad dec ON dec.codigo_estado = c.codigo_estado
                                              AND dec.EsEvaluable   = c.EsEvaluable
        )
        MERGE dm.HechoContinuidad AS tgt
        USING FuenteContinuidad AS src
           ON tgt.sk_tiempo_corte = @sk_tiempo_corte
          AND tgt.sk_estudiante   = src.sk_estudiante
          AND tgt.sk_programa     = src.sk_programa
        WHEN MATCHED THEN
            UPDATE SET
                tgt.sk_practica              = src.sk_practica,
                tgt.sk_estado_continuidad    = src.sk_estado_continuidad,
                tgt.id_asignacion            = src.id_asignacion,
                tgt.EsEvaluable              = src.EsEvaluable,
                tgt.Continua                 = src.Continua,
                tgt.SesionesExigibles        = src.SesionesExigibles,
                tgt.Asistencias              = src.Asistencias,
                tgt.Inasistencias            = src.Inasistencias,
                tgt.MinutosAsistidos         = src.MinutosAsistidos,
                tgt.fecha_primera_asistencia = src.fecha_primera_asistencia,
                tgt.fecha_ultima_asistencia  = src.fecha_ultima_asistencia,
                tgt.id_ejecucion_etl         = @id_ejecucion_etl
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (
                sk_tiempo_corte, sk_estudiante, sk_programa, sk_practica, sk_estado_continuidad,
                id_asignacion, EsEvaluable, Continua,
                SesionesExigibles, Asistencias, Inasistencias, MinutosAsistidos,
                fecha_primera_asistencia, fecha_ultima_asistencia, id_ejecucion_etl
            )
            VALUES (
                src.sk_tiempo_corte, src.sk_estudiante, src.sk_programa, src.sk_practica, src.sk_estado_continuidad,
                src.id_asignacion, src.EsEvaluable, src.Continua,
                src.SesionesExigibles, src.Asistencias, src.Inasistencias, src.MinutosAsistidos,
                src.fecha_primera_asistencia, src.fecha_ultima_asistencia, @id_ejecucion_etl
            )
        WHEN NOT MATCHED BY SOURCE AND tgt.sk_tiempo_corte = @sk_tiempo_corte THEN
            DELETE;

        SELECT @filas_continuidad = COUNT(*)
          FROM dm.HechoContinuidad
         WHERE sk_tiempo_corte = @sk_tiempo_corte;

        -- ====================================================================
        -- 5. MERGE POR @sk_tiempo_corte EN dm.HechoCumplimientoEvaluaciones (KPI-04 — D01)
        --    Excluye duplicados y puntajes fuera de rango detectados en RQ-BI-13.
        -- ====================================================================
        ;WITH OportunidadesConDuplicado AS (
            SELECT r.id_oportunidad
              FROM [MMET_BI_OLTP].dbo.resultados_evaluacion r
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
              FROM [MMET_BI_OLTP].dbo.resultados_evaluacion r
              JOIN [MMET_BI_OLTP].dbo.oportunidades_evaluacion op ON op.id_oportunidad = r.id_oportunidad
              JOIN [MMET_BI_OLTP].dbo.cat_instrumentos ci ON ci.id_instrumento = op.id_instrumento
             WHERE r.es_vigente = 1
               AND r.estado_validez = N'VALIDO'
               AND r.fecha_realizacion IS NOT NULL
               AND r.puntaje_total IS NOT NULL
               AND r.fecha_realizacion <= @fecha_corte
               AND r.puntaje_total BETWEEN ci.puntaje_minimo AND ci.puntaje_maximo
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
              FROM [MMET_BI_OLTP].dbo.oportunidades_evaluacion op
              JOIN [MMET_BI_OLTP].dbo.programas p ON p.id_programa = op.id_programa
              LEFT JOIN ResultadoVigenteUnico rv ON rv.id_oportunidad = op.id_oportunidad
             WHERE op.aplicable = 1
               AND op.fecha_prevista IS NOT NULL
               AND op.fecha_ventana_inicio IS NOT NULL
               AND op.fecha_ventana_fin IS NOT NULL
               AND op.fecha_ventana_inicio <= @fecha_corte
        ),
        FuenteCumplimiento AS (
            SELECT
                bc.id_oportunidad,
                @sk_tiempo_corte AS sk_tiempo_corte,
                CONVERT(INT, CONVERT(CHAR(8), bc.fecha_prevista, 112)) AS sk_tiempo_previsto,
                CASE
                    WHEN bc.fecha_realizacion IS NOT NULL THEN CONVERT(INT, CONVERT(CHAR(8), bc.fecha_realizacion, 112))
                    ELSE -1
                END AS sk_tiempo_realizacion,
                de.sk_estudiante,
                dp.sk_programa,
                dpr.sk_practica,
                di.sk_instrumento,
                ISNULL(devt.sk_evento_indice, -1) AS sk_evento_indice,
                dmom.sk_momento,
                deval.sk_estado_evaluacion,
                CAST(1 AS TINYINT) AS Oportunidad,
                bc.EsElegible,
                bc.EsCompletadaElegible,
                CAST(CASE WHEN bc.codigo_estado_eval = N'COMPLETADA_EN_VENTANA' THEN 1 ELSE 0 END AS TINYINT) AS EsEnVentana,
                CAST(CASE WHEN bc.codigo_estado_eval = N'COMPLETADA_TARDIA'     THEN 1 ELSE 0 END AS TINYINT) AS EsTardia,
                CAST(CASE WHEN bc.codigo_estado_eval = N'PENDIENTE_EN_VENTANA'  THEN 1 ELSE 0 END AS TINYINT) AS EsPendiente,
                CAST(CASE WHEN bc.codigo_estado_eval = N'VENCIDA'               THEN 1 ELSE 0 END AS TINYINT) AS EsVencida,
                bc.puntaje_total   AS PuntajeObtenido,
                bc.numero_version  AS NumeroVersion,
                bc.id_resultado    AS id_resultado_vigente
              FROM BaseCumplimiento bc
              JOIN dm.DimEstudiante       de    ON de.id_estudiante    = bc.id_estudiante
              JOIN dm.DimPrograma         dp    ON dp.id_programa      = bc.id_programa
              JOIN dm.DimPractica         dpr   ON dpr.id_practica     = bc.id_practica_principal
              JOIN dm.DimInstrumento      di    ON di.id_instrumento   = bc.id_instrumento
              LEFT JOIN dm.DimEventoIndice devt ON devt.id_evento_indice = bc.id_evento_indice
              JOIN dm.DimMomento          dmom  ON dmom.codigo_momento = bc.momento
              JOIN dm.DimEstadoEvaluacion deval ON deval.codigo_estado = bc.codigo_estado_eval
        )
        MERGE dm.HechoCumplimientoEvaluaciones AS tgt
        USING FuenteCumplimiento AS src
           ON tgt.sk_tiempo_corte = @sk_tiempo_corte
          AND tgt.id_oportunidad  = src.id_oportunidad
        WHEN MATCHED THEN
            UPDATE SET
                tgt.sk_tiempo_previsto    = src.sk_tiempo_previsto,
                tgt.sk_tiempo_realizacion = src.sk_tiempo_realizacion,
                tgt.sk_estudiante         = src.sk_estudiante,
                tgt.sk_programa           = src.sk_programa,
                tgt.sk_practica           = src.sk_practica,
                tgt.sk_instrumento        = src.sk_instrumento,
                tgt.sk_evento_indice      = src.sk_evento_indice,
                tgt.sk_momento            = src.sk_momento,
                tgt.sk_estado_evaluacion  = src.sk_estado_evaluacion,
                tgt.Oportunidad           = src.Oportunidad,
                tgt.EsElegible            = src.EsElegible,
                tgt.EsCompletadaElegible  = src.EsCompletadaElegible,
                tgt.EsEnVentana           = src.EsEnVentana,
                tgt.EsTardia              = src.EsTardia,
                tgt.EsPendiente           = src.EsPendiente,
                tgt.EsVencida             = src.EsVencida,
                tgt.PuntajeObtenido       = src.PuntajeObtenido,
                tgt.NumeroVersion         = src.NumeroVersion,
                tgt.id_resultado_vigente  = src.id_resultado_vigente,
                tgt.id_ejecucion_etl      = @id_ejecucion_etl
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (
                id_oportunidad, sk_tiempo_corte, sk_tiempo_previsto, sk_tiempo_realizacion,
                sk_estudiante, sk_programa, sk_practica, sk_instrumento, sk_evento_indice,
                sk_momento, sk_estado_evaluacion,
                Oportunidad, EsElegible, EsCompletadaElegible,
                EsEnVentana, EsTardia, EsPendiente, EsVencida,
                PuntajeObtenido, NumeroVersion, id_resultado_vigente, id_ejecucion_etl
            )
            VALUES (
                src.id_oportunidad, src.sk_tiempo_corte, src.sk_tiempo_previsto, src.sk_tiempo_realizacion,
                src.sk_estudiante, src.sk_programa, src.sk_practica, src.sk_instrumento, src.sk_evento_indice,
                src.sk_momento, src.sk_estado_evaluacion,
                src.Oportunidad, src.EsElegible, src.EsCompletadaElegible,
                src.EsEnVentana, src.EsTardia, src.EsPendiente, src.EsVencida,
                src.PuntajeObtenido, src.NumeroVersion, src.id_resultado_vigente, @id_ejecucion_etl
            )
        WHEN NOT MATCHED BY SOURCE AND tgt.sk_tiempo_corte = @sk_tiempo_corte THEN
            DELETE;

        SELECT @filas_cumplimiento = COUNT(*)
          FROM dm.HechoCumplimientoEvaluaciones
         WHERE sk_tiempo_corte = @sk_tiempo_corte;

        -- ====================================================================
        -- 6. MERGE POR @sk_tiempo_corte EN dm.HechoResultadosEvaluacion (KPI-01, 02, 05)
        --    Solo pares válidos INICIAL-FINAL en ventana, dentro de rango oficial,
        --    mismo evento índice válido en PCL-5 y orden cronológico consistente.
        -- ====================================================================
        ;WITH OportunidadesConDuplicado AS (
            SELECT r.id_oportunidad
              FROM [MMET_BI_OLTP].dbo.resultados_evaluacion r
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
              FROM [MMET_BI_OLTP].dbo.oportunidades_evaluacion op
              JOIN [MMET_BI_OLTP].dbo.resultados_evaluacion r
                ON r.id_oportunidad = op.id_oportunidad
              JOIN [MMET_BI_OLTP].dbo.cat_instrumentos ci
                ON ci.id_instrumento = op.id_instrumento
              LEFT JOIN [MMET_BI_OLTP].dbo.eventos_indice ei
                ON ei.id_evento_indice = op.id_evento_indice
             WHERE op.aplicable = 1
               AND r.es_vigente = 1
               AND r.estado_validez = N'VALIDO'
               AND r.en_ventana = 1
               AND r.fecha_realizacion IS NOT NULL
               AND r.puntaje_total IS NOT NULL
               AND r.fecha_realizacion <= @fecha_corte
               AND r.fecha_realizacion BETWEEN op.fecha_ventana_inicio AND op.fecha_ventana_fin
               AND r.puntaje_total BETWEEN ci.puntaje_minimo AND ci.puntaje_maximo
               AND (op.id_evento_indice IS NULL OR ei.id_estudiante = op.id_estudiante)
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
              JOIN [MMET_BI_OLTP].dbo.programas p ON p.id_programa = ini.id_programa
             WHERE ini.momento = N'INICIAL'
        ),
        FuenteResultados AS (
            SELECT
                @sk_tiempo_corte AS sk_tiempo_corte,
                CONVERT(INT, CONVERT(CHAR(8), pv.fecha_realizacion_final, 112)) AS sk_tiempo_final,
                de.sk_estudiante,
                dp.sk_programa,
                dpr.sk_practica,
                di.sk_instrumento,
                ISNULL(devt.sk_evento_indice, -1) AS sk_evento_indice,
                pv.id_asignacion,
                pv.id_resultado_inicial,
                pv.id_resultado_final,
                pv.id_version_instrumento,
                CAST(1 AS TINYINT) AS ParesValidos,
                pv.SumaInicial,
                pv.SumaFinal,
                pv.PuntosReduccion,
                CAST(CASE WHEN pv.PuntosReduccion > 0 THEN 1 ELSE 0 END AS TINYINT) AS EsReduccion,
                CAST(CASE WHEN pv.PuntosReduccion = 0 THEN 1 ELSE 0 END AS TINYINT) AS EsSinCambio,
                CAST(CASE WHEN pv.PuntosReduccion < 0 THEN 1 ELSE 0 END AS TINYINT) AS EsIncremento,
                CAST(CASE WHEN pv.PuntosReduccion >= di.meta_reduccion_operativa THEN 1 ELSE 0 END AS TINYINT) AS CumpleMetaIndividual
              FROM ParesValidos pv
              JOIN dm.DimEstudiante        de   ON de.id_estudiante     = pv.id_estudiante
              JOIN dm.DimPrograma          dp   ON dp.id_programa       = pv.id_programa
              JOIN dm.DimPractica          dpr  ON dpr.id_practica      = pv.id_practica_principal
              JOIN dm.DimInstrumento       di   ON di.id_instrumento    = pv.id_instrumento
              LEFT JOIN dm.DimEventoIndice devt ON devt.id_evento_indice = pv.id_evento_indice
        )
        MERGE dm.HechoResultadosEvaluacion AS tgt
        USING FuenteResultados AS src
           ON tgt.sk_tiempo_corte  = @sk_tiempo_corte
          AND tgt.sk_estudiante    = src.sk_estudiante
          AND tgt.sk_programa      = src.sk_programa
          AND tgt.sk_instrumento   = src.sk_instrumento
          AND tgt.sk_evento_indice = src.sk_evento_indice
        WHEN MATCHED THEN
            UPDATE SET
                tgt.sk_tiempo_final        = src.sk_tiempo_final,
                tgt.sk_practica            = src.sk_practica,
                tgt.id_asignacion          = src.id_asignacion,
                tgt.id_resultado_inicial   = src.id_resultado_inicial,
                tgt.id_resultado_final     = src.id_resultado_final,
                tgt.id_version_instrumento = src.id_version_instrumento,
                tgt.ParesValidos           = src.ParesValidos,
                tgt.SumaInicial            = src.SumaInicial,
                tgt.SumaFinal              = src.SumaFinal,
                tgt.PuntosReduccion        = src.PuntosReduccion,
                tgt.EsReduccion            = src.EsReduccion,
                tgt.EsSinCambio            = src.EsSinCambio,
                tgt.EsIncremento           = src.EsIncremento,
                tgt.CumpleMetaIndividual   = src.CumpleMetaIndividual,
                tgt.id_ejecucion_etl       = @id_ejecucion_etl
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (
                sk_tiempo_corte, sk_tiempo_final, sk_estudiante, sk_programa, sk_practica,
                sk_instrumento, sk_evento_indice,
                id_asignacion, id_resultado_inicial, id_resultado_final, id_version_instrumento,
                ParesValidos, SumaInicial, SumaFinal, PuntosReduccion,
                EsReduccion, EsSinCambio, EsIncremento, CumpleMetaIndividual, id_ejecucion_etl
            )
            VALUES (
                src.sk_tiempo_corte, src.sk_tiempo_final, src.sk_estudiante, src.sk_programa, src.sk_practica,
                src.sk_instrumento, src.sk_evento_indice,
                src.id_asignacion, src.id_resultado_inicial, src.id_resultado_final, src.id_version_instrumento,
                src.ParesValidos, src.SumaInicial, src.SumaFinal, src.PuntosReduccion,
                src.EsReduccion, src.EsSinCambio, src.EsIncremento, src.CumpleMetaIndividual, @id_ejecucion_etl
            )
        WHEN NOT MATCHED BY SOURCE AND tgt.sk_tiempo_corte = @sk_tiempo_corte THEN
            DELETE;

        SELECT @filas_resultados = COUNT(*)
          FROM dm.HechoResultadosEvaluacion
         WHERE sk_tiempo_corte = @sk_tiempo_corte;

        COMMIT TRANSACTION;

        -- 7. Persistir incidencias acumuladas en @incidencias (fuera de la transacción de hechos)
        INSERT INTO dm.etl_incidencias_calidad (
            id_ejecucion_etl, fecha_corte, regla_codigo, severidad,
            entidad_origen, id_registro_origen, detalle
        )
        SELECT
            @id_ejecucion_etl,
            @fecha_corte,
            regla_codigo,
            severidad,
            entidad_origen,
            id_registro_origen,
            detalle
          FROM @incidencias;

        SET @total_incidencias = @@ROWCOUNT;

        -- 8. Actualizar log de ejecución como EXITOSO
        UPDATE dm.etl_log_ejecuciones
           SET fin_ejecucion          = SYSDATETIMEOFFSET(),
               estado                 = N'EXITOSO',
               filas_continuidad      = @filas_continuidad,
               filas_cumplimiento     = @filas_cumplimiento,
               filas_resultados       = @filas_resultados,
               incidencias_detectadas = @total_incidencias,
               mensaje                = CONCAT(
                   N'Carga incremental exitosa al corte ', CONVERT(NVARCHAR(10), @fecha_corte, 23),
                   N'. Cont=', @filas_continuidad,
                   N', Cump=', @filas_cumplimiento,
                   N', Res=', @filas_resultados,
                   N', Inc=', @total_incidencias
               )
         WHERE id_ejecucion_etl = @id_ejecucion_etl;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @err_msg NVARCHAR(500) = LEFT(ERROR_MESSAGE(), 500);

        -- Persistir las incidencias acumuladas en @incidencias (sobreviven al ROLLBACK)
        INSERT INTO dm.etl_incidencias_calidad (
            id_ejecucion_etl, fecha_corte, regla_codigo, severidad,
            entidad_origen, id_registro_origen, detalle
        )
        SELECT
            @id_ejecucion_etl,
            @fecha_corte,
            regla_codigo,
            severidad,
            entidad_origen,
            id_registro_origen,
            detalle
          FROM @incidencias;

        INSERT INTO dm.etl_incidencias_calidad (
            id_ejecucion_etl, fecha_corte, regla_codigo, severidad,
            entidad_origen, id_registro_origen, detalle
        )
        VALUES (
            @id_ejecucion_etl,
            @fecha_corte,
            N'ERROR_EJECUCION_ETL',
            N'ERROR',
            N'dm.usp_ejecutar_etl',
            NULL,
            @err_msg
        );

        SELECT @total_incidencias = COUNT(*)
          FROM dm.etl_incidencias_calidad
         WHERE id_ejecucion_etl = @id_ejecucion_etl;

        UPDATE dm.etl_log_ejecuciones
           SET fin_ejecucion          = SYSDATETIMEOFFSET(),
               estado                 = N'ERROR',
               incidencias_detectadas = @total_incidencias,
               mensaje                = @err_msg
         WHERE id_ejecucion_etl = @id_ejecucion_etl;

        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- CARGA INICIAL INCREMENTAL PARA CORTES CLAVE 2026-II (INCLUYENDO 2026-11-23)
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

PRINT N'Proceso ETL incremental dm.usp_ejecutar_etl (RQ-BI-13) creado y carga inicial 2026-II completada.';
GO
