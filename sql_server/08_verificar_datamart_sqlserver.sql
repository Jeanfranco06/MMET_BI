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
-- 4. PRUEBA DE IDEMPOTENCIA EN CORTE 2026-11-23
-- ============================================================================
DECLARE @c1 INT = (SELECT COUNT(*) FROM dm.HechoContinuidad WHERE sk_tiempo_corte = @sk_corte);
DECLARE @u1 INT = (SELECT COUNT(*) FROM dm.HechoCumplimientoEvaluaciones WHERE sk_tiempo_corte = @sk_corte);
DECLARE @r1 INT = (SELECT COUNT(*) FROM dm.HechoResultadosEvaluacion WHERE sk_tiempo_corte = @sk_corte);

EXEC dm.usp_ejecutar_etl @fecha_corte = @fecha_corte;

DECLARE @c2 INT = (SELECT COUNT(*) FROM dm.HechoContinuidad WHERE sk_tiempo_corte = @sk_corte);
DECLARE @u2 INT = (SELECT COUNT(*) FROM dm.HechoCumplimientoEvaluaciones WHERE sk_tiempo_corte = @sk_corte);
DECLARE @r2 INT = (SELECT COUNT(*) FROM dm.HechoResultadosEvaluacion WHERE sk_tiempo_corte = @sk_corte);

IF @c1 <> @c2 OR @u1 <> @u2 OR @r1 <> @r2
    THROW 53008, N'Fallo de idempotencia: los conteos cambiaron al re-ejecutar el ETL para el mismo corte.', 1;

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
