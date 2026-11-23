-- ============================================================================
-- ARCHIVO: 02_poblar_datos_10k.sql
-- PROPÓSITO: Poblar la BD OLTP con ~10,000+ asistencias (~19,000+ registros
--            totales) de datos simulados realistas y determinísticos,
--            respetando estrictamente privacidad, trazabilidad (REAL vs
--            SINTETICO), ventanas, pares válidos PSS-10/PCL-5, evaluaciones
--            tardías, correcciones versionadas, retiros y sesiones canceladas.
-- MOTOR:     PostgreSQL 16+
-- ============================================================================
-- Uso sugerido desde psql:
--   \c mmet_bi_oltp
--   \i 02_poblar_datos_10k.sql
-- ============================================================================

BEGIN;

-- Limpieza idempotente para permitir re-ejecución limpia
TRUNCATE TABLE
    mediciones_complementarias,
    historial_estados_asignacion,
    historial_estados_sesion,
    resultados_evaluacion,
    oportunidades_evaluacion,
    eventos_indice,
    asistencias,
    asignaciones,
    sesiones,
    programas,
    estudiantes,
    cat_variables_complementarias,
    cat_categorias_evento_indice,
    cat_instrumentos,
    cat_practicas,
    fuentes_datos
RESTART IDENTITY CASCADE;

-- ============================================================================
-- 1. CATÁLOGOS Y FUENTES DE DATOS
-- ============================================================================

INSERT INTO fuentes_datos (
    id_fuente, codigo_fuente, nombre_fuente, naturaleza_dato, tipo_fuente,
    periodo_referencia, ambito_geografico, referencia_origen
) VALUES
(1, 'UNT_SIM_2026_II',    'Caso Universitario Simulado UNT 2026-II',             'SINTETICO', 'CASO_UNIVERSITARIO_SIMULADO', '2026-II', 'Trujillo, Perú', 'Simulación controlada del curso BI - UNT'),
(2, 'EXT_REAL_MBSR_2024', 'Repositorio Académico Mindfulness Universitario 2024', 'REAL',      'REPOSITORIO_ACADEMICO_REAL',  '2024',    'Repositorio Externo', 'Estudio universitario abierto MBSR/PSS-10 (2024)'),
(3, 'EXT_REAL_PCL5_2025', 'Repositorio Académico Trauma y Mindfulness 2025',      'REAL',      'REPOSITORIO_ACADEMICO_REAL',  '2025',    'Repositorio Externo', 'Estudio universitario abierto Mindfulness/PCL-5 (2025)');

INSERT INTO cat_practicas (id_practica, codigo_practica, nombre_practica, es_mixto) VALUES
(1, 'MINDFULNESS',   'Mindfulness (Atención Plena)', FALSE),
(2, 'RESPIRACION',   'Respiración Consciente',       FALSE),
(3, 'ESCANEO_CORP',  'Escaneo Corporal (Body Scan)', FALSE),
(4, 'MED_COMPASIVA', 'Meditación Compasiva',         FALSE),
(5, 'MIXTO',         'Mixto',                        TRUE);

INSERT INTO cat_instrumentos (
    id_instrumento, codigo_instrumento, version_instrumento, nombre_instrumento,
    puntaje_minimo, puntaje_maximo, requiere_evento_indice
) VALUES
(1, 'PSS-10', 'v1.0-ES',  'Escala de Estrés Percibido (10 ítems)',          0, 40, FALSE),
(2, 'PCL-5',  'DSM-5-ES', 'Lista de Chequeo de TEPT para DSM-5 (20 ítems)', 0, 80, TRUE);

INSERT INTO cat_categorias_evento_indice (id_categoria_evento, codigo_categoria, nombre_categoria) VALUES
(1, 'ACCIDENTE_GRAVE',         'Accidente de tránsito o lesión grave'),
(2, 'DESASTRE_NATURAL',        'Desastre natural o emergencia climática'),
(3, 'VIOLENCIA_INTERPERSONAL', 'Exposición a violencia interpersonal'),
(4, 'PERDIDA_SUBITA',          'Pérdida súbita de un ser querido'),
(5, 'EMERGENCIA_MEDICA',       'Emergencia médica grave propia o familiar'),
(6, 'OTRO_CODIFICADO',         'Otro evento potencialmente traumático codificado');

INSERT INTO cat_variables_complementarias (
    id_variable, codigo_variable, nombre_variable, unidad_medida, metodo_medicion, valor_minimo, valor_maximo
) VALUES
(1, 'HRV_RMSSD',       'Variabilidad de la Frecuencia Cardíaca (RMSSD)', 'ms',     'Sensor PPG óptico',   10.000, 200.000),
(2, 'HORAS_SUENO',     'Duración promedio de sueño nocturno',            'horas',  'Autorreporte diario',  2.000,  14.000),
(3, 'AFECTO_POSITIVO', 'Afecto positivo semanal (PANAS-P)',              'puntos', 'Cuestionario PANAS',  10.000,  50.000);

-- Sincronizar secuencias de catálogos con IDs explícitos
SELECT setval(pg_get_serial_sequence('fuentes_datos', 'id_fuente'), (SELECT MAX(id_fuente) FROM fuentes_datos));
SELECT setval(pg_get_serial_sequence('cat_practicas', 'id_practica'), (SELECT MAX(id_practica) FROM cat_practicas));
SELECT setval(pg_get_serial_sequence('cat_instrumentos', 'id_instrumento'), (SELECT MAX(id_instrumento) FROM cat_instrumentos));
SELECT setval(pg_get_serial_sequence('cat_categorias_evento_indice', 'id_categoria_evento'), (SELECT MAX(id_categoria_evento) FROM cat_categorias_evento_indice));
SELECT setval(pg_get_serial_sequence('cat_variables_complementarias', 'id_variable'), (SELECT MAX(id_variable) FROM cat_variables_complementarias));

