/* ============================================================================
   ARCHIVO:   02_poblar_datos_10k_sqlserver.sql
   PROPÓSITO: Poblar MMET_BI_OLTP (100% caso universitario Trujillo 2026-II,
              sin tabla de fuentes externas) con ~10,500+ asistencias (~20,000
              registros totales), calibrado paramétricamente con las estadísticas
              reales de los datasets universitarios analizados:
                - PSS-10 basal: media ~20.5, DE ~6.8 (calibrado Icesi/Rowan)
                - Prevalencia de evento índice: ~40% (calibrado Kabul/CERCI-3)
                - PCL-5 basal en expuestos: media ~38.5, DE ~14.0 (calibrado Kabul)
                - Adherencia/continuidad: ~58% constante, ~18% riesgo, ~10% abandono,
                  ~11% retiro, ~3% sin inicio (calibrado Mendeley SKT1)
                - Variables complementarias HRV/Sueño (calibrado Sensores México)
   MOTOR:     Microsoft SQL Server 2019 / 2022 (T-SQL)
   ============================================================================
   Uso sugerido en SSMS o sqlcmd:
     sqlcmd -S localhost -E -i "02_poblar_datos_10k_sqlserver.sql"
   ADVERTENCIA: este archivo limpia y vuelve a poblar el dataset sintético.
   Para habilitar versiones de cuestionarios después de poblar, ejecutar
   04_configurar_versiones_cuestionarios_sqlserver.sql. Los totales generados
   aquí no se convierten retroactivamente en respuestas por ítem.
   ============================================================================ */

USE MMET_BI_OLTP;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

BEGIN TRANSACTION;

-- ============================================================================
-- 0. LIMPIEZA IDEMPOTENTE (orden inverso de FKs + reseed seguro de IDENTITY)
-- ============================================================================

DELETE FROM dbo.mediciones_complementarias;
DELETE FROM dbo.historial_estados_asignacion;
DELETE FROM dbo.historial_estados_sesion;
UPDATE dbo.resultados_evaluacion SET id_resultado_reemplazado = NULL;
DELETE FROM dbo.resultados_evaluacion;
DELETE FROM dbo.oportunidades_evaluacion;
DELETE FROM dbo.eventos_indice;
DELETE FROM dbo.asistencias;
DELETE FROM dbo.asignaciones;
DELETE FROM dbo.sesiones;
DELETE FROM dbo.programas;
DELETE FROM dbo.estudiantes;
DELETE FROM dbo.cat_variables_complementarias;
DELETE FROM dbo.cat_categorias_evento_indice;
DELETE FROM dbo.cat_instrumentos;
DELETE FROM dbo.cat_practicas;

