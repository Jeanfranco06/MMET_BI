/* ============================================================================
   ARCHIVO:  08_verificar_datamart_sqlserver.sql
   PROYECTO: MMET_BI — Verificación de Integridad, Grano, Calidad y KPIs del DM
   ÁMBITO:   Universidad Nacional de Trujillo (Semestre 2026-II)
   MOTOR:    Microsoft SQL Server 2019 / 2022 (T-SQL)
   ============================================================================
   Uso en SSMS o sqlcmd:
     sqlcmd -S localhost -E -C -i "sql_server\08_verificar_datamart_sqlserver.sql"

   Verifica:
     1. Conteos de todas las dimensiones y hechos.
     2. Ausencia de duplicados de grano en las 3 tablas de hechos.
     3. Cumplimiento estricto de reglas D01, D02, no mezcla de escalas y
        exclusión de tardías en pares de resultados.
     4. Idempotencia del procedimiento dm.usp_ejecutar_etl.
     5. Incidencias de calidad registradas en dm.etl_incidencias_calidad.
     6. Cálculo oficial de KPI-01 a KPI-05 al corte 2026-11-23.
   ============================================================================ */

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE MMET_BI_DM;
GO

DECLARE @fecha_corte DATE = '2026-11-23';
DECLARE @sk_corte    INT  = CONVERT(INT, CONVERT(CHAR(8), @fecha_corte, 112));

-- ============================================================================
-- 1. VERIFICACIÓN DE EXISTENCIA DE OBJETOS DEL DATA MART
-- ============================================================================
IF OBJECT_ID(N'dm.DimTiempo', N'U') IS NULL
 OR OBJECT_ID(N'dm.DimEstudiante', N'U') IS NULL
 OR OBJECT_ID(N'dm.DimPrograma', N'U') IS NULL
 OR OBJECT_ID(N'dm.DimPractica', N'U') IS NULL
 OR OBJECT_ID(N'dm.DimInstrumento', N'U') IS NULL
 OR OBJECT_ID(N'dm.DimEventoIndice', N'U') IS NULL
 OR OBJECT_ID(N'dm.DimEstadoContinuidad', N'U') IS NULL
 OR OBJECT_ID(N'dm.DimMomento', N'U') IS NULL
 OR OBJECT_ID(N'dm.DimEstadoEvaluacion', N'U') IS NULL
 OR OBJECT_ID(N'dm.HechoContinuidad', N'U') IS NULL
 OR OBJECT_ID(N'dm.HechoCumplimientoEvaluaciones', N'U') IS NULL
 OR OBJECT_ID(N'dm.HechoResultadosEvaluacion', N'U') IS NULL
 OR OBJECT_ID(N'dm.vw_HechoEfectividadPractica', N'V') IS NULL
 OR OBJECT_ID(N'dm.etl_log_ejecuciones', N'U') IS NULL
 OR OBJECT_ID(N'dm.etl_incidencias_calidad', N'U') IS NULL
 OR OBJECT_ID(N'dm.usp_ejecutar_etl', N'P') IS NULL
    THROW 53000, N'Faltan objetos requeridos en el esquema dm.', 1;

-- ============================================================================
-- 1.B VERIFICACIÓN DE ÍNDICES DE RENDIMIENTO EN MMET_BI_DM
-- ============================================================================
DECLARE @indices_faltantes INT = (
    SELECT COUNT(*)
      FROM (VALUES
          (N'dm.HechoContinuidad',             N'ix_hcont_corte_practica'),
          (N'dm.HechoContinuidad',             N'ix_hcont_corte_programa'),
          (N'dm.HechoContinuidad',             N'ix_hcont_corte_estudiante'),
          (N'dm.HechoCumplimientoEvaluaciones',N'ix_hcump_corte_instr_estado'),
          (N'dm.HechoCumplimientoEvaluaciones',N'ix_hcump_corte_programa_est'),
          (N'dm.HechoResultadosEvaluacion',    N'ix_hres_corte_practica_instr'),
          (N'dm.HechoResultadosEvaluacion',    N'ix_hres_corte_instr_prog'),
          (N'dm.DimEstudiante',                N'ix_dim_est_facultad_grupo'),
          (N'dm.DimPrograma',                  N'ix_dim_prog_periodo'),
          (N'dm.DimEventoIndice',              N'ix_dim_evt_categoria'),
          (N'dm.etl_log_ejecuciones',          N'ix_etl_log_corte_estado'),
          (N'dm.etl_incidencias_calidad',      N'ix_etl_inc_ejecucion_regla'),
          (N'dm.etl_incidencias_calidad',      N'ix_etl_inc_corte_regla')
      ) AS req(tabla_obj, nombre_idx)
     WHERE NOT EXISTS (
         SELECT 1
           FROM sys.indexes i
          WHERE i.object_id = OBJECT_ID(req.tabla_obj)
            AND i.name      = req.nombre_idx
     )
);