-- ============================================================================
-- 2. GENERACIÓN DETERMINÍSTICA DE DATOS REALISTAS (~10,000+ ASISTENCIAS)
-- ============================================================================

DO $$
DECLARE
    v_facultades TEXT[] := ARRAY[
        'Ingeniería', 'Ciencias Médicas', 'Ciencias Sociales',
        'Educación y Ciencias de la Comunicación', 'Derecho y Ciencias Políticas',
        'Ciencias Económicas', 'Ciencias Biológicas', 'Farmacia y Bioquímica'
    ];
    v_sexos      TEXT[] := ARRAY['F', 'M', 'NO_ESPECIFICADO'];
    v_modalidades TEXT[] := ARRAY['PRESENCIAL', 'VIRTUAL', 'HIBRIDA'];

    i            INT;
    j            INT;
    v_fuente     BIGINT;
    v_nat        VARCHAR(12);
    v_edad       SMALLINT;
    v_grupo      VARCHAR(20);
    v_prog_id    BIGINT;
    v_prog_ini   DATE;
    v_prog_fin   DATE;
    v_prog_est   VARCHAR(20);
    v_practica   SMALLINT;
    v_est_ses    VARCHAR(20);
    v_mod_ses    VARCHAR(15);
    v_dur_ses    SMALLINT;
    v_fecha_ses  DATE;
    v_ses_id     BIGINT;

    r_est        RECORD;
    r_prog       RECORD;
    r_asig       RECORD;
    r_ses        RECORD;
    r_op         RECORD;

    v_asig_id    BIGINT;
    v_perfil     VARCHAR(20);
    v_est_asig   VARCHAR(20);
    v_f_insc     DATE;
    v_f_retiro   DATE;
    v_mot_ret    VARCHAR(40);
    v_u          DOUBLE PRECISION;
    v_ses_idx    INT;
    v_est_asis   VARCHAR(20);
    v_min_asis   SMALLINT;
    v_ya_retiro  BOOLEAN;

    v_evt_id     BIGINT;
    v_op_id      BIGINT;
    v_pss_ini    SMALLINT;
    v_pcl_ini    SMALLINT;
    v_red_base   DOUBLE PRECISION;
    v_puntaje    SMALLINT;
    v_puntaje_v2 SMALLINT;
    v_f_real     DATE;
    v_en_vent    BOOLEAN;
    v_ts_reg     TIMESTAMPTZ;
    v_res_v1     BIGINT;
    v_debe_comp  BOOLEAN;
    v_es_tardia  BOOLEAN;
    v_var_id     SMALLINT;
    v_val_comp   NUMERIC(10,3);
    v_uni_comp   VARCHAR(30);
    v_met_comp   VARCHAR(80);