-- Solo reseed en tablas que ya tuvieron inserciones previas (evita iniciar en 0)
DECLARE @reseed_sql NVARCHAR(MAX) = N'';
SELECT @reseed_sql = @reseed_sql +
       N'DBCC CHECKIDENT (''' + QUOTENAME(SCHEMA_NAME(t.schema_id)) + N'.' + QUOTENAME(t.name) + N''', RESEED, 0) WITH NO_INFOMSGS;' + CHAR(10)
FROM sys.tables t
JOIN sys.identity_columns ic ON ic.object_id = t.object_id
WHERE SCHEMA_NAME(t.schema_id) = N'dbo'
  AND ic.last_value IS NOT NULL;

IF LEN(@reseed_sql) > 0
    EXEC sp_executesql @reseed_sql;

-- ============================================================================
-- 1. CATÁLOGOS DEL DOMINIO (PRÁCTICAS P-01..P-04 + MIXTO)
-- ============================================================================

SET IDENTITY_INSERT dbo.cat_practicas ON;
INSERT INTO dbo.cat_practicas (id_practica, codigo_practica, nombre_practica, descripcion, es_mixto) VALUES
(1, N'P-01',  N'Atención plena a la respiración', N'Atención centrada en la respiración',                     0),
(2, N'P-02',  N'Escaneo corporal',                N'Atención a las sensaciones corporales',                   0),
(3, N'P-03',  N'Meditación caminando',            N'Atención consciente durante el movimiento',               0),
(4, N'P-04',  N'Meditación de bondad amorosa',    N'Cultivo de amabilidad y compasión',                       0),
(5, N'MIXTO', N'Mixto',                           N'Combina varias técnicas a lo largo de las sesiones',      1);
SET IDENTITY_INSERT dbo.cat_practicas OFF;

SET IDENTITY_INSERT dbo.cat_instrumentos ON;
INSERT INTO dbo.cat_instrumentos (
    id_instrumento, codigo_instrumento, version_instrumento, nombre_instrumento,
    puntaje_minimo, puntaje_maximo, requiere_evento_indice
) VALUES
(1, N'PSS-10', N'v1.0-ES',  N'Escala de Estrés Percibido (10 ítems)',          0, 40, 0),
(2, N'PCL-5',  N'DSM-5-ES', N'Lista de Chequeo de TEPT para DSM-5 (20 ítems)', 0, 80, 1);
SET IDENTITY_INSERT dbo.cat_instrumentos OFF;

SET IDENTITY_INSERT dbo.cat_categorias_evento_indice ON;
INSERT INTO dbo.cat_categorias_evento_indice (id_categoria_evento, codigo_categoria, nombre_categoria) VALUES
(1, N'ACCIDENTE_GRAVE',         N'Accidente de tránsito o lesión grave'),
(2, N'DESASTRE_NATURAL',        N'Desastre natural o emergencia climática'),
(3, N'VIOLENCIA_INTERPERSONAL', N'Exposición a violencia interpersonal'),
(4, N'PERDIDA_SUBITA',          N'Pérdida súbita de un ser querido'),
(5, N'EMERGENCIA_MEDICA',       N'Emergencia médica grave propia o familiar'),
(6, N'OTRO_CODIFICADO',         N'Otro evento potencialmente traumático codificado');
SET IDENTITY_INSERT dbo.cat_categorias_evento_indice OFF;

SET IDENTITY_INSERT dbo.cat_variables_complementarias ON;
INSERT INTO dbo.cat_variables_complementarias (
    id_variable, codigo_variable, nombre_variable, unidad_medida, metodo_medicion, valor_minimo, valor_maximo
) VALUES
(1, N'HRV_RMSSD',       N'Variabilidad de la Frecuencia Cardíaca (RMSSD)', N'ms',     N'Sensor PPG óptico',   10.000, 200.000),
(2, N'HORAS_SUENO',     N'Duración promedio de sueño nocturno',            N'horas',  N'Autorreporte diario',  2.000,  14.000),
(3, N'AFECTO_POSITIVO', N'Afecto positivo semanal (PANAS-P)',              N'puntos', N'Cuestionario PANAS',  10.000,  50.000);
SET IDENTITY_INSERT dbo.cat_variables_complementarias OFF;

-- Tabla auxiliar de números 1..1000
DROP TABLE IF EXISTS #nums, #tmp_asig_stage, #tmp_resultados;
CREATE TABLE #nums (n INT NOT NULL PRIMARY KEY);
;WITH e1(n) AS (SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1
                UNION ALL SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1),
      e2(n) AS (SELECT 1 FROM e1 a CROSS JOIN e1 b),
      e3(n) AS (SELECT ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) FROM e2 a CROSS JOIN e1 b)
INSERT INTO #nums (n) SELECT n FROM e3;

-- ============================================================================
-- 2. ESTUDIANTES (1,000 estudiantes universitarios anonimizados, 18+ años)
-- ============================================================================

;WITH base_est AS (
    SELECT
        n,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('EST-EDAD-', n))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_edad,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('EST-SEXO-', n))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_sexo,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('EST-FAC-',  n))) AS BIGINT)) % 8 AS INT) + 1 AS idx_fac,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('EST-CIC-',  n))) AS BIGINT)) % 10 AS SMALLINT) + 1 AS ciclo
    FROM #nums
),
est_calc AS (
    SELECT
        *,
        CAST(18 + FLOOR(POWER(u_edad, 1.65) * 11) AS SMALLINT) AS edad_anios
    FROM base_est
)
INSERT INTO dbo.estudiantes (
    codigo_anonimizado, edad_anios, grupo_etario, sexo_codificado, facultad_o_area, ciclo_academico
)
SELECT
    N'UNT26-EST-' + RIGHT(N'0000' + CAST(n AS NVARCHAR(10)), 4),
    edad_anios,
    CASE
        WHEN edad_anios BETWEEN 18 AND 20 THEN N'18-20'
        WHEN edad_anios BETWEEN 21 AND 23 THEN N'21-23'
        WHEN edad_anios BETWEEN 24 AND 26 THEN N'24-26'
        ELSE N'27+'
    END,
    CASE WHEN u_sexo < 0.54 THEN N'F' WHEN u_sexo < 0.96 THEN N'M' ELSE N'NO_ESPECIFICADO' END,
    CHOOSE(idx_fac,
        N'Ingeniería', N'Ciencias Médicas', N'Ciencias Sociales',
        N'Educación y Ciencias de la Comunicación', N'Derecho y Ciencias Políticas',
        N'Ciencias Económicas', N'Ciencias Biológicas', N'Farmacia y Bioquímica'
    ),
    ciclo
FROM est_calc
ORDER BY n;

-- ============================================================================
-- 3. PROGRAMAS (15 programas 2026-II: 3 por cada práctica P-01..P-04 y MIXTO)
-- ============================================================================

;WITH base_prog AS (
    SELECT
        n,
        CAST(1 + ((n - 1) % 5) AS SMALLINT) AS id_practica_principal,
        -- 12 programas FINALIZADO (ago-oct/nov 2026) y 3 programas ACTIVO (oct-dic 2026)
        CASE
            WHEN n <= 12 THEN DATEADD(DAY, (n - 1) * 3, CAST('20260810' AS DATE))
            ELSE              DATEADD(DAY, (n - 13) * 5, CAST('20261005' AS DATE))
        END AS fecha_inicio,
        CASE WHEN n <= 12 THEN N'FINALIZADO' ELSE N'ACTIVO' END AS estado_programa
    FROM #nums
    WHERE n <= 15
)
INSERT INTO dbo.programas (
    codigo_programa, nombre_programa, periodo_academico,
    id_practica_principal, fecha_inicio, fecha_cierre,
    dias_ventana_inicial, dias_ventana_final,
    ventana_inicial_inicio, ventana_inicial_fin, ventana_final_inicio, ventana_final_fin,
    estado_programa
)
SELECT
    N'UNT-2026-II-' + cp.codigo_practica + N'-C' + RIGHT(N'00' + CAST(bp.n AS NVARCHAR(5)), 2),
    N'Programa ' + cp.nombre_practica + N' 2026-II (Cohorte ' + RIGHT(N'00' + CAST(bp.n AS NVARCHAR(5)), 2) + N')',
    N'2026-II',
    bp.id_practica_principal,
    bp.fecha_inicio,
    DATEADD(DAY, 63, bp.fecha_inicio),
    14, 14,
    DATEADD(DAY, -14, bp.fecha_inicio),
    bp.fecha_inicio,
    DATEADD(DAY, 63, bp.fecha_inicio),
    DATEADD(DAY, 77, bp.fecha_inicio),
    bp.estado_programa
FROM base_prog bp
JOIN dbo.cat_practicas cp ON cp.id_practica = bp.id_practica_principal
ORDER BY bp.n;

-- ============================================================================
-- 4. SESIONES (150 sesiones: 10 semanales por programa, siempre P-01..P-04)
-- ============================================================================

;WITH ses_gen AS (
    SELECT
        p.id_programa,
        CAST(s.n AS SMALLINT) AS numero_sesion,
        -- Si el programa es MIXTO (5), rota las 4 técnicas P-01..P-04; si no, usa su práctica principal
        CASE WHEN p.id_practica_principal = 5 THEN CAST(1 + ((s.n - 1) % 4) AS SMALLINT) ELSE p.id_practica_principal END AS id_practica_tecnica,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('SES-MOD-', p.id_programa, '-', s.n))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_mod,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('SES-DUR-', p.id_programa, '-', s.n))) AS BIGINT)) % 3 AS INT) + 1 AS idx_dur,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('SES-EST-', p.id_programa, '-', s.n))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_est,
        DATEADD(DAY, (s.n - 1) * 7, p.fecha_inicio) AS fecha_sesion,
        p.estado_programa
    FROM dbo.programas p
    CROSS JOIN #nums s
    WHERE s.n <= 10
),
ses_final AS (
    SELECT
        *,
        CASE
            WHEN estado_programa = N'ACTIVO' AND numero_sesion >= 9 THEN N'PROGRAMADA'
            WHEN numero_sesion = 5 AND u_est < 0.65                 THEN N'CANCELADA'
            WHEN numero_sesion = 8 AND u_est < 0.30                 THEN N'NO_REALIZADA'
            ELSE N'REALIZADA'
        END AS estado_sesion
    FROM ses_gen
)
INSERT INTO dbo.sesiones (
    id_programa, numero_sesion, id_practica_tecnica, modalidad,
    duracion_programada_min, fecha_sesion, fecha_hora_inicio, estado_sesion, motivo_estado_codigo
)
SELECT
    id_programa, numero_sesion, id_practica_tecnica,
    CASE WHEN u_mod < 0.55 THEN N'PRESENCIAL' WHEN u_mod < 0.85 THEN N'VIRTUAL' ELSE N'HIBRIDA' END,
    CHOOSE(idx_dur, 30, 45, 60),
    fecha_sesion,
    TODATETIMEOFFSET(DATEADD(HOUR, 16, CAST(fecha_sesion AS DATETIME2(0))), '-05:00'),
    estado_sesion,
    CASE
        WHEN estado_sesion = N'CANCELADA'    THEN N'FERIADO_O_REPROGRAMACION'
        WHEN estado_sesion = N'NO_REALIZADA' THEN N'REPROGRAMACION_DOCENTE'
        ELSE NULL
    END
FROM ses_final
ORDER BY id_programa, numero_sesion;

INSERT INTO dbo.historial_estados_sesion (id_sesion, estado_anterior, estado_nuevo, fecha_cambio, motivo_codigo)
SELECT
    id_sesion,
    N'PROGRAMADA',
    estado_sesion,
    DATEADD(MINUTE, 90, fecha_hora_inicio),
    CASE WHEN estado_sesion = N'REALIZADA' THEN N'EJECUCION_NORMAL' ELSE N'EVENTO_OPERATIVO' END
FROM dbo.sesiones
WHERE estado_sesion <> N'PROGRAMADA';

-- ============================================================================
-- 5. EVENTOS ÍNDICE CODIFICADOS (~40% de estudiantes, sin texto libre)
-- ============================================================================

INSERT INTO dbo.eventos_indice (
    id_estudiante, id_categoria_evento, codigo_evento_local, anio_ocurrencia_aprox
)
SELECT
    e.id_estudiante,
    CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('EVT1-CAT-', e.id_estudiante))) AS BIGINT)) % 6 + 1 AS SMALLINT),
    N'EVT-01',
    CAST(2019 + (ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('EVT1-ANIO-', e.id_estudiante))) AS BIGINT)) % 7) AS SMALLINT)
FROM dbo.estudiantes e
WHERE CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('EVT1-PROB-', e.id_estudiante))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 < 0.40;

-- ~12% de estudiantes con evento índice registran un segundo evento codificado
INSERT INTO dbo.eventos_indice (
    id_estudiante, id_categoria_evento, codigo_evento_local, anio_ocurrencia_aprox
)
SELECT
    ev.id_estudiante,
    CAST((ev.id_categoria_evento % 6) + 1 AS SMALLINT),
    N'EVT-02',
    CAST(2020 + (ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('EVT2-ANIO-', ev.id_estudiante))) AS BIGINT)) % 6) AS SMALLINT)
FROM dbo.eventos_indice ev
WHERE CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('EVT2-PROB-', ev.id_estudiante))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 < 0.12;

-- ============================================================================
-- 6. ASIGNACIONES (~1,330 inscripciones) + HISTORIAL DE RETIROS
-- ============================================================================

CREATE TABLE #tmp_asig_stage (
    id_estudiante        BIGINT       NOT NULL,
    id_programa          BIGINT       NOT NULL,
    fecha_inscripcion    DATE         NOT NULL,
    estado_asignacion    NVARCHAR(20) NOT NULL,
    fecha_retiro         DATE         NULL,
    motivo_retiro_codigo NVARCHAR(40) NULL,
    perfil               NVARCHAR(20) NOT NULL
);

;WITH prog_idx AS (
    SELECT
        id_programa,
        ROW_NUMBER() OVER (ORDER BY id_programa) AS rn_prog,
        COUNT(*) OVER () AS cnt_prog
    FROM dbo.programas
),
est_idx AS (
    SELECT
        id_estudiante,
        ROW_NUMBER() OVER (ORDER BY id_estudiante) AS rn_est
    FROM dbo.estudiantes
),
pares_asig AS (
    -- Inscripción primaria (todos los 1,000 estudiantes)
    SELECT e.id_estudiante, p.id_programa
    FROM est_idx e
    JOIN prog_idx p ON p.rn_prog = 1 + ((e.rn_est - 1) % p.cnt_prog)
    UNION ALL
    -- Segunda inscripción (~33% cursa un 2do programa distinto en el semestre)
    SELECT e.id_estudiante, p.id_programa
    FROM est_idx e
    JOIN prog_idx p ON p.rn_prog = 1 + ((e.rn_est + 5) % p.cnt_prog)
    WHERE CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('ASIG2-', e.id_estudiante))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 < 0.33
),
calc_asig AS (
    SELECT
        pa.id_estudiante, pa.id_programa,
        p.fecha_inicio, p.estado_programa,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('PERF-', pa.id_estudiante, '-', pa.id_programa))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_perf,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('INSC-', pa.id_estudiante, '-', pa.id_programa))) AS BIGINT)) % 12 + 1 AS INT) AS d_insc,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('RETD-', pa.id_estudiante, '-', pa.id_programa))) AS BIGINT)) % 28 + 12 AS INT) AS d_ret,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('RETM-', pa.id_estudiante, '-', pa.id_programa))) AS BIGINT)) % 4 + 1 AS INT) AS idx_mot
    FROM pares_asig pa
    JOIN dbo.programas p ON p.id_programa = pa.id_programa
)
INSERT INTO #tmp_asig_stage
SELECT
    id_estudiante, id_programa,
    DATEADD(DAY, -d_insc, fecha_inicio) AS fecha_inscripcion,
    CASE
        WHEN u_perf >= 0.86 AND u_perf < 0.97 THEN N'RETIRADO'
        WHEN u_perf >= 0.97                   THEN N'INSCRITO'
        WHEN u_perf < 0.58 AND estado_programa = N'FINALIZADO' THEN N'COMPLETADO'
        ELSE N'ACTIVO'
    END AS estado_asignacion,
    CASE WHEN u_perf >= 0.86 AND u_perf < 0.97 THEN DATEADD(DAY, d_ret, fecha_inicio) ELSE NULL END AS fecha_retiro,
    CASE WHEN u_perf >= 0.86 AND u_perf < 0.97
         THEN CHOOSE(idx_mot, N'CRUCE_HORARIO', N'CARGA_ACADEMICA', N'MOTIVO_PERSONAL', N'TRASLADO')
         ELSE NULL
    END AS motivo_retiro_codigo,
    CASE
        WHEN u_perf < 0.58 THEN N'ACTIVO_CONSTANTE'
        WHEN u_perf < 0.76 THEN N'EN_RIESGO'
        WHEN u_perf < 0.86 THEN N'ABANDONO'
        WHEN u_perf < 0.97 THEN N'RETIRADO'
        ELSE                    N'SIN_INICIO'
    END AS perfil
FROM calc_asig;

INSERT INTO dbo.asignaciones (
    id_estudiante, id_programa, fecha_inscripcion, estado_asignacion, fecha_retiro, motivo_retiro_codigo
)
SELECT
    id_estudiante, id_programa, fecha_inscripcion, estado_asignacion, fecha_retiro, motivo_retiro_codigo
FROM #tmp_asig_stage
ORDER BY id_estudiante, id_programa;

INSERT INTO dbo.historial_estados_asignacion (
    id_asignacion, estado_anterior, estado_nuevo, fecha_efectiva, motivo_codigo
)
SELECT id_asignacion, N'ACTIVO', N'RETIRADO', fecha_retiro, motivo_retiro_codigo
FROM dbo.asignaciones
WHERE estado_asignacion = N'RETIRADO';

-- ============================================================================
-- 7. ASISTENCIAS (~11,000+ filas, SOLO sobre sesiones REALIZADA)
-- ============================================================================

;WITH ses_real AS (
    SELECT
        s.*,
        ROW_NUMBER() OVER (PARTITION BY s.id_programa ORDER BY s.numero_sesion) AS ses_idx
    FROM dbo.sesiones s
    WHERE s.estado_sesion = N'REALIZADA'
),
asig_ses AS (
    SELECT
        a.id_programa, a.id_asignacion, a.fecha_retiro,
        st.perfil,
        sr.id_sesion, sr.fecha_sesion, sr.duracion_programada_min, sr.ses_idx,
        ROW_NUMBER() OVER (
            PARTITION BY a.id_asignacion
            ORDER BY CASE WHEN a.fecha_retiro IS NOT NULL AND sr.fecha_sesion > a.fecha_retiro THEN 0 ELSE 1 END, sr.ses_idx
        ) AS rn_post_retiro,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('ASIS-', a.id_asignacion, '-', sr.id_sesion))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_as,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('MIN-',  a.id_asignacion, '-', sr.id_sesion))) AS BIGINT)) % 8 AS SMALLINT) AS d_min
    FROM dbo.asignaciones a
    JOIN #tmp_asig_stage st ON st.id_estudiante = a.id_estudiante AND st.id_programa = a.id_programa
    JOIN ses_real sr ON sr.id_programa = a.id_programa
),
asis_calc AS (
    SELECT
        id_programa, id_asignacion, id_sesion, duracion_programada_min, d_min,
        CASE
            WHEN perfil = N'SIN_INICIO' THEN N'INASISTENCIA'
            WHEN perfil = N'RETIRADO' AND fecha_sesion > fecha_retiro THEN
                CASE WHEN rn_post_retiro = 1 THEN N'RETIRO_BAJA' ELSE NULL END
            WHEN perfil = N'RETIRADO' THEN
                CASE WHEN ses_idx = 1 OR u_as < 0.75 THEN N'ASISTIO' ELSE N'INASISTENCIA' END
            WHEN perfil = N'ACTIVO_CONSTANTE' THEN
                CASE WHEN ses_idx = 1 OR u_as < 0.90 THEN N'ASISTIO' ELSE N'INASISTENCIA' END
            WHEN perfil = N'EN_RIESGO' THEN
                CASE
                    WHEN ses_idx <= 3 THEN CASE WHEN ses_idx = 1 OR u_as < 0.85 THEN N'ASISTIO' ELSE N'INASISTENCIA' END
                    WHEN ses_idx >= 7 THEN CASE WHEN u_as < 0.25 THEN N'ASISTIO' ELSE N'INASISTENCIA' END
                    ELSE                   CASE WHEN u_as < 0.55 THEN N'ASISTIO' ELSE N'INASISTENCIA' END
                END
            ELSE -- ABANDONO
                CASE WHEN ses_idx <= 2 AND (ses_idx = 1 OR u_as < 0.70) THEN N'ASISTIO' ELSE N'INASISTENCIA' END
        END AS estado_asistencia
    FROM asig_ses
)
INSERT INTO dbo.asistencias (
    id_programa, id_asignacion, id_sesion, estado_asistencia, minutos_asistidos
)
SELECT
    id_programa, id_asignacion, id_sesion,
    estado_asistencia,
    CASE
        WHEN estado_asistencia = N'ASISTIO' THEN
            CASE WHEN duracion_programada_min - d_min > 20 THEN duracion_programada_min - d_min ELSE 20 END
        ELSE 0
    END
FROM asis_calc
WHERE estado_asistencia IS NOT NULL;

-- ============================================================================
-- 8. OPORTUNIDADES DE EVALUACIÓN (PSS-10 y PCL-5)
-- ============================================================================

-- 8.1 PSS-10 (INICIAL y FINAL para todas las asignaciones)
INSERT INTO dbo.oportunidades_evaluacion (
    id_asignacion, id_estudiante, id_programa,
    id_instrumento, codigo_instrumento, id_evento_indice, momento,
    fecha_ventana_inicio, fecha_ventana_fin, fecha_prevista, aplicable
)
SELECT
    a.id_asignacion, a.id_estudiante, a.id_programa,
    1, N'PSS-10', NULL, m.momento,
    CASE WHEN m.momento = N'INICIAL' THEN p.ventana_inicial_inicio ELSE p.ventana_final_inicio END,
    CASE WHEN m.momento = N'INICIAL' THEN p.ventana_inicial_fin    ELSE p.ventana_final_fin    END,
    DATEADD(DAY, 7, CASE WHEN m.momento = N'INICIAL' THEN p.ventana_inicial_inicio ELSE p.ventana_final_inicio END),
    1
FROM dbo.asignaciones a
JOIN dbo.programas p ON p.id_programa = a.id_programa
CROSS JOIN (VALUES (N'INICIAL'), (N'FINAL')) AS m(momento);

-- 8.2 PCL-5 aplicable (INICIAL y FINAL amarrados al MISMO id_evento_indice EVT-01)
INSERT INTO dbo.oportunidades_evaluacion (
    id_asignacion, id_estudiante, id_programa,
    id_instrumento, codigo_instrumento, id_evento_indice, momento,
    fecha_ventana_inicio, fecha_ventana_fin, fecha_prevista, aplicable
)
SELECT
    a.id_asignacion, a.id_estudiante, a.id_programa,
    2, N'PCL-5', ev.id_evento_indice, m.momento,
    CASE WHEN m.momento = N'INICIAL' THEN p.ventana_inicial_inicio ELSE p.ventana_final_inicio END,
    CASE WHEN m.momento = N'INICIAL' THEN p.ventana_inicial_fin    ELSE p.ventana_final_fin    END,
    DATEADD(DAY, 7, CASE WHEN m.momento = N'INICIAL' THEN p.ventana_inicial_inicio ELSE p.ventana_final_inicio END),
    1
FROM dbo.asignaciones a
JOIN dbo.programas p ON p.id_programa = a.id_programa
JOIN dbo.eventos_indice ev ON ev.id_estudiante = a.id_estudiante AND ev.codigo_evento_local = N'EVT-01'
CROSS JOIN (VALUES (N'INICIAL'), (N'FINAL')) AS m(momento);

-- 8.3 PCL-5 explícitamente no aplicable (~10% sin evento índice, para validar KPI-04)
INSERT INTO dbo.oportunidades_evaluacion (
    id_asignacion, id_estudiante, id_programa,
    id_instrumento, codigo_instrumento, id_evento_indice, momento,
    fecha_ventana_inicio, fecha_ventana_fin, fecha_prevista, aplicable, motivo_no_aplicable
)
SELECT
    a.id_asignacion, a.id_estudiante, a.id_programa,
    2, N'PCL-5', NULL, N'INICIAL',
    p.ventana_inicial_inicio, p.ventana_inicial_fin, DATEADD(DAY, 7, p.ventana_inicial_inicio),
    0, N'SIN_EVENTO_INDICE'
FROM dbo.asignaciones a
JOIN dbo.programas p ON p.id_programa = a.id_programa
WHERE NOT EXISTS (SELECT 1 FROM dbo.eventos_indice ev WHERE ev.id_estudiante = a.id_estudiante)
  AND CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('NOAPL-', a.id_asignacion))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 < 0.10;

-- ============================================================================
-- 9. RESULTADOS DE EVALUACIÓN (calibrados empíricamente + tardías + v1->v2)
-- ============================================================================

CREATE TABLE #tmp_resultados (
    id_oportunidad      BIGINT            NOT NULL PRIMARY KEY,
    codigo_instrumento  NVARCHAR(15)      NOT NULL,
    puntaje_final       SMALLINT          NOT NULL,
    puntaje_v1_erroneo  SMALLINT          NOT NULL,
    fecha_realizacion   DATE              NOT NULL,
    en_ventana          BIT               NOT NULL,
    ts_reg              DATETIMEOFFSET(0) NOT NULL,
    tiene_correccion    BIT               NOT NULL
);

;WITH op_base AS (
    SELECT
        op.*,
        p.id_practica_principal,
        p.estado_programa,
        st.perfil,
        -- Reducción media realista diferenciada por práctica (P-01..P-04 y MIXTO) para RG-03
        CASE p.id_practica_principal
            WHEN 5 THEN 6.2  -- MIXTO (multicomponente MBSR)
            WHEN 1 THEN 5.6  -- P-01 Atención plena a la respiración
            WHEN 2 THEN 5.1  -- P-02 Escaneo corporal
            WHEN 4 THEN 4.7  -- P-04 Meditación de bondad amorosa
            ELSE        4.1  -- P-03 Meditación caminando
        END AS red_base,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('COMP-', op.id_oportunidad))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_comp,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('TARD-', op.id_oportunidad))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_tard,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('CORR-', op.id_oportunidad))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_corr,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('DIAV-', op.id_oportunidad))) AS BIGINT)) % 15 AS INT) AS d_en_vent,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('DIAT-', op.id_oportunidad))) AS BIGINT)) % 8 + 1 AS INT) AS d_tardia,
        -- Suma de 3 uniformes (aproximación normal centrada) calibrada a Icesi/Rowan (PSS-10) y Kabul (PCL-5)
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('INI1-', op.id_asignacion, '-', op.codigo_instrumento))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_i1,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('INI2-', op.id_asignacion, '-', op.codigo_instrumento))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_i2,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('INI3-', op.id_asignacion, '-', op.codigo_instrumento))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_i3,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('RUID-', op.id_oportunidad))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_ruido
    FROM dbo.oportunidades_evaluacion op
    JOIN dbo.programas p ON p.id_programa = op.id_programa
    JOIN dbo.asignaciones a ON a.id_asignacion = op.id_asignacion
    JOIN #tmp_asig_stage st ON st.id_estudiante = a.id_estudiante AND st.id_programa = a.id_programa
    WHERE op.aplicable = 1
),
op_elegibles AS (
    SELECT
        *,
        CASE
            WHEN momento = N'INICIAL' THEN
                CASE WHEN (perfil <> N'SIN_INICIO' AND u_comp < 0.93) OR (perfil = N'SIN_INICIO' AND u_comp < 0.40) THEN 1 ELSE 0 END
            ELSE
                CASE
                    WHEN estado_programa = N'ACTIVO'            THEN 0
                    WHEN perfil IN (N'RETIRADO', N'SIN_INICIO') THEN CASE WHEN u_comp < 0.14 THEN 1 ELSE 0 END
                    WHEN perfil = N'ABANDONO'                   THEN CASE WHEN u_comp < 0.30 THEN 1 ELSE 0 END
                    ELSE                                             CASE WHEN u_comp < 0.89 THEN 1 ELSE 0 END
                END
        END AS debe_completar,
        CASE WHEN u_tard < 0.08 THEN DATEADD(DAY, d_tardia, fecha_ventana_fin) ELSE DATEADD(DAY, d_en_vent, fecha_ventana_inicio) END AS fecha_realizacion,
        -- Media basal calibrada: PSS-10 ~20.5 (DE ~6.5); PCL-5 ~38.5 (DE ~13.5)
        CASE
            WHEN codigo_instrumento = N'PSS-10' THEN CAST(ROUND(20.5 + ((u_i1 + u_i2 + u_i3) - 1.5) * 13.0, 0) AS INT)
            ELSE                                     CAST(ROUND(38.5 + ((u_i1 + u_i2 + u_i3) - 1.5) * 27.0, 0) AS INT)
        END AS puntaje_base_ini
    FROM op_base
),
op_scores AS (
    SELECT
        id_oportunidad, codigo_instrumento, fecha_realizacion,
        CASE WHEN fecha_realizacion BETWEEN fecha_ventana_inicio AND fecha_ventana_fin THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS en_ventana,
        CASE
            WHEN momento = N'INICIAL' THEN puntaje_base_ini
            WHEN codigo_instrumento = N'PSS-10' THEN
                CAST(ROUND(puntaje_base_ini - red_base * (CASE WHEN perfil = N'ACTIVO_CONSTANTE' THEN 1.1 ELSE 0.65 END) + (u_ruido - 0.5) * 6.0, 0) AS INT)
            ELSE
                CAST(ROUND(puntaje_base_ini - (red_base * 2.0) * (CASE WHEN perfil = N'ACTIVO_CONSTANTE' THEN 1.1 ELSE 0.65 END) + (u_ruido - 0.5) * 10.0, 0) AS INT)
        END AS puntaje_raw,
        CASE WHEN u_corr < 0.05 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS tiene_correccion
    FROM op_elegibles
    WHERE debe_completar = 1
),
op_clamped AS (
    SELECT
        id_oportunidad, codigo_instrumento,
        CAST(
            CASE
                WHEN codigo_instrumento = N'PSS-10' THEN CASE WHEN puntaje_raw < 0 THEN 0 WHEN puntaje_raw > 40 THEN 40 ELSE puntaje_raw END
                ELSE                                     CASE WHEN puntaje_raw < 0 THEN 0 WHEN puntaje_raw > 80 THEN 80 ELSE puntaje_raw END
            END AS SMALLINT
        ) AS puntaje_final,
        fecha_realizacion, en_ventana,
        TODATETIMEOFFSET(DATEADD(HOUR, 15, CAST(fecha_realizacion AS DATETIME2(0))), '-05:00') AS ts_reg,
        tiene_correccion
    FROM op_scores
)
INSERT INTO #tmp_resultados
SELECT
    id_oportunidad, codigo_instrumento, puntaje_final,
    CAST(
        CASE
            WHEN codigo_instrumento = N'PSS-10' THEN CASE WHEN puntaje_final + 2 <= 40 THEN puntaje_final + 2 ELSE puntaje_final - 2 END
            ELSE                                     CASE WHEN puntaje_final + 3 <= 80 THEN puntaje_final + 3 ELSE puntaje_final - 3 END
        END AS SMALLINT
    ) AS puntaje_v1_erroneo,
    fecha_realizacion, en_ventana, ts_reg, tiene_correccion
FROM op_clamped;

-- 9.1 Resultados sin corrección (v1 vigente)
INSERT INTO dbo.resultados_evaluacion (
    id_oportunidad, codigo_instrumento, numero_version, puntaje_total,
    fecha_realizacion, en_ventana, estado_validez, es_vigente, vigente_desde
)
SELECT
    id_oportunidad, codigo_instrumento, 1, puntaje_final,
    fecha_realizacion, en_ventana, N'VALIDO', 1, ts_reg
FROM #tmp_resultados
WHERE tiene_correccion = 0;

-- 9.2 Resultados con corrección: v1 (REEMPLAZADO, no vigente)
INSERT INTO dbo.resultados_evaluacion (
    id_oportunidad, codigo_instrumento, numero_version, puntaje_total,
    fecha_realizacion, en_ventana, estado_validez, es_vigente, vigente_desde, vigente_hasta
)
SELECT
    id_oportunidad, codigo_instrumento, 1, puntaje_v1_erroneo,
    fecha_realizacion, en_ventana, N'REEMPLAZADO', 0, ts_reg, DATEADD(DAY, 1, ts_reg)
FROM #tmp_resultados
WHERE tiene_correccion = 1;

-- 9.3 Resultados con corrección: v2 (VALIDO, vigente, enlazado a v1)
INSERT INTO dbo.resultados_evaluacion (
    id_oportunidad, codigo_instrumento, numero_version, puntaje_total,
    fecha_realizacion, en_ventana, estado_validez, es_vigente,
    id_resultado_reemplazado, motivo_correccion, vigente_desde, vigente_hasta
)
SELECT
    t.id_oportunidad, t.codigo_instrumento, 2, t.puntaje_final,
    t.fecha_realizacion, t.en_ventana, N'VALIDO', 1,
    r1.id_resultado,
    N'Corrección de transcripción de puntaje ' + t.codigo_instrumento,
    DATEADD(DAY, 1, t.ts_reg), NULL
FROM #tmp_resultados t
JOIN dbo.resultados_evaluacion r1
  ON r1.id_oportunidad = t.id_oportunidad
 AND r1.numero_version = 1
WHERE t.tiene_correccion = 1;

-- ============================================================================
-- 10. MEDICIONES COMPLEMENTARIAS AISLADAS (RQ-BI-12, ~1,600 filas)
-- ============================================================================

;WITH mc_gen AS (
    SELECT
        a.id_estudiante, a.id_asignacion, p.ventana_inicial_fin, m.k,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('MC-VAR-', a.id_asignacion, '-', m.k))) AS BIGINT)) % 3 + 1 AS SMALLINT) AS id_variable,
        CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('MC-VAL-', a.id_asignacion, '-', m.k))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 AS u_val
    FROM dbo.asignaciones a
    JOIN dbo.programas p ON p.id_programa = a.id_programa
    CROSS JOIN (VALUES (1), (2)) AS m(k)
    WHERE CAST(ABS(CAST(CHECKSUM(HASHBYTES('SHA2_256', CONCAT('MC-SEL-', a.id_asignacion))) AS BIGINT)) % 1000000 AS FLOAT) / 1000000.0 < 0.60
)
INSERT INTO dbo.mediciones_complementarias (
    id_estudiante, id_asignacion, id_variable,
    valor_numerico, unidad_medida, metodo_medicion, fecha_hora_medicion
)
SELECT
    g.id_estudiante, g.id_asignacion, g.id_variable,
    CAST(
        CASE g.id_variable
            WHEN 1 THEN ROUND(28.0 + g.u_val * 54.0, 3)  -- HRV_RMSSD (media ~55 ms)
            WHEN 2 THEN ROUND(4.8  + g.u_val * 3.4,  2)  -- HORAS_SUENO (media ~6.5 h)
            ELSE        ROUND(18.0 + g.u_val * 24.0, 1)  -- AFECTO_POSITIVO (media ~30 pts)
        END AS DECIMAL(10,3)
    ),
    v.unidad_medida,
    v.metodo_medicion,
    TODATETIMEOFFSET(DATEADD(HOUR, 8, CAST(DATEADD(DAY, g.k * 21, g.ventana_inicial_fin) AS DATETIME2(0))), '-05:00')
FROM mc_gen g
JOIN dbo.cat_variables_complementarias v ON v.id_variable = g.id_variable;

COMMIT TRANSACTION;
GO

-- ============================================================================
-- 11. VERIFICACIÓN DE VOLUMEN POR TABLA Y RESUMEN POR PRÁCTICA
-- ============================================================================

SELECT tabla, total_filas
FROM (
    SELECT 1  AS ord, N'cat_practicas'                AS tabla, COUNT(*) AS total_filas FROM dbo.cat_practicas
    UNION ALL SELECT 2,  N'estudiantes',                  COUNT(*) FROM dbo.estudiantes
    UNION ALL SELECT 3,  N'programas',                    COUNT(*) FROM dbo.programas
    UNION ALL SELECT 4,  N'sesiones',                     COUNT(*) FROM dbo.sesiones
    UNION ALL SELECT 5,  N'asignaciones',                 COUNT(*) FROM dbo.asignaciones
    UNION ALL SELECT 6,  N'asistencias',                  COUNT(*) FROM dbo.asistencias
    UNION ALL SELECT 7,  N'eventos_indice',               COUNT(*) FROM dbo.eventos_indice
    UNION ALL SELECT 8,  N'oportunidades_evaluacion',     COUNT(*) FROM dbo.oportunidades_evaluacion
    UNION ALL SELECT 9,  N'resultados_evaluacion',        COUNT(*) FROM dbo.resultados_evaluacion
    UNION ALL SELECT 10, N'historial_estados_sesion',     COUNT(*) FROM dbo.historial_estados_sesion
    UNION ALL SELECT 11, N'historial_estados_asignacion', COUNT(*) FROM dbo.historial_estados_asignacion
    UNION ALL SELECT 12, N'mediciones_complementarias',   COUNT(*) FROM dbo.mediciones_complementarias
) t
ORDER BY ord;
GO