IF @indices_faltantes > 0
    THROW 53009, N'Faltan índices de rendimiento requeridos en MMET_BI_DM (revisar script 06).', 1;

-- ============================================================================
-- 2. VERIFICACIÓN DE AUSENCIA DE DUPLICADOS DE GRANO
-- ============================================================================
IF EXISTS (
    SELECT sk_estudiante, sk_programa, sk_tiempo_corte
      FROM dm.HechoContinuidad
     GROUP BY sk_estudiante, sk_programa, sk_tiempo_corte
    HAVING COUNT(*) > 1
)
    THROW 53001, N'Se detectaron duplicados de grano en dm.HechoContinuidad.', 1;

IF EXISTS (
    SELECT id_oportunidad, sk_tiempo_corte
      FROM dm.HechoCumplimientoEvaluaciones
     GROUP BY id_oportunidad, sk_tiempo_corte
    HAVING COUNT(*) > 1
)
    THROW 53002, N'Se detectaron duplicados de grano en dm.HechoCumplimientoEvaluaciones.', 1;

IF EXISTS (
    SELECT sk_estudiante, sk_programa, sk_instrumento, sk_evento_indice, sk_tiempo_corte
      FROM dm.HechoResultadosEvaluacion
     GROUP BY sk_estudiante, sk_programa, sk_instrumento, sk_evento_indice, sk_tiempo_corte
    HAVING COUNT(*) > 1
)
    THROW 53003, N'Se detectaron duplicados de grano en dm.HechoResultadosEvaluacion.', 1;

-- ============================================================================
-- 3. VERIFICACIÓN DE REGLAS DE NEGOCIO (D01, D02, CALIDAD DE PARES)
-- ============================================================================

-- D02: Retirados con < 3 sesiones deben tener EsEvaluable = 0 y Continua = 0
IF EXISTS (
    SELECT 1
      FROM dm.HechoContinuidad hc
      JOIN dm.DimEstadoContinuidad dec ON dec.sk_estado_continuidad = hc.sk_estado_continuidad
     WHERE dec.codigo_estado = N'RETIRADO'
       AND hc.SesionesExigibles < 3
       AND (hc.EsEvaluable <> 0 OR hc.Continua <> 0)
)
    THROW 53004, N'Violación D02: un retirado con menos de 3 sesiones figura como evaluable o continúa.', 1;

-- D01: Ninguna oportunidad no elegible puede sumar en EsCompletadaElegible
IF EXISTS (
    SELECT 1
      FROM dm.HechoCumplimientoEvaluaciones
     WHERE EsElegible = 0 AND EsCompletadaElegible = 1
)
    THROW 53005, N'Violación D01: existen filas con EsCompletadaElegible=1 y EsElegible=0.', 1;

-- Calidad: Ningún resultado tardío (en_ventana = 0) puede estar en HechoResultadosEvaluacion
IF EXISTS (
    SELECT 1
      FROM dm.HechoResultadosEvaluacion hr
      JOIN [MMET_BI_OLTP].dbo.resultados_evaluacion ri ON ri.id_resultado = hr.id_resultado_inicial
      JOIN [MMET_BI_OLTP].dbo.resultados_evaluacion rf ON rf.id_resultado = hr.id_resultado_final
     WHERE ri.en_ventana = 0 OR rf.en_ventana = 0
)
    THROW 53006, N'Violación de calidad: existen evaluaciones tardías incluidas en dm.HechoResultadosEvaluacion.', 1;