BEGIN
    -- Semilla fija para reproducibilidad total
    PERFORM setseed(0.202608);

    -- ------------------------------------------------------------------------
    -- 2.1 ESTUDIANTES (1,000 registros: 800 SINTETICO UNT 2026-II + 200 REAL)
    -- ------------------------------------------------------------------------
    FOR i IN 1..1000 LOOP
        IF i <= 800 THEN
            v_fuente := 1;
            v_nat    := 'SINTETICO';
        ELSIF i <= 920 THEN
            v_fuente := 2;
            v_nat    := 'REAL';
        ELSE
            v_fuente := 3;
            v_nat    := 'REAL';
        END IF;

        -- Edad realista universitaria (18 a 29 años, concentrada en 18-24)
        v_edad := 18 + floor(power(random(), 1.6) * 12)::SMALLINT;
        v_grupo := CASE
            WHEN v_edad BETWEEN 18 AND 20 THEN '18-20'
            WHEN v_edad BETWEEN 21 AND 23 THEN '21-23'
            WHEN v_edad BETWEEN 24 AND 26 THEN '24-26'
            ELSE '27+'
        END;

        INSERT INTO estudiantes (
            id_fuente, naturaleza_dato, codigo_anonimizado, edad_anios, grupo_etario,
            sexo_codificado, facultad_o_area, ciclo_academico
        ) VALUES (
            v_fuente,
            v_nat,
            CASE
                WHEN v_fuente = 1 THEN 'UNT26-EST-' || LPAD(i::TEXT, 4, '0')
                WHEN v_fuente = 2 THEN 'EXT24-EST-' || LPAD((i - 800)::TEXT, 4, '0')
                ELSE 'EXT25-EST-' || LPAD((i - 920)::TEXT, 4, '0')
            END,
            v_edad,
            v_grupo,
            v_sexos[CASE WHEN random() < 0.54 THEN 1 WHEN random() < 0.96 THEN 2 ELSE 3 END],
            v_facultades[1 + floor(random() * array_length(v_facultades, 1))::INT],
            1 + floor(random() * 10)::SMALLINT
        );
    END LOOP;

    -- ------------------------------------------------------------------------
    -- 2.2 PROGRAMAS (16 programas: 12 UNT 2026-II + 4 Fuentes Reales)
    -- ------------------------------------------------------------------------
    FOR i IN 1..16 LOOP
        IF i <= 12 THEN
            v_fuente   := 1;
            v_nat      := 'SINTETICO';
            v_practica := 1 + ((i - 1) % 5);
            -- 10 programas finalizados (ago-oct/nov 2026) y 2 activos (oct-dic 2026)
            IF i <= 10 THEN
                v_prog_ini := DATE '2026-08-10' + ((i - 1) * 4);
                v_prog_fin := v_prog_ini + 63; -- 10 sesiones semanales
                v_prog_est := 'FINALIZADO';
            ELSE
                v_prog_ini := DATE '2026-10-05' + ((i - 11) * 7);
                v_prog_fin := v_prog_ini + 63;
                v_prog_est := 'ACTIVO';
            END IF;

            INSERT INTO programas (
                id_fuente, naturaleza_dato, codigo_programa, nombre_programa, periodo_academico,
                id_practica_principal, fecha_inicio, fecha_cierre,
                dias_ventana_inicial, dias_ventana_final,
                ventana_inicial_inicio, ventana_inicial_fin, ventana_final_inicio, ventana_final_fin,
                estado_programa
            ) VALUES (
                v_fuente, v_nat,
                'UNT-2026-II-P' || LPAD(i::TEXT, 2, '0'),
                'Programa Bienestar UNT 2026-II Cohorte ' || LPAD(i::TEXT, 2, '0'),
                '2026-II',
                v_practica, v_prog_ini, v_prog_fin,
                14, 14,
                v_prog_ini - 14, v_prog_ini, v_prog_fin, v_prog_fin + 14,
                v_prog_est
            );
        ELSIF i <= 14 THEN
            v_fuente   := 2;
            v_nat      := 'REAL';
            v_practica := CASE WHEN i = 13 THEN 1 ELSE 5 END;
            v_prog_ini := CASE WHEN i = 13 THEN DATE '2024-04-08' ELSE DATE '2024-09-02' END;
            v_prog_fin := v_prog_ini + 63;

            INSERT INTO programas (
                id_fuente, naturaleza_dato, codigo_programa, nombre_programa, periodo_academico,
                id_practica_principal, fecha_inicio, fecha_cierre,
                dias_ventana_inicial, dias_ventana_final,
                ventana_inicial_inicio, ventana_inicial_fin, ventana_final_inicio, ventana_final_fin,
                estado_programa
            ) VALUES (
                v_fuente, v_nat,
                'EXT24-MBSR-P' || (i - 12)::TEXT,
                'Cohorte Externa MBSR 2024-' || (i - 12)::TEXT,
                CASE WHEN i = 13 THEN '2024-I' ELSE '2024-II' END,
                v_practica, v_prog_ini, v_prog_fin,
                14, 14,
                v_prog_ini - 14, v_prog_ini, v_prog_fin, v_prog_fin + 14,
                'FINALIZADO'
            );
        ELSE
            v_fuente   := 3;
            v_nat      := 'REAL';
            v_practica := CASE WHEN i = 15 THEN 1 ELSE 3 END;
            v_prog_ini := CASE WHEN i = 15 THEN DATE '2025-04-07' ELSE DATE '2025-09-01' END;
            v_prog_fin := v_prog_ini + 63;

            INSERT INTO programas (
                id_fuente, naturaleza_dato, codigo_programa, nombre_programa, periodo_academico,
                id_practica_principal, fecha_inicio, fecha_cierre,
                dias_ventana_inicial, dias_ventana_final,
                ventana_inicial_inicio, ventana_inicial_fin, ventana_final_inicio, ventana_final_fin,
                estado_programa
            ) VALUES (
                v_fuente, v_nat,
                'EXT25-PCL5-P' || (i - 14)::TEXT,
                'Cohorte Externa Mindfulness/Trauma 2025-' || (i - 14)::TEXT,
                CASE WHEN i = 15 THEN '2025-I' ELSE '2025-II' END,
                v_practica, v_prog_ini, v_prog_fin,
                14, 14,
                v_prog_ini - 14, v_prog_ini, v_prog_fin, v_prog_fin + 14,
                'FINALIZADO'
            );
        END IF;
    END LOOP;

    -- ------------------------------------------------------------------------
    -- 2.3 SESIONES (160 sesiones: 10 semanales por programa) + HISTORIAL
    -- ------------------------------------------------------------------------
    FOR r_prog IN SELECT * FROM programas ORDER BY id_programa LOOP
        FOR j IN 1..10 LOOP
            v_fecha_ses := r_prog.fecha_inicio + ((j - 1) * 7);
            v_mod_ses   := v_modalidades[CASE WHEN random() < 0.55 THEN 1 WHEN random() < 0.85 THEN 2 ELSE 3 END];
            v_dur_ses   := (ARRAY[30, 45, 60])[1 + floor(random() * 3)::INT];

            -- Técnica de sesión: si el programa es Mixto, rota técnicas; si no, usa la principal
            IF r_prog.id_practica_principal = 5 THEN
                v_practica := 1 + ((j - 1) % 4);
            ELSE
                v_practica := r_prog.id_practica_principal;
            END IF;

            -- Estado de sesión: garantiza >=8 REALIZADA en finalizados y 2 PROGRAMADA futuras en activos
            IF r_prog.estado_programa = 'ACTIVO' AND j >= 9 THEN
                v_est_ses := 'PROGRAMADA';
            ELSIF j = 5 AND random() < 0.65 THEN
                v_est_ses := 'CANCELADA';
            ELSIF j = 8 AND random() < 0.30 THEN
                v_est_ses := 'NO_REALIZADA';
            ELSE
                v_est_ses := 'REALIZADA';
            END IF;

            INSERT INTO sesiones (
                id_fuente, naturaleza_dato, id_programa, numero_sesion,
                id_practica_tecnica, modalidad, duracion_programada_min,
                fecha_sesion, fecha_hora_inicio, estado_sesion, motivo_estado_codigo
            ) VALUES (
                r_prog.id_fuente, r_prog.naturaleza_dato, r_prog.id_programa, j,
                v_practica, v_mod_ses, v_dur_ses,
                v_fecha_ses,
                (v_fecha_ses::TEXT || ' 16:00:00-05')::TIMESTAMPTZ,
                v_est_ses,
                CASE
                    WHEN v_est_ses = 'CANCELADA'    THEN 'FERIADO_O_REPROGRAMACION'
                    WHEN v_est_ses = 'NO_REALIZADA' THEN 'BAJA_CONVOCATORIA_DOCENTE'
                    ELSE NULL
                END
            ) RETURNING id_sesion INTO v_ses_id;

            IF v_est_ses <> 'PROGRAMADA' THEN
                INSERT INTO historial_estados_sesion (id_sesion, estado_anterior, estado_nuevo, fecha_cambio, motivo_codigo)
                VALUES (
                    v_ses_id,
                    'PROGRAMADA',
                    v_est_ses,
                    (v_fecha_ses::TEXT || ' 17:30:00-05')::TIMESTAMPTZ,
                    CASE WHEN v_est_ses = 'REALIZADA' THEN 'EJECUCION_NORMAL' ELSE 'EVENTO_OPERATIVO' END
                );
            END IF;
        END LOOP;
    END LOOP;

    -- ------------------------------------------------------------------------
    -- 2.4 EVENTOS ÍNDICE CODIFICADOS (~43% de estudiantes, sin narraciones)
    -- ------------------------------------------------------------------------
    FOR r_est IN SELECT * FROM estudiantes ORDER BY id_estudiante LOOP
        v_u := random();
        -- En fuente 3 (estudio trauma/PCL-5) 85% reporta evento índice; en otras ~38%
        IF (r_est.id_fuente = 3 AND v_u < 0.85) OR (r_est.id_fuente <> 3 AND v_u < 0.38) THEN
            INSERT INTO eventos_indice (
                id_fuente, naturaleza_dato, id_estudiante, id_categoria_evento,
                codigo_evento_local, anio_ocurrencia_aprox
            ) VALUES (
                r_est.id_fuente, r_est.naturaleza_dato, r_est.id_estudiante,
                1 + floor(random() * 6)::SMALLINT,
                'EVT-01',
                2018 + floor(random() * 8)::SMALLINT
            );

            -- ~12% de quienes tienen evento índice registran un segundo evento codificado
            IF random() < 0.12 THEN
                INSERT INTO eventos_indice (
                    id_fuente, naturaleza_dato, id_estudiante, id_categoria_evento,
                    codigo_evento_local, anio_ocurrencia_aprox
                ) VALUES (
                    r_est.id_fuente, r_est.naturaleza_dato, r_est.id_estudiante,
                    1 + floor(random() * 6)::SMALLINT,
                    'EVT-02',
                    2019 + floor(random() * 7)::SMALLINT
                );
            END IF;
        END IF;
    END LOOP;

    -- ------------------------------------------------------------------------
    -- 2.5 ASIGNACIONES (~1,260 inscripciones) + ASISTENCIAS (~10,500+ filas)
    -- ------------------------------------------------------------------------
    CREATE TEMP TABLE tmp_perfiles_asignacion (
        id_asignacion BIGINT PRIMARY KEY,
        perfil        VARCHAR(20) NOT NULL
    ) ON COMMIT DROP;

    FOR r_est IN SELECT * FROM estudiantes ORDER BY id_estudiante LOOP
        -- 1 asignación primaria por estudiante dentro de su misma fuente;
        -- y ~32% de estudiantes UNT (fuente 1) se inscriben en un 2do programa distinto
        FOR j IN 1..2 LOOP
            EXIT WHEN j = 2 AND (r_est.id_fuente <> 1 OR random() >= 0.33);

            IF r_est.id_fuente = 1 THEN
                IF j = 1 THEN
                    v_prog_id := 1 + ((r_est.id_estudiante - 1) % 12);
                ELSE
                    v_prog_id := 1 + ((r_est.id_estudiante + 4) % 12);
                END IF;
            ELSIF r_est.id_fuente = 2 THEN
                v_prog_id := 13 + (r_est.id_estudiante % 2);
            ELSE
                v_prog_id := 15 + (r_est.id_estudiante % 2);
            END IF;

            SELECT * INTO r_prog FROM programas WHERE id_programa = v_prog_id;

            -- Definir perfil de comportamiento realista
            v_u := random();
            IF v_u < 0.57 THEN
                v_perfil := 'ACTIVO_CONSTANTE';
            ELSIF v_u < 0.76 THEN
                v_perfil := 'EN_RIESGO';
            ELSIF v_u < 0.86 THEN
                v_perfil := 'ABANDONO';
            ELSIF v_u < 0.97 THEN
                v_perfil := 'RETIRADO';
            ELSE
                v_perfil := 'SIN_INICIO';
            END IF;

            v_f_insc := r_prog.fecha_inicio - (1 + floor(random() * 12)::INT);

            IF v_perfil = 'RETIRADO' THEN
                v_est_asig := 'RETIRADO';
                v_f_retiro := r_prog.fecha_inicio + (12 + floor(random() * 28)::INT);
                v_mot_ret  := (ARRAY['CRUCE_HORARIO', 'CARGA_ACADEMICA', 'MOTIVO_PERSONAL', 'TRASLADO'])[1 + floor(random() * 4)::INT];
            ELSIF v_perfil = 'SIN_INICIO' THEN
                v_est_asig := 'INSCRITO';
                v_f_retiro := NULL;
                v_mot_ret  := NULL;
            ELSIF r_prog.estado_programa = 'FINALIZADO' AND v_perfil = 'ACTIVO_CONSTANTE' THEN
                v_est_asig := 'COMPLETADO';
                v_f_retiro := NULL;
                v_mot_ret  := NULL;
            ELSE
                v_est_asig := 'ACTIVO';
                v_f_retiro := NULL;
                v_mot_ret  := NULL;
            END IF;

            INSERT INTO asignaciones (
                id_fuente, naturaleza_dato, id_estudiante, id_programa,
                fecha_inscripcion, estado_asignacion, fecha_retiro, motivo_retiro_codigo
            ) VALUES (
                r_est.id_fuente, r_est.naturaleza_dato, r_est.id_estudiante, v_prog_id,
                v_f_insc, v_est_asig, v_f_retiro, v_mot_ret
            ) RETURNING id_asignacion INTO v_asig_id;

            INSERT INTO tmp_perfiles_asignacion (id_asignacion, perfil) VALUES (v_asig_id, v_perfil);

            IF v_est_asig = 'RETIRADO' THEN
                INSERT INTO historial_estados_asignacion (
                    id_asignacion, estado_anterior, estado_nuevo, fecha_efectiva, motivo_codigo
                ) VALUES (v_asig_id, 'ACTIVO', 'RETIRADO', v_f_retiro, v_mot_ret);
            END IF;

            -- Generar asistencias SOLO sobre sesiones REALIZADAS del programa
            v_ses_idx   := 0;
            v_ya_retiro := FALSE;

            FOR r_ses IN
                SELECT * FROM sesiones
                 WHERE id_programa = v_prog_id
                   AND estado_sesion = 'REALIZADA'
                 ORDER BY numero_sesion
            LOOP
                v_ses_idx := v_ses_idx + 1;

                IF v_perfil = 'SIN_INICIO' THEN
                    v_est_asis := 'INASISTENCIA';
                ELSIF v_perfil = 'RETIRADO' THEN
                    IF r_ses.fecha_sesion > v_f_retiro THEN
                        IF NOT v_ya_retiro THEN
                            v_est_asis  := 'RETIRO_BAJA';
                            v_ya_retiro := TRUE;
                        ELSE
                            CONTINUE; -- No genera registros posteriores al retiro formal
                        END IF;
                    ELSE
                        v_est_asis := CASE WHEN v_ses_idx = 1 OR random() < 0.75 THEN 'ASISTIO' ELSE 'INASISTENCIA' END;
                    END IF;
                ELSIF v_perfil = 'ACTIVO_CONSTANTE' THEN
                    v_est_asis := CASE WHEN v_ses_idx = 1 OR random() < 0.90 THEN 'ASISTIO' ELSE 'INASISTENCIA' END;
                ELSIF v_perfil = 'EN_RIESGO' THEN
                    -- Inicia bien (sesiones 1..3), luego acumula inasistencias recientes
                    IF v_ses_idx <= 3 THEN
                        v_est_asis := CASE WHEN v_ses_idx = 1 OR random() < 0.85 THEN 'ASISTIO' ELSE 'INASISTENCIA' END;
                    ELSIF v_ses_idx >= 7 THEN
                        v_est_asis := CASE WHEN random() < 0.25 THEN 'ASISTIO' ELSE 'INASISTENCIA' END;
                    ELSE
                        v_est_asis := CASE WHEN random() < 0.55 THEN 'ASISTIO' ELSE 'INASISTENCIA' END;
                    END IF;
                ELSE -- ABANDONO no formal
                    IF v_ses_idx <= 2 THEN
                        v_est_asis := CASE WHEN v_ses_idx = 1 OR random() < 0.70 THEN 'ASISTIO' ELSE 'INASISTENCIA' END;
                    ELSE
                        v_est_asis := 'INASISTENCIA';
                    END IF;
                END IF;

                IF v_est_asis = 'ASISTIO' THEN
                    v_min_asis := GREATEST(20, r_ses.duracion_programada_min - floor(random() * 8)::SMALLINT);
                ELSE
                    v_min_asis := 0;
                END IF;

                INSERT INTO asistencias (
                    id_fuente, naturaleza_dato, id_programa, id_asignacion, id_sesion,
                    estado_asistencia, minutos_asistidos
                ) VALUES (
                    r_est.id_fuente, r_est.naturaleza_dato, v_prog_id, v_asig_id, r_ses.id_sesion,
                    v_est_asis, v_min_asis
                );
            END LOOP;
        END LOOP;
    END LOOP;

    -- ------------------------------------------------------------------------
    -- 2.6 OPORTUNIDADES Y RESULTADOS DE EVALUACIÓN (PSS-10 y PCL-5)
    -- ------------------------------------------------------------------------
    FOR r_asig IN
        SELECT a.*, p.id_practica_principal, p.estado_programa,
               p.ventana_inicial_inicio, p.ventana_inicial_fin,
               p.ventana_final_inicio, p.ventana_final_fin,
               tp.perfil
          FROM asignaciones a
          JOIN programas p ON p.id_programa = a.id_programa
          JOIN tmp_perfiles_asignacion tp ON tp.id_asignacion = a.id_asignacion
         ORDER BY a.id_asignacion
    LOOP
        -- Reducción esperada realista diferenciada por práctica (para RG-03)
        v_red_base := CASE r_asig.id_practica_principal
            WHEN 5 THEN 6.5  -- Mixto
            WHEN 1 THEN 5.8  -- Mindfulness
            WHEN 4 THEN 4.9  -- Meditación compasiva
            WHEN 3 THEN 4.4  -- Escaneo corporal
            ELSE        3.7  -- Respiración consciente
        END;

        -- >>> A) PSS-10 (INICIAL y FINAL) <<<
        v_pss_ini := LEAST(40, GREATEST(6, round(24 + (random() + random() + random() - 1.5) * 8)::SMALLINT));

        FOR j IN 1..2 LOOP -- 1 = INICIAL, 2 = FINAL
            INSERT INTO oportunidades_evaluacion (
                id_fuente, naturaleza_dato, id_asignacion, id_estudiante, id_programa,
                id_instrumento, codigo_instrumento, id_evento_indice, momento,
                fecha_ventana_inicio, fecha_ventana_fin, fecha_prevista, aplicable
            ) VALUES (
                r_asig.id_fuente, r_asig.naturaleza_dato, r_asig.id_asignacion, r_asig.id_estudiante, r_asig.id_programa,
                1, 'PSS-10', NULL,
                CASE WHEN j = 1 THEN 'INICIAL' ELSE 'FINAL' END,
                CASE WHEN j = 1 THEN r_asig.ventana_inicial_inicio ELSE r_asig.ventana_final_inicio END,
                CASE WHEN j = 1 THEN r_asig.ventana_inicial_fin    ELSE r_asig.ventana_final_fin    END,
                CASE WHEN j = 1 THEN r_asig.ventana_inicial_inicio + 7 ELSE r_asig.ventana_final_inicio + 7 END,
                TRUE
            ) RETURNING id_oportunidad INTO v_op_id;

            -- Probabilidad de completar evaluación según momento, estado del programa y perfil
            IF j = 1 THEN
                v_debe_comp := (r_asig.perfil <> 'SIN_INICIO' AND random() < 0.94)
                               OR (r_asig.perfil = 'SIN_INICIO' AND random() < 0.40);
            ELSE
                IF r_asig.estado_programa = 'ACTIVO' THEN
                    v_debe_comp := FALSE; -- Ventana final futura/pendiente
                ELSIF r_asig.perfil IN ('RETIRADO', 'SIN_INICIO') THEN
                    v_debe_comp := (random() < 0.15);
                ELSIF r_asig.perfil = 'ABANDONO' THEN
                    v_debe_comp := (random() < 0.30);
                ELSE
                    v_debe_comp := (random() < 0.90);
                END IF;
            END IF;

            IF v_debe_comp THEN
                v_es_tardia := (random() < 0.08);
                IF j = 1 THEN
                    v_f_real := CASE
                        WHEN v_es_tardia THEN r_asig.ventana_inicial_fin + (1 + floor(random() * 6)::INT)
                        ELSE r_asig.ventana_inicial_inicio + floor(random() * 15)::INT
                    END;
                    v_en_vent := (v_f_real BETWEEN r_asig.ventana_inicial_inicio AND r_asig.ventana_inicial_fin);
                    v_puntaje := v_pss_ini;
                ELSE
                    v_f_real := CASE
                        WHEN v_es_tardia THEN r_asig.ventana_final_fin + (1 + floor(random() * 9)::INT)
                        ELSE r_asig.ventana_final_inicio + floor(random() * 15)::INT
                    END;
                    v_en_vent := (v_f_real BETWEEN r_asig.ventana_final_inicio AND r_asig.ventana_final_fin);
                    v_puntaje := LEAST(40, GREATEST(0,
                        round(v_pss_ini - v_red_base * (CASE WHEN r_asig.perfil = 'ACTIVO_CONSTANTE' THEN 1.1 ELSE 0.65 END)
                              + (random() - 0.5) * 6)::SMALLINT
                    ));
                END IF;

                v_ts_reg := (v_f_real::TEXT || ' 14:30:00-05')::TIMESTAMPTZ;

                -- ~5% de resultados tienen una corrección versionada (v1 REEMPLAZADO -> v2 VALIDO)
                IF random() < 0.05 THEN
                    v_puntaje_v2 := LEAST(40, GREATEST(0, v_puntaje + (CASE WHEN random() < 0.5 THEN -2 ELSE 2 END)));

                    INSERT INTO resultados_evaluacion (
                        id_fuente, naturaleza_dato, id_oportunidad, codigo_instrumento,
                        numero_version, puntaje_total, fecha_realizacion, en_ventana,
                        estado_validez, es_vigente, vigente_desde, vigente_hasta
                    ) VALUES (
                        r_asig.id_fuente, r_asig.naturaleza_dato, v_op_id, 'PSS-10',
                        1, v_puntaje_v2, v_f_real, v_en_vent,
                        'REEMPLAZADO', FALSE, v_ts_reg, v_ts_reg + INTERVAL '1 day'
                    ) RETURNING id_resultado INTO v_res_v1;

                    INSERT INTO resultados_evaluacion (
                        id_fuente, naturaleza_dato, id_oportunidad, codigo_instrumento,
                        numero_version, puntaje_total, fecha_realizacion, en_ventana,
                        estado_validez, es_vigente, id_resultado_reemplazado, motivo_correccion,
                        vigente_desde, vigente_hasta
                    ) VALUES (
                        r_asig.id_fuente, r_asig.naturaleza_dato, v_op_id, 'PSS-10',
                        2, v_puntaje, v_f_real, v_en_vent,
                        'VALIDO', TRUE, v_res_v1, 'Corrección de transcripción de puntaje PSS-10',
                        v_ts_reg + INTERVAL '1 day', NULL
                    );
                ELSE
                    INSERT INTO resultados_evaluacion (
                        id_fuente, naturaleza_dato, id_oportunidad, codigo_instrumento,
                        numero_version, puntaje_total, fecha_realizacion, en_ventana,
                        estado_validez, es_vigente, vigente_desde
                    ) VALUES (
                        r_asig.id_fuente, r_asig.naturaleza_dato, v_op_id, 'PSS-10',
                        1, v_puntaje, v_f_real, v_en_vent,
                        'VALIDO', TRUE, v_ts_reg
                    );
                END IF;
            END IF;
        END LOOP;

        -- >>> B) PCL-5 (solo si tiene evento_indice, amarrado al MISMO evento en INICIAL y FINAL) <<<
        SELECT id_evento_indice
          INTO v_evt_id
          FROM eventos_indice
         WHERE id_estudiante = r_asig.id_estudiante
           AND codigo_evento_local = 'EVT-01'
         LIMIT 1;

        IF v_evt_id IS NOT NULL THEN
            v_pcl_ini := LEAST(80, GREATEST(12, round(44 + (random() + random() + random() - 1.5) * 16)::SMALLINT));

            FOR j IN 1..2 LOOP
                INSERT INTO oportunidades_evaluacion (
                    id_fuente, naturaleza_dato, id_asignacion, id_estudiante, id_programa,
                    id_instrumento, codigo_instrumento, id_evento_indice, momento,
                    fecha_ventana_inicio, fecha_ventana_fin, fecha_prevista, aplicable
                ) VALUES (
                    r_asig.id_fuente, r_asig.naturaleza_dato, r_asig.id_asignacion, r_asig.id_estudiante, r_asig.id_programa,
                    2, 'PCL-5', v_evt_id,
                    CASE WHEN j = 1 THEN 'INICIAL' ELSE 'FINAL' END,
                    CASE WHEN j = 1 THEN r_asig.ventana_inicial_inicio ELSE r_asig.ventana_final_inicio END,
                    CASE WHEN j = 1 THEN r_asig.ventana_inicial_fin    ELSE r_asig.ventana_final_fin    END,
                    CASE WHEN j = 1 THEN r_asig.ventana_inicial_inicio + 7 ELSE r_asig.ventana_final_inicio + 7 END,
                    TRUE
                ) RETURNING id_oportunidad INTO v_op_id;

                IF j = 1 THEN
                    v_debe_comp := (r_asig.perfil <> 'SIN_INICIO' AND random() < 0.92);
                ELSE
                    IF r_asig.estado_programa = 'ACTIVO' THEN
                        v_debe_comp := FALSE;
                    ELSIF r_asig.perfil IN ('RETIRADO', 'SIN_INICIO') THEN
                        v_debe_comp := (random() < 0.12);
                    ELSE
                        v_debe_comp := (random() < 0.87);
                    END IF;
                END IF;

                IF v_debe_comp THEN
                    v_es_tardia := (random() < 0.08);
                    IF j = 1 THEN
                        v_f_real := CASE
                            WHEN v_es_tardia THEN r_asig.ventana_inicial_fin + (1 + floor(random() * 6)::INT)
                            ELSE r_asig.ventana_inicial_inicio + floor(random() * 15)::INT
                        END;
                        v_en_vent := (v_f_real BETWEEN r_asig.ventana_inicial_inicio AND r_asig.ventana_inicial_fin);
                        v_puntaje := v_pcl_ini;
                    ELSE
                        v_f_real := CASE
                            WHEN v_es_tardia THEN r_asig.ventana_final_fin + (1 + floor(random() * 9)::INT)
                            ELSE r_asig.ventana_final_inicio + floor(random() * 15)::INT
                        END;
                        v_en_vent := (v_f_real BETWEEN r_asig.ventana_final_inicio AND r_asig.ventana_final_fin);
                        v_puntaje := LEAST(80, GREATEST(0,
                            round(v_pcl_ini - (v_red_base * 1.9) * (CASE WHEN r_asig.perfil = 'ACTIVO_CONSTANTE' THEN 1.1 ELSE 0.65 END)
                                  + (random() - 0.5) * 10)::SMALLINT
                        ));
                    END IF;

                    v_ts_reg := (v_f_real::TEXT || ' 15:15:00-05')::TIMESTAMPTZ;

                    IF random() < 0.05 THEN
                        v_puntaje_v2 := LEAST(80, GREATEST(0, v_puntaje + (CASE WHEN random() < 0.5 THEN -3 ELSE 3 END)));

                        INSERT INTO resultados_evaluacion (
                            id_fuente, naturaleza_dato, id_oportunidad, codigo_instrumento,
                            numero_version, puntaje_total, fecha_realizacion, en_ventana,
                            estado_validez, es_vigente, vigente_desde, vigente_hasta
                        ) VALUES (
                            r_asig.id_fuente, r_asig.naturaleza_dato, v_op_id, 'PCL-5',
                            1, v_puntaje_v2, v_f_real, v_en_vent,
                            'REEMPLAZADO', FALSE, v_ts_reg, v_ts_reg + INTERVAL '1 day'
                        ) RETURNING id_resultado INTO v_res_v1;

                        INSERT INTO resultados_evaluacion (
                            id_fuente, naturaleza_dato, id_oportunidad, codigo_instrumento,
                            numero_version, puntaje_total, fecha_realizacion, en_ventana,
                            estado_validez, es_vigente, id_resultado_reemplazado, motivo_correccion,
                            vigente_desde, vigente_hasta
                        ) VALUES (
                            r_asig.id_fuente, r_asig.naturaleza_dato, v_op_id, 'PCL-5',
                            2, v_puntaje, v_f_real, v_en_vent,
                            'VALIDO', TRUE, v_res_v1, 'Corrección de suma de ítems PCL-5',
                            v_ts_reg + INTERVAL '1 day', NULL
                        );
                    ELSE
                        INSERT INTO resultados_evaluacion (
                            id_fuente, naturaleza_dato, id_oportunidad, codigo_instrumento,
                            numero_version, puntaje_total, fecha_realizacion, en_ventana,
                            estado_validez, es_vigente, vigente_desde
                        ) VALUES (
                            r_asig.id_fuente, r_asig.naturaleza_dato, v_op_id, 'PCL-5',
                            1, v_puntaje, v_f_real, v_en_vent,
                            'VALIDO', TRUE, v_ts_reg
                        );
                    END IF;
                END IF;
            END LOOP;
        ELSIF random() < 0.10 THEN
            -- Oportunidad PCL-5 explícitamente no aplicable (para validar exclusión en KPI-04)
            INSERT INTO oportunidades_evaluacion (
                id_fuente, naturaleza_dato, id_asignacion, id_estudiante, id_programa,
                id_instrumento, codigo_instrumento, id_evento_indice, momento,
                fecha_ventana_inicio, fecha_ventana_fin, fecha_prevista,
                aplicable, motivo_no_aplicable
            ) VALUES (
                r_asig.id_fuente, r_asig.naturaleza_dato, r_asig.id_asignacion, r_asig.id_estudiante, r_asig.id_programa,
                2, 'PCL-5', NULL, 'INICIAL',
                r_asig.ventana_inicial_inicio, r_asig.ventana_inicial_fin, r_asig.ventana_inicial_inicio + 7,
                FALSE, 'SIN_EVENTO_INDICE'
            );
        END IF;

        -- --------------------------------------------------------------------
        -- 2.7 MEDICIONES COMPLEMENTARIAS AISLADAS (RQ-BI-12, ~1,500 filas)
        -- --------------------------------------------------------------------
        IF random() < 0.60 THEN
            FOR j IN 1..2 LOOP
                v_var_id := 1 + floor(random() * 3)::SMALLINT;
                SELECT unidad_medida, metodo_medicion INTO v_uni_comp, v_met_comp
                  FROM cat_variables_complementarias WHERE id_variable = v_var_id;

                v_val_comp := CASE v_var_id
                    WHEN 1 THEN round((35 + random() * 60)::NUMERIC, 3)  -- HRV_RMSSD (ms)
                    WHEN 2 THEN round((4.5 + random() * 4.5)::NUMERIC, 2) -- HORAS_SUENO
                    ELSE        round((18 + random() * 26)::NUMERIC, 1)  -- AFECTO_POSITIVO
                END;

                INSERT INTO mediciones_complementarias (
                    id_fuente, naturaleza_dato, id_estudiante, id_asignacion, id_variable,
                    valor_numerico, unidad_medida, metodo_medicion, fecha_hora_medicion
                ) VALUES (
                    r_asig.id_fuente, r_asig.naturaleza_dato, r_asig.id_estudiante, r_asig.id_asignacion, v_var_id,
                    v_val_comp, v_uni_comp, v_met_comp,
                    ((r_asig.ventana_inicial_fin + (j * 21))::TEXT || ' 08:00:00-05')::TIMESTAMPTZ
                );
            END LOOP;
        END IF;
    END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- 3. VERIFICACIÓN DE VOLUMEN Y CONTROL DE CALIDAD DE LOS DATOS GENERADOS
