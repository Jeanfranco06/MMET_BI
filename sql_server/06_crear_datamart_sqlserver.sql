/* ============================================================================
   ARCHIVO:  06_crear_datamart_sqlserver.sql
   PROYECTO: MMET_BI — Modelo Físico del Data Mart (Esquema en Constelación)
   ÁMBITO:   Universidad Nacional de Trujillo (Semestre 2026-II)
   MOTOR:    Microsoft SQL Server 2019 / 2022 (T-SQL)
   ============================================================================
   Uso en SSMS o sqlcmd:
     sqlcmd -S localhost -E -C -i "sql_server\06_crear_datamart_sqlserver.sql"

   Descripción:
     Crea el esquema `dm` dentro de `MMET_BI_OLTP` con arquitectura Kimball en
     constelación:
       - Dimensiones conformadas: DimTiempo, DimEstudiante, DimPrograma, DimPractica
       - Dimensiones específicas: DimInstrumento, DimEventoIndice,
         DimEstadoContinuidad, DimMomento, DimEstadoEvaluacion
       - Tablas de hechos: HechoContinuidad, HechoCumplimientoEvaluaciones,
         HechoResultadosEvaluacion (con claves sustitutas y restricciones UNIQUE
         que garantizan estrictamente el grano)
       - Vista agregada: dm.vw_HechoEfectividadPractica (KPI-05, n >= 5)
       - Tablas de control ETL: dm.etl_log_ejecuciones, dm.etl_incidencias_calidad
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE MMET_BI_OLTP;
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'dm')
BEGIN
    EXEC(N'CREATE SCHEMA dm AUTHORIZATION dbo;');
END
GO

-- ============================================================================
-- 0. LIMPIEZA PREVIA DE OBJETOS DEL ESQUEMA dm (reconstrucción limpia)
-- ============================================================================

DROP VIEW  IF EXISTS dm.vw_HechoEfectividadPractica;
DROP TABLE IF EXISTS dm.etl_incidencias_calidad;
DROP TABLE IF EXISTS dm.HechoResultadosEvaluacion;
DROP TABLE IF EXISTS dm.HechoCumplimientoEvaluaciones;
DROP TABLE IF EXISTS dm.HechoContinuidad;
DROP TABLE IF EXISTS dm.etl_log_ejecuciones;
DROP TABLE IF EXISTS dm.DimEstadoEvaluacion;
DROP TABLE IF EXISTS dm.DimMomento;
DROP TABLE IF EXISTS dm.DimEstadoContinuidad;
DROP TABLE IF EXISTS dm.DimEventoIndice;
DROP TABLE IF EXISTS dm.DimInstrumento;
DROP TABLE IF EXISTS dm.DimPractica;
DROP TABLE IF EXISTS dm.DimPrograma;
DROP TABLE IF EXISTS dm.DimEstudiante;
DROP TABLE IF EXISTS dm.DimTiempo;
GO

-- ============================================================================
-- 1. TABLAS DE CONTROL Y AUDITORÍA ETL
-- ============================================================================

CREATE TABLE dm.etl_log_ejecuciones (
    id_ejecucion_etl       BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    fecha_corte            DATE           NOT NULL,
    inicio_ejecucion       DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_etl_log_ini DEFAULT (SYSDATETIMEOFFSET()),
    fin_ejecucion          DATETIMEOFFSET(0) NULL,
    estado                 NVARCHAR(20)   NOT NULL CONSTRAINT df_etl_log_est DEFAULT (N'EN_PROCESO'),
    filas_continuidad      INT            NOT NULL CONSTRAINT df_etl_log_fc  DEFAULT (0),
    filas_cumplimiento     INT            NOT NULL CONSTRAINT df_etl_log_fcu DEFAULT (0),
    filas_resultados       INT            NOT NULL CONSTRAINT df_etl_log_fr  DEFAULT (0),
    incidencias_detectadas INT            NOT NULL CONSTRAINT df_etl_log_inc DEFAULT (0),
    mensaje                NVARCHAR(500)  NULL,
    usuario_ejecucion      NVARCHAR(128)  NOT NULL CONSTRAINT df_etl_log_usr DEFAULT (ORIGINAL_LOGIN()),

    CONSTRAINT chk_etl_log_estado CHECK (estado IN (N'EN_PROCESO', N'EXITOSO', N'ERROR'))
);
GO

CREATE TABLE dm.etl_incidencias_calidad (
    id_incidencia      BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_ejecucion_etl   BIGINT         NOT NULL,
    fecha_corte        DATE           NOT NULL,
    regla_codigo       NVARCHAR(40)   NOT NULL,
    severidad          NVARCHAR(15)   NOT NULL,
    entidad_origen     NVARCHAR(60)   NOT NULL,
    id_registro_origen BIGINT         NULL,
    detalle            NVARCHAR(500)  NOT NULL,
    registrado_en      DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_etl_inc_reg DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT fk_etl_inc_ejecucion FOREIGN KEY (id_ejecucion_etl)
        REFERENCES dm.etl_log_ejecuciones (id_ejecucion_etl),
    CONSTRAINT chk_etl_inc_severidad CHECK (severidad IN (N'ADVERTENCIA', N'EXCLUSION', N'ERROR'))
);
GO

-- ============================================================================
-- 2. DIMENSIONES CONFORMADAS
-- ============================================================================

CREATE TABLE dm.DimTiempo (
    sk_tiempo           INT           NOT NULL PRIMARY KEY, -- YYYYMMDD o -1 (No aplica / Pendiente)
    fecha               DATE          NULL,
    anio                SMALLINT      NULL,
    trimestre           TINYINT       NULL,
    mes                 TINYINT       NULL,
    nombre_mes          NVARCHAR(20)  NULL,
    dia                 TINYINT       NULL,
    dia_semana          TINYINT       NULL,
    nombre_dia          NVARCHAR(20)  NULL,
    semana_anio         TINYINT       NULL,
    semestre_academico  NVARCHAR(20)  NOT NULL,
    etiqueta_fecha      NVARCHAR(30)  NOT NULL,
    es_no_aplica        BIT           NOT NULL CONSTRAINT df_dimt_na DEFAULT (0)
);
GO

CREATE UNIQUE INDEX uq_dim_tiempo_fecha
    ON dm.DimTiempo (fecha)
    WHERE fecha IS NOT NULL;
GO

CREATE TABLE dm.DimEstudiante (
    sk_estudiante      INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_estudiante      BIGINT         NOT NULL,
    codigo_anonimizado NVARCHAR(50)   NOT NULL,
    edad_anios         SMALLINT       NOT NULL,
    grupo_etario       NVARCHAR(20)   NOT NULL,
    sexo_codificado    NVARCHAR(20)   NOT NULL,
    facultad_o_area    NVARCHAR(80)   NOT NULL,
    ciclo_academico    SMALLINT       NOT NULL,

    CONSTRAINT uq_dim_est_id     UNIQUE (id_estudiante),
    CONSTRAINT uq_dim_est_codigo UNIQUE (codigo_anonimizado)
);
GO

CREATE TABLE dm.DimPrograma (
    sk_programa       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_programa       BIGINT         NOT NULL,
    codigo_programa   NVARCHAR(40)   NOT NULL,
    nombre_programa   NVARCHAR(150)  NOT NULL,
    periodo_academico NVARCHAR(20)   NOT NULL,
    fecha_inicio      DATE           NOT NULL,
    fecha_cierre      DATE           NOT NULL,
    estado_programa   NVARCHAR(20)   NOT NULL,

    CONSTRAINT uq_dim_prog_id     UNIQUE (id_programa),
    CONSTRAINT uq_dim_prog_codigo UNIQUE (codigo_programa)
);
GO

CREATE TABLE dm.DimPractica (
    sk_practica     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_practica     SMALLINT       NOT NULL,
    codigo_practica NVARCHAR(20)   NOT NULL,
    nombre_practica NVARCHAR(100)  NOT NULL,
    tipo_practica   NVARCHAR(20)   NOT NULL, -- Unicomponente | Mixto
    es_mixto        BIT            NOT NULL,

    CONSTRAINT uq_dim_pract_id     UNIQUE (id_practica),
    CONSTRAINT uq_dim_pract_codigo UNIQUE (codigo_practica),
    CONSTRAINT chk_dim_pract_tipo  CHECK (tipo_practica IN (N'Unicomponente', N'Mixto'))
);
GO

-- ============================================================================
-- 3. DIMENSIONES ESPECÍFICAS
-- ============================================================================

CREATE TABLE dm.DimInstrumento (
    sk_instrumento           INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_instrumento           SMALLINT       NOT NULL,
    codigo_instrumento       NVARCHAR(15)   NOT NULL, -- PSS-10 | PCL-5 (estrictamente separados)
    version_instrumento      NVARCHAR(30)   NOT NULL,
    nombre_instrumento       NVARCHAR(120)  NOT NULL,
    puntaje_minimo           SMALLINT       NOT NULL,
    puntaje_maximo           SMALLINT       NOT NULL,
    meta_reduccion_operativa DECIMAL(5,2)   NOT NULL, -- 4.00 para PSS-10 | 10.00 para PCL-5
    requiere_evento_indice   BIT            NOT NULL,

    CONSTRAINT uq_dim_instr_id     UNIQUE (id_instrumento),
    CONSTRAINT uq_dim_instr_codigo UNIQUE (codigo_instrumento, version_instrumento),
    CONSTRAINT chk_dim_instr_cod   CHECK (codigo_instrumento IN (N'PSS-10', N'PCL-5'))
);
GO

CREATE TABLE dm.DimEventoIndice (
    sk_evento_indice      INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_evento_indice      BIGINT         NULL, -- NULL únicamente para la fila -1 ('No aplica')
    codigo_evento_local   NVARCHAR(30)   NOT NULL,
    codigo_categoria      NVARCHAR(40)   NOT NULL,
    nombre_categoria      NVARCHAR(120)  NOT NULL,
    anio_ocurrencia_aprox SMALLINT       NULL,
    es_no_aplica          BIT            NOT NULL CONSTRAINT df_dimevt_na DEFAULT (0)
);
GO

CREATE UNIQUE INDEX uq_dim_evt_id
    ON dm.DimEventoIndice (id_evento_indice)
    WHERE id_evento_indice IS NOT NULL;
GO

CREATE TABLE dm.DimEstadoContinuidad (
    sk_estado_continuidad INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    codigo_estado         NVARCHAR(20)   NOT NULL,
    nombre_estado         NVARCHAR(30)   NOT NULL,
    EsEvaluable           BIT            NOT NULL,
    cuenta_continua       BIT            NOT NULL,
    orden_visual          TINYINT        NOT NULL,

    CONSTRAINT uq_dim_est_cont UNIQUE (codigo_estado, EsEvaluable),
    CONSTRAINT chk_dim_est_cont_cod CHECK (
        codigo_estado IN (N'ACTIVO', N'EN_RIESGO', N'ABANDONO', N'RETIRADO', N'NO_EVALUABLE')
    )
);
GO

CREATE TABLE dm.DimMomento (
    sk_momento     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    codigo_momento NVARCHAR(10)   NOT NULL,
    nombre_momento NVARCHAR(30)   NOT NULL,
    orden_momento  TINYINT        NOT NULL,

    CONSTRAINT uq_dim_mom_cod UNIQUE (codigo_momento),
    CONSTRAINT chk_dim_mom_cod CHECK (codigo_momento IN (N'INICIAL', N'FINAL'))
);
GO

CREATE TABLE dm.DimEstadoEvaluacion (
    sk_estado_evaluacion INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    codigo_estado        NVARCHAR(30)   NOT NULL,
    nombre_estado        NVARCHAR(30)   NOT NULL,
    es_completada        BIT            NOT NULL,
    orden_visual         TINYINT        NOT NULL,

    CONSTRAINT uq_dim_est_eval_cod UNIQUE (codigo_estado),
    CONSTRAINT chk_dim_est_eval_cod CHECK (
        codigo_estado IN (N'COMPLETADA_EN_VENTANA', N'COMPLETADA_TARDIA', N'PENDIENTE_EN_VENTANA', N'VENCIDA')
    )
);
GO

-- ============================================================================
-- 4. TABLAS DE HECHOS (CON CLAVES SUSTITUTAS Y RESTRICCIONES DE GRANO)
-- ============================================================================

-- Hecho 1: Continuidad (grano: estudiante × programa × fecha_corte)
CREATE TABLE dm.HechoContinuidad (
    id_hecho_continuidad     BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    sk_tiempo_corte          INT      NOT NULL,
    sk_estudiante            INT      NOT NULL,
    sk_programa              INT      NOT NULL,
    sk_practica              INT      NOT NULL,
    sk_estado_continuidad    INT      NOT NULL,
    id_asignacion            BIGINT   NOT NULL,
    EsEvaluable              TINYINT  NOT NULL,
    Continua                 TINYINT  NOT NULL,
    SesionesExigibles        INT      NOT NULL,
    Asistencias              INT      NOT NULL,
    Inasistencias            INT      NOT NULL,
    MinutosAsistidos         INT      NOT NULL CONSTRAINT df_hcont_min DEFAULT (0),
    fecha_primera_asistencia DATE     NULL,
    fecha_ultima_asistencia  DATE     NULL,
    id_ejecucion_etl         BIGINT   NOT NULL,

    CONSTRAINT fk_hcont_tiempo      FOREIGN KEY (sk_tiempo_corte)       REFERENCES dm.DimTiempo (sk_tiempo),
    CONSTRAINT fk_hcont_estudiante  FOREIGN KEY (sk_estudiante)         REFERENCES dm.DimEstudiante (sk_estudiante),
    CONSTRAINT fk_hcont_programa    FOREIGN KEY (sk_programa)           REFERENCES dm.DimPrograma (sk_programa),
    CONSTRAINT fk_hcont_practica    FOREIGN KEY (sk_practica)           REFERENCES dm.DimPractica (sk_practica),
    CONSTRAINT fk_hcont_estado      FOREIGN KEY (sk_estado_continuidad) REFERENCES dm.DimEstadoContinuidad (sk_estado_continuidad),
    CONSTRAINT fk_hcont_etl         FOREIGN KEY (id_ejecucion_etl)      REFERENCES dm.etl_log_ejecuciones (id_ejecucion_etl),

    CONSTRAINT uq_hecho_continuidad_grano UNIQUE (sk_estudiante, sk_programa, sk_tiempo_corte),
    CONSTRAINT chk_hcont_flags CHECK (EsEvaluable IN (0, 1) AND Continua IN (0, 1) AND Continua <= EsEvaluable),
    CONSTRAINT chk_hcont_conteos CHECK (SesionesExigibles >= 0 AND Asistencias >= 0 AND Inasistencias >= 0)
);
GO

-- Hecho 2: Cumplimiento de Evaluaciones (grano: oportunidad_evaluacion × fecha_corte)
CREATE TABLE dm.HechoCumplimientoEvaluaciones (
    id_hecho_cumplimiento BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_oportunidad        BIGINT   NOT NULL,
    sk_tiempo_corte       INT      NOT NULL,
    sk_tiempo_previsto    INT      NOT NULL,
    sk_tiempo_realizacion INT      NOT NULL, -- -1 si no realizada al corte
    sk_estudiante         INT      NOT NULL,
    sk_programa           INT      NOT NULL,
    sk_practica           INT      NOT NULL,
    sk_instrumento        INT      NOT NULL,
    sk_evento_indice      INT      NOT NULL, -- -1 para PSS-10
    sk_momento            INT      NOT NULL,
    sk_estado_evaluacion  INT      NOT NULL,
    Oportunidad           TINYINT  NOT NULL CONSTRAINT df_hcump_op DEFAULT (1),
    EsElegible            TINYINT  NOT NULL,
    EsCompletadaElegible  TINYINT  NOT NULL,
    EsEnVentana           TINYINT  NOT NULL,
    EsTardia              TINYINT  NOT NULL,
    EsPendiente           TINYINT  NOT NULL,
    EsVencida             TINYINT  NOT NULL,
    PuntajeObtenido       SMALLINT NULL,
    NumeroVersion         SMALLINT NULL,
    id_resultado_vigente  BIGINT   NULL,
    id_ejecucion_etl      BIGINT   NOT NULL,

    CONSTRAINT fk_hcump_tcorte      FOREIGN KEY (sk_tiempo_corte)       REFERENCES dm.DimTiempo (sk_tiempo),
    CONSTRAINT fk_hcump_tprev       FOREIGN KEY (sk_tiempo_previsto)    REFERENCES dm.DimTiempo (sk_tiempo),
    CONSTRAINT fk_hcump_treal       FOREIGN KEY (sk_tiempo_realizacion) REFERENCES dm.DimTiempo (sk_tiempo),
    CONSTRAINT fk_hcump_estudiante  FOREIGN KEY (sk_estudiante)         REFERENCES dm.DimEstudiante (sk_estudiante),
    CONSTRAINT fk_hcump_programa    FOREIGN KEY (sk_programa)           REFERENCES dm.DimPrograma (sk_programa),
    CONSTRAINT fk_hcump_practica    FOREIGN KEY (sk_practica)           REFERENCES dm.DimPractica (sk_practica),
    CONSTRAINT fk_hcump_instrumento FOREIGN KEY (sk_instrumento)        REFERENCES dm.DimInstrumento (sk_instrumento),
    CONSTRAINT fk_hcump_evento      FOREIGN KEY (sk_evento_indice)      REFERENCES dm.DimEventoIndice (sk_evento_indice),
    CONSTRAINT fk_hcump_momento     FOREIGN KEY (sk_momento)            REFERENCES dm.DimMomento (sk_momento),
    CONSTRAINT fk_hcump_estado      FOREIGN KEY (sk_estado_evaluacion)  REFERENCES dm.DimEstadoEvaluacion (sk_estado_evaluacion),
    CONSTRAINT fk_hcump_etl         FOREIGN KEY (id_ejecucion_etl)      REFERENCES dm.etl_log_ejecuciones (id_ejecucion_etl),

    CONSTRAINT uq_hecho_cumplimiento_grano UNIQUE (id_oportunidad, sk_tiempo_corte),
    CONSTRAINT chk_hcump_flags CHECK (
        Oportunidad = 1
        AND EsElegible IN (0, 1)
        AND EsCompletadaElegible IN (0, 1)
        AND EsCompletadaElegible <= EsElegible
        AND EsEnVentana IN (0, 1)
        AND EsTardia IN (0, 1)
        AND EsPendiente IN (0, 1)
        AND EsVencida IN (0, 1)
        AND (EsEnVentana + EsTardia + EsPendiente + EsVencida) = 1
    )
);
GO

-- Hecho 3: Resultados de Evaluación Pareados (grano: par válido inicial-final en ventana
--          del mismo estudiante, programa, instrumento, versión y mismo evento índice en PCL-5)
CREATE TABLE dm.HechoResultadosEvaluacion (
    id_hecho_resultado     BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    sk_tiempo_corte        INT      NOT NULL,
    sk_tiempo_final        INT      NOT NULL,
    sk_estudiante          INT      NOT NULL,
    sk_programa            INT      NOT NULL,
    sk_practica            INT      NOT NULL,
    sk_instrumento         INT      NOT NULL,
    sk_evento_indice       INT      NOT NULL, -- -1 para PSS-10
    id_asignacion          BIGINT   NOT NULL,
    id_resultado_inicial   BIGINT   NOT NULL,
    id_resultado_final     BIGINT   NOT NULL,
    id_version_instrumento BIGINT   NULL,
    ParesValidos           TINYINT  NOT NULL CONSTRAINT df_hres_pares DEFAULT (1),
    SumaInicial            SMALLINT NOT NULL,
    SumaFinal              SMALLINT NOT NULL,
    PuntosReduccion        SMALLINT NOT NULL, -- SumaInicial - SumaFinal
    EsReduccion            TINYINT  NOT NULL,
    EsSinCambio            TINYINT  NOT NULL,
    EsIncremento           TINYINT  NOT NULL,
    CumpleMetaIndividual   TINYINT  NOT NULL,
    id_ejecucion_etl       BIGINT   NOT NULL,

    CONSTRAINT fk_hres_tcorte      FOREIGN KEY (sk_tiempo_corte)  REFERENCES dm.DimTiempo (sk_tiempo),
    CONSTRAINT fk_hres_tfinal      FOREIGN KEY (sk_tiempo_final)  REFERENCES dm.DimTiempo (sk_tiempo),
    CONSTRAINT fk_hres_estudiante  FOREIGN KEY (sk_estudiante)    REFERENCES dm.DimEstudiante (sk_estudiante),
    CONSTRAINT fk_hres_programa    FOREIGN KEY (sk_programa)      REFERENCES dm.DimPrograma (sk_programa),
    CONSTRAINT fk_hres_practica    FOREIGN KEY (sk_practica)      REFERENCES dm.DimPractica (sk_practica),
    CONSTRAINT fk_hres_instrumento FOREIGN KEY (sk_instrumento)   REFERENCES dm.DimInstrumento (sk_instrumento),
    CONSTRAINT fk_hres_evento      FOREIGN KEY (sk_evento_indice) REFERENCES dm.DimEventoIndice (sk_evento_indice),
    CONSTRAINT fk_hres_etl         FOREIGN KEY (id_ejecucion_etl) REFERENCES dm.etl_log_ejecuciones (id_ejecucion_etl),

    CONSTRAINT uq_hecho_resultados_grano UNIQUE (sk_estudiante, sk_programa, sk_instrumento, sk_evento_indice, sk_tiempo_corte),
    CONSTRAINT chk_hres_pares CHECK (
        ParesValidos = 1
        AND PuntosReduccion = (SumaInicial - SumaFinal)
        AND EsReduccion IN (0, 1)
        AND EsSinCambio IN (0, 1)
        AND EsIncremento IN (0, 1)
        AND (EsReduccion + EsSinCambio + EsIncremento) = 1
        AND CumpleMetaIndividual IN (0, 1)
    )
);
GO

-- ============================================================================
-- 5. ÍNDICES ANALÍTICOS EN TABLAS DE HECHOS
-- ============================================================================

CREATE INDEX ix_hcont_corte_practica
    ON dm.HechoContinuidad (sk_tiempo_corte, sk_practica, sk_estado_continuidad)
    INCLUDE (EsEvaluable, Continua, SesionesExigibles, Asistencias, Inasistencias);

CREATE INDEX ix_hcump_corte_instr_estado
    ON dm.HechoCumplimientoEvaluaciones (sk_tiempo_corte, sk_instrumento, sk_estado_evaluacion)
    INCLUDE (EsElegible, EsCompletadaElegible, EsEnVentana, EsTardia, EsPendiente, EsVencida);

CREATE INDEX ix_hres_corte_practica_instr
    ON dm.HechoResultadosEvaluacion (sk_tiempo_corte, sk_practica, sk_instrumento, sk_estudiante)
    INCLUDE (ParesValidos, SumaInicial, SumaFinal, PuntosReduccion);
GO

-- ============================================================================
-- 6. SEMILLA DE DIMENSIONES ESTÁTICAS Y REGISTROS ESPECIALES (-1)
-- ============================================================================

-- 6.1 DimTiempo: fila especial -1 ('No aplica / Pendiente') + calendario 2026-01-01 a 2027-06-30
INSERT INTO dm.DimTiempo (
    sk_tiempo, fecha, anio, trimestre, mes, nombre_mes,
    dia, dia_semana, nombre_dia, semana_anio,
    semestre_academico, etiqueta_fecha, es_no_aplica
)
VALUES (
    -1, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL,
    N'NO_APLICA', N'No aplica / Pendiente', 1
);

;WITH Fechas AS (
    SELECT CAST('2026-01-01' AS DATE) AS f
    UNION ALL
    SELECT DATEADD(DAY, 1, f)
      FROM Fechas
     WHERE f < CAST('2027-06-30' AS DATE)
)
INSERT INTO dm.DimTiempo (
    sk_tiempo, fecha, anio, trimestre, mes, nombre_mes,
    dia, dia_semana, nombre_dia, semana_anio,
    semestre_academico, etiqueta_fecha, es_no_aplica
)
SELECT
    CONVERT(INT, CONVERT(CHAR(8), f, 112)) AS sk_tiempo,
    f AS fecha,
    DATEPART(YEAR, f) AS anio,
    DATEPART(QUARTER, f) AS trimestre,
    DATEPART(MONTH, f) AS mes,
    CASE DATEPART(MONTH, f)
        WHEN 1 THEN N'Enero'      WHEN 2 THEN N'Febrero'   WHEN 3 THEN N'Marzo'
        WHEN 4 THEN N'Abril'      WHEN 5 THEN N'Mayo'      WHEN 6 THEN N'Junio'
        WHEN 7 THEN N'Julio'      WHEN 8 THEN N'Agosto'    WHEN 9 THEN N'Septiembre'
        WHEN 10 THEN N'Octubre'   WHEN 11 THEN N'Noviembre' ELSE N'Diciembre'
    END AS nombre_mes,
    DATEPART(DAY, f) AS dia,
    DATEPART(WEEKDAY, f) AS dia_semana,
    DATENAME(WEEKDAY, f) AS nombre_dia,
    DATEPART(ISO_WEEK, f) AS semana_anio,
    CASE
        WHEN f >= '2026-07-01' AND f <= '2027-01-31' THEN N'2026-II'
        WHEN f < '2026-07-01' THEN N'2026-I'
        ELSE N'2027-I'
    END AS semestre_academico,
    CONVERT(NVARCHAR(10), f, 23) AS etiqueta_fecha,
    0 AS es_no_aplica
  FROM Fechas
OPTION (MAXRECURSION 1000);
GO

-- 6.2 DimEventoIndice: fila especial -1 ('No aplica') para PSS-10
SET IDENTITY_INSERT dm.DimEventoIndice ON;
INSERT INTO dm.DimEventoIndice (
    sk_evento_indice, id_evento_indice, codigo_evento_local,
    codigo_categoria, nombre_categoria, anio_ocurrencia_aprox, es_no_aplica
)
VALUES (
    -1, NULL, N'NO_APLICA',
    N'NO_APLICA', N'No aplica', NULL, 1
);
SET IDENTITY_INSERT dm.DimEventoIndice OFF;
GO

-- 6.3 DimEstadoContinuidad (incluye D02: Retirado con EsEvaluable=1 y Retirado con EsEvaluable=0)
INSERT INTO dm.DimEstadoContinuidad (codigo_estado, nombre_estado, EsEvaluable, cuenta_continua, orden_visual)
VALUES
    (N'ACTIVO',       N'Activo',       1, 1, 1),
    (N'EN_RIESGO',    N'En riesgo',    1, 1, 2),
    (N'ABANDONO',     N'Abandono',     1, 0, 3),
    (N'RETIRADO',     N'Retirado',     1, 0, 4),
    (N'RETIRADO',     N'Retirado',     0, 0, 5),
    (N'NO_EVALUABLE', N'No evaluable', 0, 0, 6);
GO

-- 6.4 DimMomento
INSERT INTO dm.DimMomento (codigo_momento, nombre_momento, orden_momento)
VALUES
    (N'INICIAL', N'Inicial', 1),
    (N'FINAL',   N'Final',   2);
GO

-- 6.5 DimEstadoEvaluacion
INSERT INTO dm.DimEstadoEvaluacion (codigo_estado, nombre_estado, es_completada, orden_visual)
VALUES
    (N'COMPLETADA_EN_VENTANA', N'En ventana', 1, 1),
    (N'COMPLETADA_TARDIA',     N'Tardía',     1, 2),
    (N'PENDIENTE_EN_VENTANA',  N'Pendiente',  0, 3),
    (N'VENCIDA',               N'Vencida',    0, 4);
GO

-- ============================================================================
-- 7. VISTA AGREGADA: dm.vw_HechoEfectividadPractica (KPI-05 / RG-02)
--    Permite filtrar por Facultad/Área (vía DimEstudiante) o consultar el
--    agregado institucional (facultad_o_area = N'TODAS') ANTES de agrupar por
--    Práctica principal × Instrumento y exigir ParesValidos >= 5.
--    Meta operativa: >= 4.0 pts en PSS-10 | >= 10.0 pts en PCL-5.
-- ============================================================================

CREATE OR ALTER VIEW dm.vw_HechoEfectividadPractica
AS
SELECT
    t.sk_tiempo                                                    AS sk_tiempo_corte,
    t.fecha                                                        AS fecha_corte,
    t.semestre_academico                                           AS periodo_academico,
    CASE
        WHEN GROUPING(e.facultad_o_area) = 1 THEN N'TODAS'
        ELSE e.facultad_o_area
    END                                                            AS facultad_o_area,
    p.sk_practica,
    p.codigo_practica,
    p.nombre_practica,
    p.tipo_practica,
    i.sk_instrumento,
    i.codigo_instrumento,
    i.version_instrumento,
    i.meta_reduccion_operativa,
    SUM(CAST(h.ParesValidos AS INT))                               AS ParesValidos,
    SUM(CAST(h.SumaInicial AS INT))                                AS SumaInicial,
    SUM(CAST(h.SumaFinal AS INT))                                  AS SumaFinal,
    SUM(CAST(h.PuntosReduccion AS INT))                            AS SumaReduccion,
    CASE
        WHEN SUM(CAST(h.ParesValidos AS INT)) >= 5
        THEN CAST(SUM(CAST(h.SumaInicial AS DECIMAL(12,4))) / SUM(CAST(h.ParesValidos AS DECIMAL(12,4))) AS DECIMAL(8,2))
        ELSE NULL
    END                                                            AS PromedioInicial,
    CASE
        WHEN SUM(CAST(h.ParesValidos AS INT)) >= 5
        THEN CAST(SUM(CAST(h.SumaFinal AS DECIMAL(12,4))) / SUM(CAST(h.ParesValidos AS DECIMAL(12,4))) AS DECIMAL(8,2))
        ELSE NULL
    END                                                            AS PromedioFinal,
    CASE
        WHEN SUM(CAST(h.ParesValidos AS INT)) >= 5
        THEN CAST(SUM(CAST(h.PuntosReduccion AS DECIMAL(12,4))) / SUM(CAST(h.ParesValidos AS DECIMAL(12,4))) AS DECIMAL(8,2))
        ELSE NULL
    END                                                            AS ReduccionPromedio,
    CASE
        WHEN SUM(CAST(h.ParesValidos AS INT)) >= 5 THEN 1 ELSE 0
    END                                                            AS EsPracticaEvaluable,
    CASE
        WHEN SUM(CAST(h.ParesValidos AS INT)) >= 5
         AND (SUM(CAST(h.PuntosReduccion AS DECIMAL(12,4))) / SUM(CAST(h.ParesValidos AS DECIMAL(12,4)))) >= i.meta_reduccion_operativa
        THEN 1 ELSE 0
    END                                                            AS CumpleMetaOperativa,
    CASE
        WHEN SUM(CAST(h.ParesValidos AS INT)) < 5 THEN N'SUPRIMIDO'
        WHEN (SUM(CAST(h.PuntosReduccion AS DECIMAL(12,4))) / SUM(CAST(h.ParesValidos AS DECIMAL(12,4)))) >= i.meta_reduccion_operativa THEN N'BUENO'
        WHEN (SUM(CAST(h.PuntosReduccion AS DECIMAL(12,4))) / SUM(CAST(h.ParesValidos AS DECIMAL(12,4)))) >= 0.0 THEN N'REGULAR'
        ELSE N'MALO'
    END                                                            AS EstadoSemaforo
  FROM dm.HechoResultadosEvaluacion h
  JOIN dm.DimTiempo      t ON t.sk_tiempo      = h.sk_tiempo_corte
  JOIN dm.DimEstudiante  e ON e.sk_estudiante  = h.sk_estudiante
  JOIN dm.DimPractica    p ON p.sk_practica    = h.sk_practica
  JOIN dm.DimInstrumento i ON i.sk_instrumento = h.sk_instrumento
 GROUP BY GROUPING SETS (
    (t.sk_tiempo, t.fecha, t.semestre_academico, p.sk_practica, p.codigo_practica, p.nombre_practica, p.tipo_practica, i.sk_instrumento, i.codigo_instrumento, i.version_instrumento, i.meta_reduccion_operativa),
    (t.sk_tiempo, t.fecha, t.semestre_academico, e.facultad_o_area, p.sk_practica, p.codigo_practica, p.nombre_practica, p.tipo_practica, i.sk_instrumento, i.codigo_instrumento, i.version_instrumento, i.meta_reduccion_operativa)
 );
GO

PRINT N'Modelo físico del Data Mart (esquema dm en constelación) creado correctamente.';
GO