-- Calidad: PSS-10 siempre debe usar sk_evento_indice = -1 ('No aplica') y PCL-5 nunca -1
IF EXISTS (
    SELECT 1
      FROM dm.HechoResultadosEvaluacion hr
      JOIN dm.DimInstrumento di ON di.sk_instrumento = hr.sk_instrumento
     WHERE (di.codigo_instrumento = N'PSS-10' AND hr.sk_evento_indice <> -1)
        OR (di.codigo_instrumento = N'PCL-5'  AND hr.sk_evento_indice = -1)
)
    THROW 53007, N'Violación de calidad: asociación incorrecta de DimEventoIndice por instrumento.', 1;

-- ============================================================================
-- 4. PRUEBA DE IDEMPOTENCIA Y PRESERVACIÓN DE CORTES PREVIOS (MERGE)
-- ============================================================================
DECLARE @c1 INT = (SELECT COUNT(*) FROM dm.HechoContinuidad WHERE sk_tiempo_corte = @sk_corte);
DECLARE @u1 INT = (SELECT COUNT(*) FROM dm.HechoCumplimientoEvaluaciones WHERE sk_tiempo_corte = @sk_corte);
DECLARE @r1 INT = (SELECT COUNT(*) FROM dm.HechoResultadosEvaluacion WHERE sk_tiempo_corte = @sk_corte);

DECLARE @prev_c1 INT = (SELECT COUNT(*) FROM dm.HechoContinuidad WHERE sk_tiempo_corte <> @sk_corte);
DECLARE @prev_u1 INT = (SELECT COUNT(*) FROM dm.HechoCumplimientoEvaluaciones WHERE sk_tiempo_corte <> @sk_corte);
DECLARE @prev_r1 INT = (SELECT COUNT(*) FROM dm.HechoResultadosEvaluacion WHERE sk_tiempo_corte <> @sk_corte);

EXEC dm.usp_ejecutar_etl @fecha_corte = @fecha_corte;

DECLARE @c2 INT = (SELECT COUNT(*) FROM dm.HechoContinuidad WHERE sk_tiempo_corte = @sk_corte);
DECLARE @u2 INT = (SELECT COUNT(*) FROM dm.HechoCumplimientoEvaluaciones WHERE sk_tiempo_corte = @sk_corte);
DECLARE @r2 INT = (SELECT COUNT(*) FROM dm.HechoResultadosEvaluacion WHERE sk_tiempo_corte = @sk_corte);

DECLARE @prev_c2 INT = (SELECT COUNT(*) FROM dm.HechoContinuidad WHERE sk_tiempo_corte <> @sk_corte);
DECLARE @prev_u2 INT = (SELECT COUNT(*) FROM dm.HechoCumplimientoEvaluaciones WHERE sk_tiempo_corte <> @sk_corte);
DECLARE @prev_r2 INT = (SELECT COUNT(*) FROM dm.HechoResultadosEvaluacion WHERE sk_tiempo_corte <> @sk_corte);

IF @c1 <> @c2 OR @u1 <> @u2 OR @r1 <> @r2
    THROW 53008, N'Fallo de idempotencia: los conteos cambiaron al re-ejecutar el ETL para el mismo corte.', 1;

IF @prev_c1 <> @prev_c2 OR @prev_u1 <> @prev_u2 OR @prev_r1 <> @prev_r2
    THROW 53010, N'Fallo de MERGE incremental: se alteraron filas de cortes históricos previos.', 1;

-- ============================================================================
-- 4.B PRUEBAS DE ANOMALÍAS RQ-BI-13 (DETECCIÓN, EXCLUSIÓN Y TRAZABILIDAD)
-- ============================================================================
PRINT N'=== 0. PRUEBAS DE ANOMALÍAS RQ-BI-13 ===';

-- Prueba 1: Evaluaciones fuera de ventana registradas en dm.etl_incidencias_calidad
DECLARE @ultima_ejec_ok BIGINT = (
    SELECT MAX(id_ejecucion_etl)
      FROM dm.etl_log_ejecuciones
     WHERE fecha_corte = @fecha_corte AND estado = N'EXITOSO'
);

IF NOT EXISTS (
    SELECT 1
      FROM dm.etl_incidencias_calidad
     WHERE id_ejecucion_etl = @ultima_ejec_ok
       AND regla_codigo = N'FECHA_FUERA_VENTANA'
)
    THROW 53011, N'Fallo RQ-BI-13: no se registraron incidencias FECHA_FUERA_VENTANA para evaluaciones tardías.', 1;