-- ============================================================================

SELECT tabla, total_filas
FROM (
    SELECT 1 AS ord, 'fuentes_datos'                AS tabla, COUNT(*) AS total_filas FROM fuentes_datos
    UNION ALL SELECT 2,  'estudiantes',                  COUNT(*) FROM estudiantes
    UNION ALL SELECT 3,  'programas',                    COUNT(*) FROM programas
    UNION ALL SELECT 4,  'sesiones',                     COUNT(*) FROM sesiones
    UNION ALL SELECT 5,  'asignaciones',                 COUNT(*) FROM asignaciones
    UNION ALL SELECT 6,  'asistencias',                  COUNT(*) FROM asistencias
    UNION ALL SELECT 7,  'eventos_indice',               COUNT(*) FROM eventos_indice
    UNION ALL SELECT 8,  'oportunidades_evaluacion',     COUNT(*) FROM oportunidades_evaluacion
    UNION ALL SELECT 9,  'resultados_evaluacion',        COUNT(*) FROM resultados_evaluacion
    UNION ALL SELECT 10, 'historial_estados_sesion',     COUNT(*) FROM historial_estados_sesion
    UNION ALL SELECT 11, 'historial_estados_asignacion', COUNT(*) FROM historial_estados_asignacion
    UNION ALL SELECT 12, 'mediciones_complementarias',   COUNT(*) FROM mediciones_complementarias
) t
ORDER BY ord;
