-- PostgreSQL 17. Execute in mmet_bi_dm. Source snapshot is supplied by the backend.
-- One target transaction, serialized loads; an error preserves the previous published cut.
CREATE OR REPLACE FUNCTION dm.ejecutar_etl(p_fecha_corte date, p_snapshot jsonb) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
 v_fecha_corte date := p_fecha_corte;
 v_sk_tiempo_corte integer := to_char(p_fecha_corte,'YYYYMMDD')::integer;
 v_id_ejecucion_etl bigint;
 v_filas_continuidad integer := 0;
 v_filas_cumplimiento integer := 0;
 v_filas_resultados integer := 0;
 v_incidencias integer := 0;
 v_count integer;
BEGIN
 PERFORM pg_advisory_xact_lock(726384);
 INSERT INTO dm.etl_log_ejecuciones(fecha_corte,estado,mensaje) VALUES(p_fecha_corte,'EN_PROCESO','Carga desde snapshot PostgreSQL OLTP') RETURNING id_ejecucion_etl INTO v_id_ejecucion_etl;
 BEGIN
 IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM unnest(ARRAY['estudiantes','programas','cat_practicas','cat_instrumentos','cat_categorias_evento_indice','eventos_indice','asignaciones','sesiones','asistencias','oportunidades_evaluacion','resultados_evaluacion']) AS k(name) WHERE jsonb_typeof(p_snapshot->k.name) IS DISTINCT FROM 'array') THEN RAISE EXCEPTION 'Snapshot OLTP incompleto o inválido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM dm.DimTiempo WHERE sk_tiempo=v_sk_tiempo_corte) THEN RAISE EXCEPTION 'Fecha fuera del calendario del Data Mart'; END IF;
  CREATE TEMP TABLE src_estudiantes (id_estudiante BIGINT, codigo_estudiante VARCHAR(50), edad_anios SMALLINT, sexo_codificado VARCHAR(20), facultad_o_area VARCHAR(80), carrera VARCHAR(120), ciclo_academico SMALLINT) ON COMMIT DROP;
  INSERT INTO pg_temp.src_estudiantes SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_estudiantes, p_snapshot->'estudiantes');
  CREATE TEMP TABLE src_programas (id_programa BIGINT, codigo_programa VARCHAR(40), nombre_programa VARCHAR(150), periodo_academico VARCHAR(20), fecha_inicio DATE, fecha_cierre DATE, estado_programa VARCHAR(20), id_practica_principal SMALLINT) ON COMMIT DROP;
  INSERT INTO pg_temp.src_programas SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_programas, p_snapshot->'programas');
  CREATE TEMP TABLE src_cat_practicas (id_practica SMALLINT, codigo_practica VARCHAR(20), nombre_practica VARCHAR(100), es_mixto SMALLINT) ON COMMIT DROP;
  INSERT INTO pg_temp.src_cat_practicas SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_cat_practicas, p_snapshot->'cat_practicas');
  CREATE TEMP TABLE src_cat_instrumentos (id_instrumento SMALLINT, codigo_instrumento VARCHAR(15), version_instrumento VARCHAR(30), nombre_instrumento VARCHAR(120), puntaje_minimo SMALLINT, puntaje_maximo SMALLINT, requiere_evento_indice SMALLINT) ON COMMIT DROP;
  INSERT INTO pg_temp.src_cat_instrumentos SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_cat_instrumentos, p_snapshot->'cat_instrumentos');
  CREATE TEMP TABLE src_cat_categorias_evento_indice (id_categoria_evento SMALLINT, codigo_categoria VARCHAR(40), nombre_categoria VARCHAR(120)) ON COMMIT DROP;
  INSERT INTO pg_temp.src_cat_categorias_evento_indice SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_cat_categorias_evento_indice, p_snapshot->'cat_categorias_evento_indice');
  CREATE TEMP TABLE src_eventos_indice (id_evento_indice BIGINT, codigo_evento_local VARCHAR(30), id_categoria_evento SMALLINT, anio_ocurrencia_aprox SMALLINT) ON COMMIT DROP;
  INSERT INTO pg_temp.src_eventos_indice SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_eventos_indice, p_snapshot->'eventos_indice');
  CREATE TEMP TABLE src_asignaciones (id_asignacion BIGINT, id_estudiante BIGINT, id_programa BIGINT, fecha_inscripcion DATE, fecha_retiro DATE) ON COMMIT DROP;
  INSERT INTO pg_temp.src_asignaciones SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_asignaciones, p_snapshot->'asignaciones');
  CREATE TEMP TABLE src_sesiones (id_sesion BIGINT, id_programa BIGINT, fecha_sesion DATE, estado_sesion VARCHAR(20), numero_sesion SMALLINT) ON COMMIT DROP;
  INSERT INTO pg_temp.src_sesiones SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_sesiones, p_snapshot->'sesiones');
  CREATE TEMP TABLE src_asistencias (id_asignacion BIGINT, id_sesion BIGINT, estado_asistencia VARCHAR(20), minutos_asistidos SMALLINT) ON COMMIT DROP;
  INSERT INTO pg_temp.src_asistencias SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_asistencias, p_snapshot->'asistencias');
  CREATE TEMP TABLE src_oportunidades_evaluacion (id_oportunidad BIGINT, id_asignacion BIGINT, id_estudiante BIGINT, id_programa BIGINT, id_instrumento SMALLINT, codigo_instrumento VARCHAR(15), id_version_instrumento BIGINT, id_evento_indice BIGINT, momento VARCHAR(10), aplicable SMALLINT, fecha_ventana_inicio DATE, fecha_ventana_fin DATE, fecha_prevista DATE) ON COMMIT DROP;
  INSERT INTO pg_temp.src_oportunidades_evaluacion SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_oportunidades_evaluacion, p_snapshot->'oportunidades_evaluacion');
  CREATE TEMP TABLE src_resultados_evaluacion (id_resultado BIGINT, id_oportunidad BIGINT, puntaje_total SMALLINT, numero_version SMALLINT, fecha_realizacion DATE, en_ventana SMALLINT, es_vigente SMALLINT, estado_validez VARCHAR(15)) ON COMMIT DROP;
  INSERT INTO pg_temp.src_resultados_evaluacion SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_resultados_evaluacion, p_snapshot->'resultados_evaluacion');

 CREATE INDEX ON pg_temp.src_resultados_evaluacion(id_oportunidad);
 CREATE INDEX ON pg_temp.src_oportunidades_evaluacion(id_asignacion,id_instrumento,momento);
 CREATE INDEX ON pg_temp.src_asistencias(id_asignacion,id_sesion);
 CREATE INDEX ON pg_temp.src_sesiones(id_programa,fecha_sesion);
 ANALYZE pg_temp.src_estudiantes;
 ANALYZE pg_temp.src_programas;
 ANALYZE pg_temp.src_cat_practicas;
 ANALYZE pg_temp.src_cat_instrumentos;
 ANALYZE pg_temp.src_cat_categorias_evento_indice;
 ANALYZE pg_temp.src_eventos_indice;
 ANALYZE pg_temp.src_asignaciones;
 ANALYZE pg_temp.src_sesiones;
 ANALYZE pg_temp.src_asistencias;
 ANALYZE pg_temp.src_oportunidades_evaluacion;
 ANALYZE pg_temp.src_resultados_evaluacion;
        -- 2. SINCRONIZACIÓN IDEMPOTENTE DE DIMENSIONES DINÁMICAS (MERGE)
        -- ====================================================================

        -- 2.1 DimEstudiante (minimización de datos: NO copia nombres, apellidos ni correo_institucional;
        --     deriva grupo_etario desde edad_anios en tramos estándar: 18-20, 21-24, 25+)
        MERGE INTO dm.DimEstudiante AS tgt
        USING (
            SELECT
                e.id_estudiante,
                e.codigo_estudiante,
                e.edad_anios,
                CASE
                    WHEN e.edad_anios BETWEEN 18 AND 20 THEN '18-20'
                    WHEN e.edad_anios BETWEEN 21 AND 24 THEN '21-24'
                    ELSE '25+'
                END AS grupo_etario,
                e.sexo_codificado,
                e.facultad_o_area,
                e.carrera,
                e.ciclo_academico
              FROM pg_temp.src_estudiantes e
        ) AS src
           ON tgt.id_estudiante = src.id_estudiante
        WHEN MATCHED THEN
            UPDATE SET
                codigo_estudiante = src.codigo_estudiante,
                edad_anios = src.edad_anios,
                grupo_etario = src.grupo_etario,
                sexo_codificado = src.sexo_codificado,
                facultad_o_area = src.facultad_o_area,
                carrera = src.carrera,
                ciclo_academico = src.ciclo_academico
        WHEN NOT MATCHED THEN
            INSERT (id_estudiante, codigo_estudiante, edad_anios, grupo_etario, sexo_codificado, facultad_o_area, carrera, ciclo_academico)
            VALUES (src.id_estudiante, src.codigo_estudiante, src.edad_anios, src.grupo_etario, src.sexo_codificado, src.facultad_o_area, src.carrera, src.ciclo_academico);

        -- 2.2 DimPrograma
        MERGE INTO dm.DimPrograma AS tgt
        USING pg_temp.src_programas AS src
           ON tgt.id_programa = src.id_programa
        WHEN MATCHED THEN
            UPDATE SET
                codigo_programa = src.codigo_programa,
                nombre_programa = src.nombre_programa,
                periodo_academico = src.periodo_academico,
                fecha_inicio = src.fecha_inicio,
                fecha_cierre = src.fecha_cierre,
                estado_programa = src.estado_programa
        WHEN NOT MATCHED THEN
            INSERT (id_programa, codigo_programa, nombre_programa, periodo_academico, fecha_inicio, fecha_cierre, estado_programa)
            VALUES (src.id_programa, src.codigo_programa, src.nombre_programa, src.periodo_academico, src.fecha_inicio, src.fecha_cierre, src.estado_programa);

        -- 2.3 DimPractica (P-01..P-04 y MIXTO, tipo Unicomponente/Mixto)
        MERGE INTO dm.DimPractica AS tgt
        USING pg_temp.src_cat_practicas AS src
           ON tgt.id_practica = src.id_practica
        WHEN MATCHED THEN
            UPDATE SET
                codigo_practica = src.codigo_practica,
                nombre_practica = src.nombre_practica,
                tipo_practica = CASE WHEN src.es_mixto = 1 THEN 'Mixto' ELSE 'Unicomponente' END,
                es_mixto = src.es_mixto
        WHEN NOT MATCHED THEN
            INSERT (id_practica, codigo_practica, nombre_practica, tipo_practica, es_mixto)
            VALUES (
                src.id_practica,
                src.codigo_practica,
                src.nombre_practica,
                CASE WHEN src.es_mixto = 1 THEN 'Mixto' ELSE 'Unicomponente' END,
                src.es_mixto
            );

        -- 2.4 DimInstrumento (PSS-10 y PCL-5 estrictamente separados)
        MERGE INTO dm.DimInstrumento AS tgt
        USING pg_temp.src_cat_instrumentos AS src
           ON tgt.id_instrumento = src.id_instrumento
        WHEN MATCHED THEN
            UPDATE SET
                codigo_instrumento = src.codigo_instrumento,
                version_instrumento = src.version_instrumento,
                nombre_instrumento = src.nombre_instrumento,
                puntaje_minimo = src.puntaje_minimo,
                puntaje_maximo = src.puntaje_maximo,
                meta_reduccion_operativa = CASE WHEN src.codigo_instrumento = 'PSS-10' THEN 4.00 ELSE 10.00 END,
                requiere_evento_indice = src.requiere_evento_indice
        WHEN NOT MATCHED THEN
            INSERT (
                id_instrumento, codigo_instrumento, version_instrumento, nombre_instrumento,
                puntaje_minimo, puntaje_maximo, meta_reduccion_operativa, requiere_evento_indice
            )
            VALUES (
                src.id_instrumento, src.codigo_instrumento, src.version_instrumento, src.nombre_instrumento,
                src.puntaje_minimo, src.puntaje_maximo,
                CASE WHEN src.codigo_instrumento = 'PSS-10' THEN 4.00 ELSE 10.00 END,
                src.requiere_evento_indice
            );

        -- 2.5 DimEventoIndice (preserva fila -1 'No aplica' para PSS-10; minimización de datos:
        --     NO copia descripcion_evento, antecedente_clinico_externo ni requiere_derivacion)
        MERGE INTO dm.DimEventoIndice AS tgt
        USING (
            SELECT
                ei.id_evento_indice,
                ei.codigo_evento_local,
                cat.codigo_categoria,
                cat.nombre_categoria,
                ei.anio_ocurrencia_aprox
              FROM pg_temp.src_eventos_indice ei
              JOIN pg_temp.src_cat_categorias_evento_indice cat
                ON cat.id_categoria_evento = ei.id_categoria_evento
        ) AS src
           ON tgt.id_evento_indice = src.id_evento_indice
        WHEN MATCHED THEN
            UPDATE SET
                codigo_evento_local = src.codigo_evento_local,
                codigo_categoria = src.codigo_categoria,
                nombre_categoria = src.nombre_categoria,
                anio_ocurrencia_aprox = src.anio_ocurrencia_aprox
        WHEN NOT MATCHED THEN
            INSERT (id_evento_indice, codigo_evento_local, codigo_categoria, nombre_categoria, anio_ocurrencia_aprox, es_no_aplica)
            VALUES (src.id_evento_indice, src.codigo_evento_local, src.codigo_categoria, src.nombre_categoria, src.anio_ocurrencia_aprox, 0);

        -- ====================================================================
        -- 3. IDEMPOTENCIA: LIMPIAR CARGA PREVIA DEL MISMO CORTE
        -- ====================================================================
        DELETE FROM dm.HechoResultadosEvaluacion     WHERE sk_tiempo_corte = v_sk_tiempo_corte;
        DELETE FROM dm.HechoCumplimientoEvaluaciones WHERE sk_tiempo_corte = v_sk_tiempo_corte;
        DELETE FROM dm.HechoContinuidad              WHERE sk_tiempo_corte = v_sk_tiempo_corte;

        -- ====================================================================
        -- 4. CARGA DE dm.HechoContinuidad (KPI-03 — REGLA D02)
        --    Evaluar fecha_retiro <= v_fecha_corte ANTES que sesiones < 3.
        --    Si se retiró antes de 3 sesiones: Retirado con EsEvaluable = 0.
        -- ====================================================================
        WITH BaseAsignaciones AS (
            SELECT
                a.id_asignacion,
                a.id_estudiante,
                a.id_programa,
                p.id_practica_principal,
                a.fecha_retiro,
                CASE
                    WHEN a.fecha_retiro IS NOT NULL AND a.fecha_retiro <= v_fecha_corte THEN 1
                    ELSE 0
                END AS es_retirado_al_corte,
                CASE
                    WHEN a.fecha_retiro IS NOT NULL AND a.fecha_retiro <= v_fecha_corte THEN a.fecha_retiro
                    ELSE v_fecha_corte
                END AS fecha_limite_exigibilidad
              FROM pg_temp.src_asignaciones a
              JOIN pg_temp.src_programas p ON p.id_programa = a.id_programa
             WHERE a.fecha_inscripcion <= v_fecha_corte
        ),
        PrimeraAsistencia AS (
            SELECT
                ba.id_asignacion,
                MIN(s.fecha_sesion) AS fecha_primera_asistencia
              FROM BaseAsignaciones ba
              JOIN pg_temp.src_sesiones s
                ON s.id_programa = ba.id_programa
               AND s.estado_sesion = 'REALIZADA'
               AND s.fecha_sesion <= ba.fecha_limite_exigibilidad
              JOIN pg_temp.src_asistencias asis
                ON asis.id_asignacion = ba.id_asignacion
               AND asis.id_sesion = s.id_sesion
               AND asis.estado_asistencia = 'ASISTIO'
             GROUP BY ba.id_asignacion
        ),
        SesionesExigiblesDetalle AS (
            SELECT
                ba.id_asignacion,
                s.id_sesion,
                s.fecha_sesion,
                s.numero_sesion,
                asis.estado_asistencia,
                COALESCE(asis.minutos_asistidos, 0) AS minutos_asistidos,
                ROW_NUMBER() OVER (
                    PARTITION BY ba.id_asignacion
                    ORDER BY s.fecha_sesion DESC, s.numero_sesion DESC
                ) AS rn_reciente
              FROM BaseAsignaciones ba
              JOIN PrimeraAsistencia pa
                ON pa.id_asignacion = ba.id_asignacion
              JOIN pg_temp.src_sesiones s
                ON s.id_programa = ba.id_programa
               AND s.estado_sesion = 'REALIZADA'
               AND s.fecha_sesion >= pa.fecha_primera_asistencia
               AND s.fecha_sesion <= ba.fecha_limite_exigibilidad
              LEFT JOIN pg_temp.src_asistencias asis
                ON asis.id_asignacion = ba.id_asignacion
               AND asis.id_sesion = s.id_sesion
        ),
        ResumenAsistencia AS (
            SELECT
                id_asignacion,
                COUNT(*) AS sesiones_exigibles,
                SUM(CASE WHEN estado_asistencia = 'ASISTIO' THEN 1 ELSE 0 END) AS asistencias,
                SUM(CASE WHEN estado_asistencia = 'INASISTENCIA' THEN 1 ELSE 0 END) AS inasistencias,
                SUM(minutos_asistidos) AS minutos_asistidos,
                MAX(CASE WHEN estado_asistencia = 'ASISTIO' THEN fecha_sesion END) AS fecha_ultima_asistencia,
                MAX(CASE WHEN rn_reciente = 1 AND estado_asistencia = 'ASISTIO' THEN 1 ELSE 0 END) AS asistio_ultima,
                MAX(CASE WHEN rn_reciente <= 3 AND estado_asistencia = 'ASISTIO' THEN 1 ELSE 0 END) AS asistio_ultimas_3
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
                COALESCE(ra.sesiones_exigibles, 0) AS sesiones_exigibles,
                COALESCE(ra.asistencias, 0)        AS asistencias,
                COALESCE(ra.inasistencias, 0)      AS inasistencias,
                COALESCE(ra.minutos_asistidos, 0)  AS minutos_asistidos,
                CAST(CASE WHEN COALESCE(ra.sesiones_exigibles, 0) >= 3 THEN 1 ELSE 0 END AS SMALLINT) AS EsEvaluable,
                -- D02: Retiro se evalúa ANTES que sesiones < 3
                CASE
                    WHEN ba.es_retirado_al_corte = 1             THEN 'RETIRADO'
                    WHEN COALESCE(ra.sesiones_exigibles, 0) < 3    THEN 'NO_EVALUABLE'
                    WHEN COALESCE(ra.asistio_ultima, 0) = 1        THEN 'ACTIVO'
                    WHEN COALESCE(ra.asistio_ultimas_3, 0) = 1     THEN 'EN_RIESGO'
                    ELSE 'ABANDONO'
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
            v_sk_tiempo_corte,
            de.sk_estudiante,
            dp.sk_programa,
            dpr.sk_practica,
            dec.sk_estado_continuidad,
            c.id_asignacion,
            c.EsEvaluable,
            CAST(CASE WHEN c.codigo_estado IN ('ACTIVO', 'EN_RIESGO') AND c.EsEvaluable = 1 THEN 1 ELSE 0 END AS SMALLINT),
            c.sesiones_exigibles,
            c.asistencias,
            c.inasistencias,
            c.minutos_asistidos,
            c.fecha_primera_asistencia,
            c.fecha_ultima_asistencia,
            v_id_ejecucion_etl
          FROM Clasificado c
          JOIN dm.DimEstudiante        de  ON de.id_estudiante = c.id_estudiante
          JOIN dm.DimPrograma          dp  ON dp.id_programa   = c.id_programa
          JOIN dm.DimPractica          dpr ON dpr.id_practica  = c.id_practica_principal
          JOIN dm.DimEstadoContinuidad dec ON dec.codigo_estado = c.codigo_estado
                                          AND dec.EsEvaluable   = c.EsEvaluable;

        GET DIAGNOSTICS v_filas_continuidad = ROW_COUNT;

        -- ====================================================================
        -- 5. DETECCIÓN DE INCIDENCIAS DE CALIDAD EN RESULTADOS VIGENTES
        -- ====================================================================

        -- 5.1 Oportunidades con más de un resultado vigente al corte
        INSERT INTO dm.etl_incidencias_calidad (
            id_ejecucion_etl, fecha_corte, regla_codigo, severidad,
            entidad_origen, id_registro_origen, detalle
        )
        SELECT
            v_id_ejecucion_etl,
            v_fecha_corte,
            'DUPLICADO_RESULTADO_VIGENTE',
            'EXCLUSION',
            'dbo.oportunidades_evaluacion',
            r.id_oportunidad,
            CONCAT('Oportunidad con ', COUNT(*), ' resultados vigentes (es_vigente=1) al corte ', to_char(v_fecha_corte, 'YYYY-MM-DD'), '. Excluida del hecho de resultados.')
          FROM pg_temp.src_resultados_evaluacion r
         WHERE r.es_vigente = 1
           AND r.estado_validez = 'VALIDO'
           AND r.fecha_realizacion <= v_fecha_corte
         GROUP BY r.id_oportunidad
        HAVING COUNT(*) > 1;

        GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

        -- ====================================================================
        -- 6. CARGA DE dm.HechoCumplimientoEvaluaciones (KPI-04 — REGLA D01)
        --    Elegible cuando aplicable = 1 y fecha_prevista <= v_fecha_corte.
        --    Excluye futuras (fecha_ventana_inicio > v_fecha_corte) y no aplicables.
        -- ====================================================================
        WITH OportunidadesConDuplicado AS (
            SELECT r.id_oportunidad
              FROM pg_temp.src_resultados_evaluacion r
             WHERE r.es_vigente = 1
               AND r.estado_validez = 'VALIDO'
               AND r.fecha_realizacion <= v_fecha_corte
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
              FROM pg_temp.src_resultados_evaluacion r
             WHERE r.es_vigente = 1
               AND r.estado_validez = 'VALIDO'
               AND r.fecha_realizacion <= v_fecha_corte
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
                -- D01: elegible desde fecha_prevista <= v_fecha_corte
                CAST(CASE WHEN op.fecha_prevista <= v_fecha_corte THEN 1 ELSE 0 END AS SMALLINT) AS EsElegible,
                CAST(CASE WHEN op.fecha_prevista <= v_fecha_corte AND rv.id_resultado IS NOT NULL THEN 1 ELSE 0 END AS SMALLINT) AS EsCompletadaElegible,
                CASE
                    WHEN rv.id_resultado IS NOT NULL AND rv.en_ventana = 1 THEN 'COMPLETADA_EN_VENTANA'
                    WHEN rv.id_resultado IS NOT NULL AND rv.en_ventana = 0 THEN 'COMPLETADA_TARDIA'
                    WHEN rv.id_resultado IS NULL AND op.fecha_ventana_fin > v_fecha_corte THEN 'PENDIENTE_EN_VENTANA'
                    ELSE 'VENCIDA'
                END AS codigo_estado_eval
              FROM pg_temp.src_oportunidades_evaluacion op
              JOIN pg_temp.src_programas p ON p.id_programa = op.id_programa
              LEFT JOIN ResultadoVigenteUnico rv ON rv.id_oportunidad = op.id_oportunidad
             WHERE op.aplicable = 1
               AND op.fecha_ventana_inicio <= v_fecha_corte
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
            v_sk_tiempo_corte,
            CAST(to_char(bc.fecha_prevista, 'YYYYMMDD') AS INT),
            CASE
                WHEN bc.fecha_realizacion IS NOT NULL THEN CAST(to_char(bc.fecha_realizacion, 'YYYYMMDD') AS INT)
                ELSE -1
            END,
            de.sk_estudiante,
            dp.sk_programa,
            dpr.sk_practica,
            di.sk_instrumento,
            COALESCE(devt.sk_evento_indice, -1),
            dmom.sk_momento,
            deval.sk_estado_evaluacion,
            1,
            bc.EsElegible,
            bc.EsCompletadaElegible,
            CAST(CASE WHEN bc.codigo_estado_eval = 'COMPLETADA_EN_VENTANA' THEN 1 ELSE 0 END AS SMALLINT),
            CAST(CASE WHEN bc.codigo_estado_eval = 'COMPLETADA_TARDIA'     THEN 1 ELSE 0 END AS SMALLINT),
            CAST(CASE WHEN bc.codigo_estado_eval = 'PENDIENTE_EN_VENTANA'  THEN 1 ELSE 0 END AS SMALLINT),
            CAST(CASE WHEN bc.codigo_estado_eval = 'VENCIDA'               THEN 1 ELSE 0 END AS SMALLINT),
            bc.puntaje_total,
            bc.numero_version,
            bc.id_resultado,
            v_id_ejecucion_etl
          FROM BaseCumplimiento bc
          JOIN dm.DimEstudiante       de    ON de.id_estudiante    = bc.id_estudiante
          JOIN dm.DimPrograma         dp    ON dp.id_programa      = bc.id_programa
          JOIN dm.DimPractica         dpr   ON dpr.id_practica     = bc.id_practica_principal
          JOIN dm.DimInstrumento      di    ON di.id_instrumento   = bc.id_instrumento
          LEFT JOIN dm.DimEventoIndice devt ON devt.id_evento_indice = bc.id_evento_indice
          JOIN dm.DimMomento          dmom  ON dmom.codigo_momento = bc.momento
          JOIN dm.DimEstadoEvaluacion deval ON deval.codigo_estado = bc.codigo_estado_eval;

        GET DIAGNOSTICS v_filas_cumplimiento = ROW_COUNT;

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
            v_id_ejecucion_etl,
            v_fecha_corte,
            'PCL5_EVENTO_INDICE_DISTINTO',
            'EXCLUSION',
            'dbo.asignaciones',
            op_i.id_asignacion,
            CONCAT(
                'Par PCL-5 con eventos índice distintos (Inicial=', COALESCE(CAST(op_i.id_evento_indice AS VARCHAR(20)), 'NULL'),
                ', Final=', COALESCE(CAST(op_f.id_evento_indice AS VARCHAR(20)), 'NULL'),
                '). Excluido de HechoResultadosEvaluacion.'
            )
          FROM pg_temp.src_oportunidades_evaluacion op_i
          JOIN pg_temp.src_resultados_evaluacion r_i
            ON r_i.id_oportunidad = op_i.id_oportunidad
           AND r_i.es_vigente = 1 AND r_i.estado_validez = 'VALIDO'
           AND r_i.en_ventana = 1 AND r_i.fecha_realizacion <= v_fecha_corte
          JOIN pg_temp.src_oportunidades_evaluacion op_f
            ON op_f.id_asignacion = op_i.id_asignacion
           AND op_f.id_instrumento = op_i.id_instrumento
           AND op_f.momento = 'FINAL'
           AND op_f.aplicable = 1
          JOIN pg_temp.src_resultados_evaluacion r_f
            ON r_f.id_oportunidad = op_f.id_oportunidad
           AND r_f.es_vigente = 1 AND r_f.estado_validez = 'VALIDO'
           AND r_f.en_ventana = 1 AND r_f.fecha_realizacion <= v_fecha_corte
         WHERE op_i.codigo_instrumento = 'PCL-5'
           AND op_i.momento = 'INICIAL'
           AND op_i.aplicable = 1
           AND COALESCE(op_i.id_evento_indice, -1) <> COALESCE(op_f.id_evento_indice, -1)
           AND NOT EXISTS (
               -- Solo reportar si no existe ya un par válido coincidente para ese evento
               SELECT 1
                 FROM pg_temp.src_oportunidades_evaluacion op_ok
                 JOIN pg_temp.src_resultados_evaluacion r_ok
                   ON r_ok.id_oportunidad = op_ok.id_oportunidad
                  AND r_ok.es_vigente = 1 AND r_ok.estado_validez = 'VALIDO'
                  AND r_ok.en_ventana = 1 AND r_ok.fecha_realizacion <= v_fecha_corte
                WHERE op_ok.id_asignacion = op_i.id_asignacion
                  AND op_ok.id_instrumento = op_i.id_instrumento
                  AND op_ok.momento = 'FINAL'
                  AND op_ok.id_evento_indice = op_i.id_evento_indice
           );

        GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

        -- 7.2 Registrar incidencia si un par en ventana tiene versiones de formulario incompatibles
        INSERT INTO dm.etl_incidencias_calidad (
            id_ejecucion_etl, fecha_corte, regla_codigo, severidad,
            entidad_origen, id_registro_origen, detalle
        )
        SELECT
            v_id_ejecucion_etl,
            v_fecha_corte,
            'VERSION_INSTRUMENTO_DISTINTA',
            'EXCLUSION',
            'dbo.asignaciones',
            op_i.id_asignacion,
            CONCAT(
                'Par ', op_i.codigo_instrumento, ' con versiones de formulario distintas (Inicial=',
                COALESCE(CAST(op_i.id_version_instrumento AS VARCHAR(20)), 'HEREDADO'),
                ', Final=', COALESCE(CAST(op_f.id_version_instrumento AS VARCHAR(20)), 'HEREDADO'),
                '). Excluido de HechoResultadosEvaluacion.'
            )
          FROM pg_temp.src_oportunidades_evaluacion op_i
          JOIN pg_temp.src_resultados_evaluacion r_i
            ON r_i.id_oportunidad = op_i.id_oportunidad
           AND r_i.es_vigente = 1 AND r_i.estado_validez = 'VALIDO'
           AND r_i.en_ventana = 1 AND r_i.fecha_realizacion <= v_fecha_corte
          JOIN pg_temp.src_oportunidades_evaluacion op_f
            ON op_f.id_asignacion = op_i.id_asignacion
           AND op_f.id_instrumento = op_i.id_instrumento
           AND op_f.momento = 'FINAL'
           AND op_f.aplicable = 1
           AND (
               (op_i.codigo_instrumento = 'PSS-10' AND op_i.id_evento_indice IS NULL AND op_f.id_evento_indice IS NULL)
               OR
               (op_i.codigo_instrumento = 'PCL-5' AND op_i.id_evento_indice IS NOT NULL AND op_i.id_evento_indice = op_f.id_evento_indice)
           )
          JOIN pg_temp.src_resultados_evaluacion r_f
            ON r_f.id_oportunidad = op_f.id_oportunidad
           AND r_f.es_vigente = 1 AND r_f.estado_validez = 'VALIDO'
           AND r_f.en_ventana = 1 AND r_f.fecha_realizacion <= v_fecha_corte
         WHERE op_i.momento = 'INICIAL'
           AND op_i.aplicable = 1
           AND COALESCE(op_i.id_version_instrumento, -1) <> COALESCE(op_f.id_version_instrumento, -1);

        GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

        -- 7.3 Inserción de pares válidos limpios en dm.HechoResultadosEvaluacion
        WITH OportunidadesConDuplicado AS (
            SELECT r.id_oportunidad
              FROM pg_temp.src_resultados_evaluacion r
             WHERE r.es_vigente = 1
               AND r.estado_validez = 'VALIDO'
               AND r.fecha_realizacion <= v_fecha_corte
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
              FROM pg_temp.src_oportunidades_evaluacion op
              JOIN pg_temp.src_resultados_evaluacion r
                ON r.id_oportunidad = op.id_oportunidad
             WHERE op.aplicable = 1
               AND r.es_vigente = 1
               AND r.estado_validez = 'VALIDO'
               AND r.en_ventana = 1
               AND r.fecha_realizacion <= v_fecha_corte
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
               AND fin.momento        = 'FINAL'
               AND COALESCE(fin.id_version_instrumento, -1) = COALESCE(ini.id_version_instrumento, -1)
               AND (
                   (ini.codigo_instrumento = 'PSS-10' AND ini.id_evento_indice IS NULL AND fin.id_evento_indice IS NULL)
                   OR
                   (ini.codigo_instrumento = 'PCL-5' AND ini.id_evento_indice IS NOT NULL AND ini.id_evento_indice = fin.id_evento_indice)
               )
               AND fin.fecha_realizacion >= ini.fecha_realizacion
              JOIN pg_temp.src_programas p ON p.id_programa = ini.id_programa
             WHERE ini.momento = 'INICIAL'
        )
        INSERT INTO dm.HechoResultadosEvaluacion (
            sk_tiempo_corte, sk_tiempo_final, sk_estudiante, sk_programa, sk_practica,
            sk_instrumento, sk_evento_indice,
            id_asignacion, id_resultado_inicial, id_resultado_final, id_version_instrumento,
            ParesValidos, SumaInicial, SumaFinal, PuntosReduccion,
            EsReduccion, EsSinCambio, EsIncremento, CumpleMetaIndividual, id_ejecucion_etl
        )
        SELECT
            v_sk_tiempo_corte,
            CAST(to_char(pv.fecha_realizacion_final, 'YYYYMMDD') AS INT),
            de.sk_estudiante,
            dp.sk_programa,
            dpr.sk_practica,
            di.sk_instrumento,
            COALESCE(devt.sk_evento_indice, -1),
            pv.id_asignacion,
            pv.id_resultado_inicial,
            pv.id_resultado_final,
            pv.id_version_instrumento,
            1,
            pv.SumaInicial,
            pv.SumaFinal,
            pv.PuntosReduccion,
            CAST(CASE WHEN pv.PuntosReduccion > 0 THEN 1 ELSE 0 END AS SMALLINT),
            CAST(CASE WHEN pv.PuntosReduccion = 0 THEN 1 ELSE 0 END AS SMALLINT),
            CAST(CASE WHEN pv.PuntosReduccion < 0 THEN 1 ELSE 0 END AS SMALLINT),
            CAST(CASE WHEN pv.PuntosReduccion >= di.meta_reduccion_operativa THEN 1 ELSE 0 END AS SMALLINT),
            v_id_ejecucion_etl
          FROM ParesValidos pv
          JOIN dm.DimEstudiante        de   ON de.id_estudiante     = pv.id_estudiante
          JOIN dm.DimPrograma          dp   ON dp.id_programa       = pv.id_programa
          JOIN dm.DimPractica          dpr  ON dpr.id_practica      = pv.id_practica_principal
          JOIN dm.DimInstrumento       di   ON di.id_instrumento    = pv.id_instrumento
          LEFT JOIN dm.DimEventoIndice devt ON devt.id_evento_indice = pv.id_evento_indice;

        GET DIAGNOSTICS v_filas_resultados = ROW_COUNT;


 UPDATE dm.etl_log_ejecuciones SET fin_ejecucion=clock_timestamp(),estado='EXITOSO',filas_continuidad=v_filas_continuidad,filas_cumplimiento=v_filas_cumplimiento,filas_resultados=v_filas_resultados,incidencias_detectadas=v_incidencias,mensaje='Carga completa' WHERE id_ejecucion_etl=v_id_ejecucion_etl;
 EXCEPTION WHEN OTHERS THEN
 UPDATE dm.etl_log_ejecuciones SET fin_ejecucion=clock_timestamp(),estado='ERROR',mensaje=left(SQLERRM,500) WHERE id_ejecucion_etl=v_id_ejecucion_etl;
 END;
 RETURN v_id_ejecucion_etl;
END;
$$;