-- Prueba 2: Registro persistente ante error (fecha de corte fuera de DimTiempo)
DECLARE @err_capturado BIT = 0;
BEGIN TRY
    EXEC dm.usp_ejecutar_etl @fecha_corte = '2099-01-01';
END TRY
BEGIN CATCH
    SET @err_capturado = 1;
END CATCH;

IF @err_capturado = 0
    THROW 53012, N'Fallo RQ-BI-13: una fecha de corte inválida no generó error controlado.', 1;

DECLARE @id_ejec_err BIGINT = (
    SELECT MAX(id_ejecucion_etl)
      FROM dm.etl_log_ejecuciones
     WHERE fecha_corte = '2099-01-01' AND estado = N'ERROR'
);

IF @id_ejec_err IS NULL OR NOT EXISTS (
    SELECT 1
      FROM dm.etl_incidencias_calidad
     WHERE id_ejecucion_etl = @id_ejec_err
       AND regla_codigo = N'FECHA_CORTE_INVALIDA'
)
    THROW 53013, N'Fallo RQ-BI-13: la ejecución fallida o su incidencia no persistieron.', 1;

-- Limpiar registro sintético de la fecha 2099-01-01
DELETE FROM dm.etl_incidencias_calidad WHERE id_ejecucion_etl = @id_ejec_err;
DELETE FROM dm.etl_log_ejecuciones     WHERE id_ejecucion_etl = @id_ejec_err;

-- Prueba 3: Anomalía controlada de orden cronológico invertido (FECHA_ORDEN_INVERTIDO)
--           Se modifica temporalmente un par PSS-10 válido en OLTP, se ejecuta el ETL,
--           se valida detección + exclusión, y luego se restaura exactamente el OLTP.
DECLARE @id_res_fin_test   BIGINT;
DECLARE @id_asig_test      BIGINT;
DECLARE @fecha_ini_orig    DATE;
DECLARE @fecha_fin_orig    DATE;
DECLARE @en_ventana_orig   BIT;
DECLARE @id_ejec_anomalia  BIGINT;

SELECT TOP 1
    @id_res_fin_test = hr.id_resultado_final,
    @id_asig_test    = hr.id_asignacion,
    @fecha_ini_orig  = ri.fecha_realizacion,
    @fecha_fin_orig  = rf.fecha_realizacion,
    @en_ventana_orig = rf.en_ventana
  FROM dm.HechoResultadosEvaluacion hr
  JOIN dm.DimInstrumento di ON di.sk_instrumento = hr.sk_instrumento
  JOIN [MMET_BI_OLTP].dbo.resultados_evaluacion ri ON ri.id_resultado = hr.id_resultado_inicial
  JOIN [MMET_BI_OLTP].dbo.resultados_evaluacion rf ON rf.id_resultado = hr.id_resultado_final
 WHERE hr.sk_tiempo_corte = @sk_corte
   AND di.codigo_instrumento = N'PSS-10'
   AND rf.fecha_realizacion > ri.fecha_realizacion
 ORDER BY hr.id_hecho_resultado;

IF @id_res_fin_test IS NOT NULL
BEGIN
    BEGIN TRY
        UPDATE [MMET_BI_OLTP].dbo.resultados_evaluacion
           SET fecha_realizacion = DATEADD(DAY, -1, @fecha_ini_orig),
               en_ventana = 0
         WHERE id_resultado = @id_res_fin_test;

        EXEC dm.usp_ejecutar_etl @fecha_corte = @fecha_corte;

        SET @id_ejec_anomalia = (
            SELECT MAX(id_ejecucion_etl)
              FROM dm.etl_log_ejecuciones
             WHERE fecha_corte = @fecha_corte AND estado = N'EXITOSO'
        );

        IF NOT EXISTS (
            SELECT 1
              FROM dm.etl_incidencias_calidad
             WHERE id_ejecucion_etl = @id_ejec_anomalia
               AND regla_codigo = N'FECHA_ORDEN_INVERTIDO'
               AND id_registro_origen = @id_asig_test
        )
            THROW 53014, N'Fallo RQ-BI-13: no se detectó FECHA_ORDEN_INVERTIDO en la anomalía controlada.', 1;

        IF EXISTS (
            SELECT 1
              FROM dm.HechoResultadosEvaluacion
             WHERE sk_tiempo_corte = @sk_corte
               AND id_resultado_final = @id_res_fin_test
        )
            THROW 53015, N'Fallo RQ-BI-13: el par con fecha invertida no fue excluido de HechoResultadosEvaluacion.', 1;

        -- Restaurar dato original en OLTP y restablecer el Data Mart
        UPDATE [MMET_BI_OLTP].dbo.resultados_evaluacion
           SET fecha_realizacion = @fecha_fin_orig,
               en_ventana = @en_ventana_orig
         WHERE id_resultado = @id_res_fin_test;

        EXEC dm.usp_ejecutar_etl @fecha_corte = @fecha_corte;
    END TRY
    BEGIN CATCH
        -- Garantizar restauración del OLTP ante cualquier fallo de la prueba
        UPDATE [MMET_BI_OLTP].dbo.resultados_evaluacion
           SET fecha_realizacion = @fecha_fin_orig,
               en_ventana = @en_ventana_orig
         WHERE id_resultado = @id_res_fin_test;
        THROW;
    END CATCH;
END

PRINT N'Pruebas de anomalías RQ-BI-13 (FECHA_FUERA_VENTANA, FECHA_CORTE_INVALIDA, FECHA_ORDEN_INVERTIDO y preservación de cortes) aprobadas.';

-- ============================================================================
-- 5. REPORTE DE CONTEOS DE DIMENSIONES Y HECHOS
-- ============================================================================
PRINT N'=== 1. CONTEOS DE DIMENSIONES Y TABLAS DE HECHOS ===';

SELECT N'DimTiempo'                     AS tabla, COUNT(*) AS total_filas FROM dm.DimTiempo
UNION ALL SELECT N'DimEstudiante',                COUNT(*) FROM dm.DimEstudiante
UNION ALL SELECT N'DimPrograma',                  COUNT(*) FROM dm.DimPrograma
UNION ALL SELECT N'DimPractica',                  COUNT(*) FROM dm.DimPractica
UNION ALL SELECT N'DimInstrumento',               COUNT(*) FROM dm.DimInstrumento
UNION ALL SELECT N'DimEventoIndice',              COUNT(*) FROM dm.DimEventoIndice
UNION ALL SELECT N'DimEstadoContinuidad',         COUNT(*) FROM dm.DimEstadoContinuidad
UNION ALL SELECT N'DimMomento',                   COUNT(*) FROM dm.DimMomento
UNION ALL SELECT N'DimEstadoEvaluacion',          COUNT(*) FROM dm.DimEstadoEvaluacion
UNION ALL SELECT N'HechoContinuidad (todos)',     COUNT(*) FROM dm.HechoContinuidad
UNION ALL SELECT N'HechoCumplimiento (todos)',    COUNT(*) FROM dm.HechoCumplimientoEvaluaciones
UNION ALL SELECT N'HechoResultados (todos)',      COUNT(*) FROM dm.HechoResultadosEvaluacion;

PRINT N'=== 2. CONTEOS DE HECHOS POR FECHA DE CORTE ===';

SELECT
    t.fecha AS fecha_corte,
    (SELECT COUNT(*) FROM dm.HechoContinuidad hc WHERE hc.sk_tiempo_corte = t.sk_tiempo) AS filas_continuidad,
    (SELECT COUNT(*) FROM dm.HechoCumplimientoEvaluaciones hcu WHERE hcu.sk_tiempo_corte = t.sk_tiempo) AS filas_cumplimiento,
    (SELECT COUNT(*) FROM dm.HechoResultadosEvaluacion hr WHERE hr.sk_tiempo_corte = t.sk_tiempo) AS filas_resultados
  FROM dm.DimTiempo t
 WHERE t.sk_tiempo IN (
     SELECT DISTINCT sk_tiempo_corte FROM dm.HechoContinuidad
 )
 ORDER BY t.fecha;

-- ============================================================================
-- 6. INCIDENCIAS DE CALIDAD DETECTADAS
-- ============================================================================
PRINT N'=== 3. INCIDENCIAS DE CALIDAD REGISTRADAS ===';

SELECT
    fecha_corte,
    regla_codigo,
    severidad,
    COUNT(*) AS total_incidencias
  FROM dm.etl_incidencias_calidad
 GROUP BY fecha_corte, regla_codigo, severidad
 ORDER BY fecha_corte, regla_codigo;

-- ============================================================================
-- 7. CÁLCULO OFICIAL DE KPI-01 A KPI-05 AL CORTE 2026-11-23
-- ============================================================================
PRINT N'=== 4. KPI-01 (PSS-10) Y KPI-02 (PCL-5) AL CORTE 2026-11-23 ===';

SELECT
    CASE WHEN di.codigo_instrumento = N'PSS-10' THEN N'KPI-01' ELSE N'KPI-02' END AS kpi,
    di.codigo_instrumento,
    SUM(CAST(hr.ParesValidos AS INT))                                             AS pares_validos,
    CAST(SUM(CAST(hr.SumaInicial AS DECIMAL(12,4))) / NULLIF(SUM(CAST(hr.ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(8,2)) AS promedio_inicial,
    CAST(SUM(CAST(hr.SumaFinal AS DECIMAL(12,4))) / NULLIF(SUM(CAST(hr.ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(8,2))   AS promedio_final,
    CAST(SUM(CAST(hr.PuntosReduccion AS DECIMAL(12,4))) / NULLIF(SUM(CAST(hr.ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(8,2)) AS reduccion_promedio,
    di.meta_reduccion_operativa                                                   AS meta_pts,
    CASE
        WHEN SUM(CAST(hr.ParesValidos AS INT)) < 5 THEN N'SUPRIMIDO'
        WHEN (SUM(CAST(hr.PuntosReduccion AS DECIMAL(12,4))) / SUM(CAST(hr.ParesValidos AS DECIMAL(12,4)))) >= di.meta_reduccion_operativa THEN N'BUENO'
        WHEN (SUM(CAST(hr.PuntosReduccion AS DECIMAL(12,4))) / SUM(CAST(hr.ParesValidos AS DECIMAL(12,4)))) >= 0.0 THEN N'REGULAR'
        ELSE N'MALO'
    END                                                                           AS semaforo
  FROM dm.HechoResultadosEvaluacion hr
  JOIN dm.DimInstrumento di ON di.sk_instrumento = hr.sk_instrumento
 WHERE hr.sk_tiempo_corte = @sk_corte
 GROUP BY di.codigo_instrumento, di.meta_reduccion_operativa
 ORDER BY kpi;

PRINT N'=== 5. KPI-03 (CONTINUIDAD — REGLA D02) AL CORTE 2026-11-23 ===';

SELECT
    N'KPI-03'                                                                     AS kpi,
    COUNT(*)                                                                      AS total_asignaciones,
    SUM(CAST(EsEvaluable AS INT))                                                 AS estudiantes_evaluables,
    SUM(CAST(Continua AS INT))                                                    AS estudiantes_continuan,
    CAST(SUM(CAST(Continua AS DECIMAL(12,4))) * 100.0 / NULLIF(SUM(CAST(EsEvaluable AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS tasa_continuidad_pct,
    CASE
        WHEN SUM(CAST(EsEvaluable AS INT)) < 5 THEN N'SUPRIMIDO'
        WHEN (SUM(CAST(Continua AS DECIMAL(12,4))) * 100.0 / SUM(CAST(EsEvaluable AS DECIMAL(12,4)))) >= 80.0 THEN N'BUENO'
        WHEN (SUM(CAST(Continua AS DECIMAL(12,4))) * 100.0 / SUM(CAST(EsEvaluable AS DECIMAL(12,4)))) >= 60.0 THEN N'REGULAR'
        ELSE N'MALO'
    END                                                                           AS semaforo
  FROM dm.HechoContinuidad
 WHERE sk_tiempo_corte = @sk_corte;

-- Desglose por estado de continuidad (evidenciando Retirado Evaluable vs Retirado No evaluable - D02)
SELECT
    dec.codigo_estado,
    dec.nombre_estado,
    dec.EsEvaluable,
    COUNT(*)                        AS total_asignaciones,
    SUM(CAST(hc.Continua AS INT))   AS total_continuan
  FROM dm.HechoContinuidad hc
  JOIN dm.DimEstadoContinuidad dec ON dec.sk_estado_continuidad = hc.sk_estado_continuidad
 WHERE hc.sk_tiempo_corte = @sk_corte
 GROUP BY dec.codigo_estado, dec.nombre_estado, dec.EsEvaluable, dec.orden_visual
 ORDER BY dec.orden_visual;

PRINT N'=== 6. KPI-04 (CUMPLIMIENTO — REGLA D01) AL CORTE 2026-11-23 ===';

SELECT
    N'KPI-04'                                                                     AS kpi,
    COUNT(*)                                                                      AS oportunidades_abiertas,
    SUM(CAST(EsElegible AS INT))                                                  AS evaluaciones_elegibles,
    SUM(CAST(EsCompletadaElegible AS INT))                                        AS elegibles_completadas,
    SUM(CAST(EsEnVentana AS INT))                                                 AS total_en_ventana,
    SUM(CAST(EsTardia AS INT))                                                    AS total_tardias,
    SUM(CAST(EsPendiente AS INT))                                                 AS total_pendientes,
    SUM(CAST(EsVencida AS INT))                                                   AS total_vencidas,
    CAST(SUM(CAST(EsCompletadaElegible AS DECIMAL(12,4))) * 100.0 / NULLIF(SUM(CAST(EsElegible AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS tasa_cumplimiento_pct,
    CASE
        WHEN SUM(CAST(EsElegible AS INT)) < 5 THEN N'SUPRIMIDO'
        WHEN (SUM(CAST(EsCompletadaElegible AS DECIMAL(12,4))) * 100.0 / SUM(CAST(EsElegible AS DECIMAL(12,4)))) >= 90.0 THEN N'BUENO'
        WHEN (SUM(CAST(EsCompletadaElegible AS DECIMAL(12,4))) * 100.0 / SUM(CAST(EsElegible AS DECIMAL(12,4)))) >= 70.0 THEN N'REGULAR'
        ELSE N'MALO'
    END                                                                           AS semaforo
  FROM dm.HechoCumplimientoEvaluaciones
 WHERE sk_tiempo_corte = @sk_corte;

PRINT N'=== 7. KPI-05 (EFECTIVIDAD POR PRÁCTICA — dm.vw_HechoEfectividadPractica) AL CORTE 2026-11-23 ===';

-- Resumen KPI-05 por instrumento (agregado institucional: facultad_o_area = 'TODAS')
SELECT
    N'KPI-05'                                                                     AS kpi,
    codigo_instrumento,
    SUM(EsPracticaEvaluable)                                                      AS practicas_evaluables,
    SUM(CumpleMetaOperativa)                                                      AS practicas_cumplen_meta,
    CAST(SUM(CAST(CumpleMetaOperativa AS DECIMAL(12,4))) * 100.0 / NULLIF(SUM(CAST(EsPracticaEvaluable AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS kpi05_cumplimiento_meta_pct,
    CASE
        WHEN SUM(EsPracticaEvaluable) = 0 THEN N'SIN_DATOS'
        WHEN (SUM(CAST(CumpleMetaOperativa AS DECIMAL(12,4))) * 100.0 / SUM(CAST(EsPracticaEvaluable AS DECIMAL(12,4)))) >= 80.0 THEN N'BUENO'
        WHEN (SUM(CAST(CumpleMetaOperativa AS DECIMAL(12,4))) * 100.0 / SUM(CAST(EsPracticaEvaluable AS DECIMAL(12,4)))) >= 60.0 THEN N'REGULAR'
        ELSE N'MALO'
    END                                                                           AS semaforo
  FROM dm.vw_HechoEfectividadPractica
 WHERE sk_tiempo_corte = @sk_corte
   AND facultad_o_area = N'TODAS'
 GROUP BY codigo_instrumento
 ORDER BY codigo_instrumento;

-- Detalle por Práctica × Instrumento (facultad_o_area = 'TODAS')
SELECT
    codigo_instrumento,
    codigo_practica,
    nombre_practica,
    tipo_practica,
    ParesValidos,
    PromedioInicial,
    PromedioFinal,
    ReduccionPromedio,
    meta_reduccion_operativa AS meta_pts,
    EsPracticaEvaluable,
    CumpleMetaOperativa,
    EstadoSemaforo
  FROM dm.vw_HechoEfectividadPractica
 WHERE sk_tiempo_corte = @sk_corte
   AND facultad_o_area = N'TODAS'
 ORDER BY codigo_instrumento, codigo_practica;

PRINT N'Todas las verificaciones del Data Mart (grano, D01, D02, idempotencia y KPI-01..KPI-05) pasaron exitosamente.';
GO
