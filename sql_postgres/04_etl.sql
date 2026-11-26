-- PostgreSQL 17. Execute in mmet_bi_dm. Source snapshot is supplied by the backend.
-- Incremental MERGE on dimensions and facts + RQ-BI-13 quality checks.
-- One target transaction, serialized loads; an error preserves the previous published cut.
CREATE OR REPLACE FUNCTION dm.ejecutar_etl(p_fecha_corte date, p_snapshot jsonb) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
 v_fecha_corte date := p_fecha_corte;
 v_sk_tiempo_corte integer := to_char(p_fecha_corte, 'YYYYMMDD')::integer;
 v_id_ejecucion_etl bigint;
 v_filas_continuidad integer := 0;
 v_filas_cumplimiento integer := 0;
 v_filas_resultados integer := 0;
 v_incidencias integer := 0;
 v_count integer;
 v_err_msg text;
BEGIN
 PERFORM pg_advisory_xact_lock(726384);

 INSERT INTO dm.etl_log_ejecuciones(fecha_corte, estado, mensaje)
 VALUES (p_fecha_corte, 'EN_PROCESO', 'Carga incremental desde snapshot PostgreSQL OLTP')
 RETURNING id_ejecucion_etl INTO v_id_ejecucion_etl;

 -- 1. Validar fecha de corte dentro de dm.DimTiempo (excluyendo -1)
 IF NOT EXISTS (SELECT 1 FROM dm.DimTiempo WHERE sk_tiempo = v_sk_tiempo_corte AND es_no_aplica = 0) THEN
  v_err_msg := CONCAT('La fecha de corte ', to_char(v_fecha_corte, 'YYYY-MM-DD'), ' no existe en dm.DimTiempo.');
  INSERT INTO dm.etl_incidencias_calidad (
   id_ejecucion_etl, fecha_corte, regla_codigo, severidad,
   entidad_origen, id_registro_origen, detalle
  ) VALUES (
   v_id_ejecucion_etl, v_fecha_corte, 'FECHA_CORTE_INVALIDA', 'ERROR',
   'dm.DimTiempo', NULL, v_err_msg
  );
  UPDATE dm.etl_log_ejecuciones
     SET fin_ejecucion = clock_timestamp(),
         estado = 'ERROR',
         incidencias_detectadas = 1,
         mensaje = left(v_err_msg, 500)
   WHERE id_ejecucion_etl = v_id_ejecucion_etl;
  RETURN v_id_ejecucion_etl;
 END IF;

 IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR EXISTS (
  SELECT 1
    FROM unnest(ARRAY[
     'estudiantes','programas','cat_practicas','cat_instrumentos',
     'cat_categorias_evento_indice','eventos_indice','asignaciones',
     'sesiones','asistencias','oportunidades_evaluacion','resultados_evaluacion'
    ]) AS k(name)
   WHERE jsonb_typeof(p_snapshot->k.name) IS DISTINCT FROM 'array'
 ) THEN
  v_err_msg := 'Snapshot OLTP incompleto o inválido.';
  INSERT INTO dm.etl_incidencias_calidad (
   id_ejecucion_etl, fecha_corte, regla_codigo, severidad,
   entidad_origen, id_registro_origen, detalle
  ) VALUES (
   v_id_ejecucion_etl, v_fecha_corte, 'ERROR_EJECUCION_ETL', 'ERROR',
   'dm.ejecutar_etl', NULL, v_err_msg
  );
  UPDATE dm.etl_log_ejecuciones
     SET fin_ejecucion = clock_timestamp(),
         estado = 'ERROR',
         incidencias_detectadas = 1,
         mensaje = v_err_msg
   WHERE id_ejecucion_etl = v_id_ejecucion_etl;
  RETURN v_id_ejecucion_etl;
 END IF;

 -- 2. Poblar tablas temporales de staging desde JSONB
 CREATE TEMP TABLE src_estudiantes (
  id_estudiante BIGINT, codigo_estudiante VARCHAR(50), edad_anios SMALLINT,
  sexo_codificado VARCHAR(20), facultad_o_area VARCHAR(80), carrera VARCHAR(120), ciclo_academico SMALLINT
 ) ON COMMIT DROP;
 INSERT INTO pg_temp.src_estudiantes
 SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_estudiantes, p_snapshot->'estudiantes');

 CREATE TEMP TABLE src_programas (
  id_programa BIGINT, codigo_programa VARCHAR(40), nombre_programa VARCHAR(150),
  periodo_academico VARCHAR(20), fecha_inicio DATE, fecha_cierre DATE,
  estado_programa VARCHAR(20), id_practica_principal SMALLINT
 ) ON COMMIT DROP;
 INSERT INTO pg_temp.src_programas
 SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_programas, p_snapshot->'programas');

 CREATE TEMP TABLE src_cat_practicas (
  id_practica SMALLINT, codigo_practica VARCHAR(20), nombre_practica VARCHAR(100), es_mixto SMALLINT
 ) ON COMMIT DROP;
 INSERT INTO pg_temp.src_cat_practicas
 SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_cat_practicas, p_snapshot->'cat_practicas');

 CREATE TEMP TABLE src_cat_instrumentos (
  id_instrumento SMALLINT, codigo_instrumento VARCHAR(15), version_instrumento VARCHAR(30),
  nombre_instrumento VARCHAR(120), puntaje_minimo SMALLINT, puntaje_maximo SMALLINT, requiere_evento_indice SMALLINT
 ) ON COMMIT DROP;
 INSERT INTO pg_temp.src_cat_instrumentos
 SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_cat_instrumentos, p_snapshot->'cat_instrumentos');

 CREATE TEMP TABLE src_cat_categorias_evento_indice (
  id_categoria_evento SMALLINT, codigo_categoria VARCHAR(40), nombre_categoria VARCHAR(120)
 ) ON COMMIT DROP;
 INSERT INTO pg_temp.src_cat_categorias_evento_indice
 SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_cat_categorias_evento_indice, p_snapshot->'cat_categorias_evento_indice');

 CREATE TEMP TABLE src_eventos_indice (
  id_evento_indice BIGINT, id_estudiante BIGINT, codigo_evento_local VARCHAR(30),
  id_categoria_evento SMALLINT, anio_ocurrencia_aprox SMALLINT
 ) ON COMMIT DROP;
 INSERT INTO pg_temp.src_eventos_indice
 SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_eventos_indice, p_snapshot->'eventos_indice');

 CREATE TEMP TABLE src_asignaciones (
  id_asignacion BIGINT, id_estudiante BIGINT, id_programa BIGINT, fecha_inscripcion DATE, fecha_retiro DATE
 ) ON COMMIT DROP;
 INSERT INTO pg_temp.src_asignaciones
 SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_asignaciones, p_snapshot->'asignaciones');

 CREATE TEMP TABLE src_sesiones (
  id_sesion BIGINT, id_programa BIGINT, fecha_sesion DATE, estado_sesion VARCHAR(20), numero_sesion SMALLINT
 ) ON COMMIT DROP;
 INSERT INTO pg_temp.src_sesiones
 SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_sesiones, p_snapshot->'sesiones');

 CREATE TEMP TABLE src_asistencias (
  id_asistencia BIGINT, id_asignacion BIGINT, id_sesion BIGINT, estado_asistencia VARCHAR(20), minutos_asistidos SMALLINT
 ) ON COMMIT DROP;
 INSERT INTO pg_temp.src_asistencias
 SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_asistencias, p_snapshot->'asistencias');

 CREATE TEMP TABLE src_oportunidades_evaluacion (
  id_oportunidad BIGINT, id_asignacion BIGINT, id_estudiante BIGINT, id_programa BIGINT,
  id_instrumento SMALLINT, codigo_instrumento VARCHAR(15), id_version_instrumento BIGINT,
  id_evento_indice BIGINT, momento VARCHAR(10), aplicable SMALLINT,
  fecha_ventana_inicio DATE, fecha_ventana_fin DATE, fecha_prevista DATE
 ) ON COMMIT DROP;
 INSERT INTO pg_temp.src_oportunidades_evaluacion
 SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_oportunidades_evaluacion, p_snapshot->'oportunidades_evaluacion');

 CREATE TEMP TABLE src_resultados_evaluacion (
  id_resultado BIGINT, id_oportunidad BIGINT, puntaje_total SMALLINT, numero_version SMALLINT,
  fecha_realizacion DATE, en_ventana SMALLINT, es_vigente SMALLINT, estado_validez VARCHAR(15)
 ) ON COMMIT DROP;
 INSERT INTO pg_temp.src_resultados_evaluacion
 SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_resultados_evaluacion, p_snapshot->'resultados_evaluacion');

 CREATE TEMP TABLE src_respuestas_resumen (
  id_resultado BIGINT, suma_items INT
 ) ON COMMIT DROP;
 IF jsonb_typeof(p_snapshot->'respuestas_resumen') = 'array' THEN
  INSERT INTO pg_temp.src_respuestas_resumen
  SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.src_respuestas_resumen, p_snapshot->'respuestas_resumen');
 END IF;

 CREATE INDEX ON pg_temp.src_resultados_evaluacion(id_oportunidad);
 CREATE INDEX ON pg_temp.src_oportunidades_evaluacion(id_asignacion, id_instrumento, momento);
 CREATE INDEX ON pg_temp.src_asistencias(id_asignacion, id_sesion);
 CREATE INDEX ON pg_temp.src_sesiones(id_programa, fecha_sesion);
 CREATE INDEX ON pg_temp.src_respuestas_resumen(id_resultado);

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
 ANALYZE pg_temp.src_respuestas_resumen;

 -- ========================================================================
 -- 3. DETECCIÓN EXHAUSTIVA DE INCIDENCIAS DE CALIDAD (RQ-BI-13)
 --    Se persiste antes del bloque transaccional de carga para que las
 --    incidencias detectadas sobrevivan ante un eventual rollback de hechos.
 -- ========================================================================

 -- 3.A DUPLICADOS
 -- 3.A.1 Oportunidades con más de un resultado vigente válido al corte
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'DUPLICADO_RESULTADO_VIGENTE', 'EXCLUSION', 'dbo.oportunidades_evaluacion', r.id_oportunidad,
        CONCAT('Oportunidad con ', COUNT(*), ' resultados vigentes (es_vigente=1) al corte ', to_char(v_fecha_corte, 'YYYY-MM-DD'), '. Excluida de hechos.')
   FROM pg_temp.src_resultados_evaluacion r
  WHERE r.es_vigente = 1 AND r.estado_validez = 'VALIDO' AND r.fecha_realizacion <= v_fecha_corte
  GROUP BY r.id_oportunidad
 HAVING COUNT(*) > 1;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.A.2 Códigos de estudiante duplicados
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'DUPLICADO_ESTUDIANTE_CODIGO', 'ADVERTENCIA', 'dbo.estudiantes', MIN(e.id_estudiante),
        CONCAT('Código de estudiante duplicado: ', e.codigo_estudiante, ' (', COUNT(*), ' registros).')
   FROM pg_temp.src_estudiantes e
  GROUP BY e.codigo_estudiante
 HAVING COUNT(*) > 1;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.A.3 Asignaciones duplicadas (mismo estudiante y programa)
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'DUPLICADO_ASIGNACION', 'EXCLUSION', 'dbo.asignaciones', MIN(a.id_asignacion),
        CONCAT('Asignación duplicada para estudiante=', a.id_estudiante, ', programa=', a.id_programa, ' (total=', COUNT(*), ').')
   FROM pg_temp.src_asignaciones a
  WHERE a.fecha_inscripcion <= v_fecha_corte
  GROUP BY a.id_estudiante, a.id_programa
 HAVING COUNT(*) > 1;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.A.4 Asistencias duplicadas (misma asignación y sesión)
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'DUPLICADO_ASISTENCIA', 'ADVERTENCIA', 'dbo.asistencias', MIN(asis.id_asistencia),
        CONCAT('Asistencia duplicada para asignacion=', asis.id_asignacion, ', sesion=', asis.id_sesion, ' (total=', COUNT(*), ').')
   FROM pg_temp.src_asistencias asis
  GROUP BY asis.id_asignacion, asis.id_sesion
 HAVING COUNT(*) > 1;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.A.5 Oportunidades aplicables duplicadas
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'DUPLICADO_OPORTUNIDAD', 'EXCLUSION', 'dbo.oportunidades_evaluacion', MIN(op.id_oportunidad),
        CONCAT('Oportunidad duplicada en asignacion=', op.id_asignacion, ', instrumento=', op.codigo_instrumento,
               ', momento=', op.momento, ', evento=', COALESCE(CAST(op.id_evento_indice AS VARCHAR(20)), 'NULL'), ' (total=', COUNT(*), ').')
   FROM pg_temp.src_oportunidades_evaluacion op
  WHERE op.aplicable = 1 AND op.fecha_ventana_inicio <= v_fecha_corte
  GROUP BY op.id_asignacion, op.id_instrumento, op.codigo_instrumento, op.momento, op.id_evento_indice
 HAVING COUNT(*) > 1;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.B FALTANTES RELEVANTES
 -- 3.B.1 Atributos obligatorios faltantes en estudiantes
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'FALTANTE_ESTUDIANTE', 'ADVERTENCIA', 'dbo.estudiantes', e.id_estudiante,
        'Estudiante con atributo analítico faltante o vacío (facultad, carrera, sexo o edad).'
   FROM pg_temp.src_estudiantes e
  WHERE btrim(COALESCE(e.codigo_estudiante, '')) = ''
     OR btrim(COALESCE(e.facultad_o_area, '')) = ''
     OR btrim(COALESCE(e.carrera, '')) = ''
     OR btrim(COALESCE(e.sexo_codificado, '')) = ''
     OR e.edad_anios IS NULL OR e.edad_anios <= 0;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.B.2 Atributos obligatorios faltantes en programas
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'FALTANTE_PROGRAMA', 'ADVERTENCIA', 'dbo.programas', p.id_programa,
        'Programa sin práctica principal o sin fechas de inicio/cierre.'
   FROM pg_temp.src_programas p
  WHERE p.id_practica_principal IS NULL OR p.fecha_inicio IS NULL OR p.fecha_cierre IS NULL;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.B.3 Oportunidades aplicables sin fechas de ventana o fecha prevista
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'FALTANTE_VENTANA_OPORTUNIDAD', 'EXCLUSION', 'dbo.oportunidades_evaluacion', op.id_oportunidad,
        'Oportunidad aplicable sin fecha_prevista, fecha_ventana_inicio o fecha_ventana_fin.'
   FROM pg_temp.src_oportunidades_evaluacion op
  WHERE op.aplicable = 1 AND (op.fecha_prevista IS NULL OR op.fecha_ventana_inicio IS NULL OR op.fecha_ventana_fin IS NULL);
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.B.4 Resultados vigentes válidos sin puntaje o sin fecha de realización
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'FALTANTE_RESULTADO', 'EXCLUSION', 'dbo.resultados_evaluacion', r.id_resultado,
        'Resultado vigente válido sin puntaje_total o sin fecha_realizacion.'
   FROM pg_temp.src_resultados_evaluacion r
  WHERE r.es_vigente = 1 AND r.estado_validez = 'VALIDO' AND (r.puntaje_total IS NULL OR r.fecha_realizacion IS NULL);
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.C PUNTAJES INVÁLIDOS
 -- 3.C.1 Puntaje fuera del rango oficial del instrumento (PSS-10: 0..40, PCL-5: 0..80)
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'PUNTAJE_FUERA_RANGO', 'EXCLUSION', 'dbo.resultados_evaluacion', r.id_resultado,
        CONCAT('Puntaje fuera de rango para ', ci.codigo_instrumento, ': obtenido=', r.puntaje_total,
               ', permitido=[', ci.puntaje_minimo, '..', ci.puntaje_maximo, ']. Excluido de hechos.')
   FROM pg_temp.src_resultados_evaluacion r
   JOIN pg_temp.src_oportunidades_evaluacion op ON op.id_oportunidad = r.id_oportunidad
   JOIN pg_temp.src_cat_instrumentos ci ON ci.id_instrumento = op.id_instrumento
  WHERE r.es_vigente = 1 AND r.estado_validez = 'VALIDO' AND r.fecha_realizacion <= v_fecha_corte
    AND (r.puntaje_total < ci.puntaje_minimo OR r.puntaje_total > ci.puntaje_maximo);
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.C.2 Discrepancia entre puntaje_total y suma de ítems puntuados
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'PUNTAJE_INCONSISTENTE_ITEMS', 'ADVERTENCIA', 'dbo.resultados_evaluacion', r.id_resultado,
        CONCAT('Discrepancia entre puntaje_total (', r.puntaje_total, ') y suma de ítems (', s.suma_items, ').')
   FROM pg_temp.src_resultados_evaluacion r
   JOIN pg_temp.src_respuestas_resumen s ON s.id_resultado = r.id_resultado
  WHERE r.es_vigente = 1 AND r.estado_validez = 'VALIDO' AND r.fecha_realizacion <= v_fecha_corte
    AND r.puntaje_total <> s.suma_items;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.D EVENTOS ÍNDICE INCONSISTENTES
 -- 3.D.1 PCL-5 aplicable sin evento índice
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'PCL5_SIN_EVENTO_INDICE', 'EXCLUSION', 'dbo.oportunidades_evaluacion', op.id_oportunidad,
        'Oportunidad PCL-5 aplicable sin id_evento_indice asociado. Excluida de pares PCL-5.'
   FROM pg_temp.src_oportunidades_evaluacion op
  WHERE op.aplicable = 1 AND op.codigo_instrumento = 'PCL-5'
    AND op.fecha_ventana_inicio <= v_fecha_corte AND op.id_evento_indice IS NULL;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.D.2 PSS-10 aplicable con evento índice asignado
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'PSS10_CON_EVENTO_INDICE', 'EXCLUSION', 'dbo.oportunidades_evaluacion', op.id_oportunidad,
        CONCAT('Oportunidad PSS-10 vinculada erróneamente a id_evento_indice=', op.id_evento_indice, '. Excluida de pares.')
   FROM pg_temp.src_oportunidades_evaluacion op
  WHERE op.aplicable = 1 AND op.codigo_instrumento = 'PSS-10'
    AND op.fecha_ventana_inicio <= v_fecha_corte AND op.id_evento_indice IS NOT NULL;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.D.3 Evento índice asociado a un estudiante distinto al de la oportunidad
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'EVENTO_INDICE_ESTUDIANTE_MISMATCH', 'EXCLUSION', 'dbo.oportunidades_evaluacion', op.id_oportunidad,
        CONCAT('Evento índice ', op.id_evento_indice, ' pertenece a estudiante=', ei.id_estudiante,
               ', pero oportunidad corresponde a estudiante=', op.id_estudiante, '.')
   FROM pg_temp.src_oportunidades_evaluacion op
   JOIN pg_temp.src_eventos_indice ei ON ei.id_evento_indice = op.id_evento_indice
  WHERE op.aplicable = 1 AND op.fecha_ventana_inicio <= v_fecha_corte
    AND ei.id_estudiante IS NOT NULL AND ei.id_estudiante <> op.id_estudiante;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.D.4 Pares PCL-5 con eventos índice distintos en la misma asignación
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT DISTINCT v_id_ejecucion_etl, v_fecha_corte, 'PCL5_EVENTO_INDICE_DISTINTO', 'EXCLUSION', 'dbo.asignaciones', op_i.id_asignacion,
        CONCAT('Par PCL-5 con eventos índice distintos (Inicial=', COALESCE(CAST(op_i.id_evento_indice AS VARCHAR(20)), 'NULL'),
               ', Final=', COALESCE(CAST(op_f.id_evento_indice AS VARCHAR(20)), 'NULL'), '). Excluido de HechoResultadosEvaluacion.')
   FROM pg_temp.src_oportunidades_evaluacion op_i
   JOIN pg_temp.src_resultados_evaluacion r_i
     ON r_i.id_oportunidad = op_i.id_oportunidad AND r_i.es_vigente = 1 AND r_i.estado_validez = 'VALIDO'
    AND r_i.en_ventana = 1 AND r_i.fecha_realizacion <= v_fecha_corte
   JOIN pg_temp.src_oportunidades_evaluacion op_f
     ON op_f.id_asignacion = op_i.id_asignacion AND op_f.id_instrumento = op_i.id_instrumento
    AND op_f.momento = 'FINAL' AND op_f.aplicable = 1
   JOIN pg_temp.src_resultados_evaluacion r_f
     ON r_f.id_oportunidad = op_f.id_oportunidad AND r_f.es_vigente = 1 AND r_f.estado_validez = 'VALIDO'
    AND r_f.en_ventana = 1 AND r_f.fecha_realizacion <= v_fecha_corte
  WHERE op_i.codigo_instrumento = 'PCL-5' AND op_i.momento = 'INICIAL' AND op_i.aplicable = 1
    AND COALESCE(op_i.id_evento_indice, -1) <> COALESCE(op_f.id_evento_indice, -1)
    AND NOT EXISTS (
     SELECT 1
       FROM pg_temp.src_oportunidades_evaluacion op_ok
       JOIN pg_temp.src_resultados_evaluacion r_ok
         ON r_ok.id_oportunidad = op_ok.id_oportunidad AND r_ok.es_vigente = 1 AND r_ok.estado_validez = 'VALIDO'
        AND r_ok.en_ventana = 1 AND r_ok.fecha_realizacion <= v_fecha_corte
      WHERE op_ok.id_asignacion = op_i.id_asignacion AND op_ok.id_instrumento = op_i.id_instrumento
        AND op_ok.momento = 'FINAL' AND op_ok.id_evento_indice = op_i.id_evento_indice
    );
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.D.5 Pares en ventana con versiones de formulario incompatibles
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'VERSION_INSTRUMENTO_DISTINTA', 'EXCLUSION', 'dbo.asignaciones', op_i.id_asignacion,
        CONCAT('Par ', op_i.codigo_instrumento, ' con versiones de formulario distintas (Inicial=',
               COALESCE(CAST(op_i.id_version_instrumento AS VARCHAR(20)), 'HEREDADO'),
               ', Final=', COALESCE(CAST(op_f.id_version_instrumento AS VARCHAR(20)), 'HEREDADO'),
               '). Excluido de HechoResultadosEvaluacion.')
   FROM pg_temp.src_oportunidades_evaluacion op_i
   JOIN pg_temp.src_resultados_evaluacion r_i
     ON r_i.id_oportunidad = op_i.id_oportunidad AND r_i.es_vigente = 1 AND r_i.estado_validez = 'VALIDO'
    AND r_i.en_ventana = 1 AND r_i.fecha_realizacion <= v_fecha_corte
   JOIN pg_temp.src_oportunidades_evaluacion op_f
     ON op_f.id_asignacion = op_i.id_asignacion AND op_f.id_instrumento = op_i.id_instrumento
    AND op_f.momento = 'FINAL' AND op_f.aplicable = 1
    AND ((op_i.codigo_instrumento = 'PSS-10' AND op_i.id_evento_indice IS NULL AND op_f.id_evento_indice IS NULL)
      OR (op_i.codigo_instrumento = 'PCL-5' AND op_i.id_evento_indice IS NOT NULL AND op_i.id_evento_indice = op_f.id_evento_indice))
   JOIN pg_temp.src_resultados_evaluacion r_f
     ON r_f.id_oportunidad = op_f.id_oportunidad AND r_f.es_vigente = 1 AND r_f.estado_validez = 'VALIDO'
    AND r_f.en_ventana = 1 AND r_f.fecha_realizacion <= v_fecha_corte
  WHERE op_i.momento = 'INICIAL' AND op_i.aplicable = 1
    AND COALESCE(op_i.id_version_instrumento, -1) <> COALESCE(op_f.id_version_instrumento, -1);
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.E FECHAS FUERA DE RANGO
 -- 3.E.1 Evaluaciones realizadas fuera de ventana [fecha_ventana_inicio, fecha_ventana_fin]
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'FECHA_FUERA_VENTANA', 'ADVERTENCIA', 'dbo.resultados_evaluacion', r.id_resultado,
        CONCAT('Evaluación ', op.codigo_instrumento, ' (', op.momento, ') realizada el ',
               to_char(r.fecha_realizacion, 'YYYY-MM-DD'), ' fuera de ventana [',
               to_char(op.fecha_ventana_inicio, 'YYYY-MM-DD'), ' .. ', to_char(op.fecha_ventana_fin, 'YYYY-MM-DD'),
               ']. Excluida de pares.')
   FROM pg_temp.src_resultados_evaluacion r
   JOIN pg_temp.src_oportunidades_evaluacion op ON op.id_oportunidad = r.id_oportunidad
  WHERE op.aplicable = 1 AND r.es_vigente = 1 AND r.estado_validez = 'VALIDO' AND r.fecha_realizacion <= v_fecha_corte
    AND (r.en_ventana = 0 OR r.fecha_realizacion < op.fecha_ventana_inicio OR r.fecha_realizacion > op.fecha_ventana_fin);
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.E.2 Par INICIAL-FINAL con orden cronológico invertido (FINAL < INICIAL)
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'FECHA_ORDEN_INVERTIDO', 'EXCLUSION', 'dbo.asignaciones', op_i.id_asignacion,
        CONCAT('Par ', op_i.codigo_instrumento, ' con fecha FINAL (', to_char(r_f.fecha_realizacion, 'YYYY-MM-DD'),
               ') anterior a fecha INICIAL (', to_char(r_i.fecha_realizacion, 'YYYY-MM-DD'),
               '). Excluido de HechoResultadosEvaluacion.')
   FROM pg_temp.src_oportunidades_evaluacion op_i
   JOIN pg_temp.src_resultados_evaluacion r_i
     ON r_i.id_oportunidad = op_i.id_oportunidad AND r_i.es_vigente = 1 AND r_i.estado_validez = 'VALIDO'
    AND r_i.fecha_realizacion <= v_fecha_corte
   JOIN pg_temp.src_oportunidades_evaluacion op_f
     ON op_f.id_asignacion = op_i.id_asignacion AND op_f.id_instrumento = op_i.id_instrumento
    AND op_f.momento = 'FINAL' AND op_f.aplicable = 1
    AND COALESCE(op_f.id_evento_indice, -1) = COALESCE(op_i.id_evento_indice, -1)
   JOIN pg_temp.src_resultados_evaluacion r_f
     ON r_f.id_oportunidad = op_f.id_oportunidad AND r_f.es_vigente = 1 AND r_f.estado_validez = 'VALIDO'
    AND r_f.fecha_realizacion <= v_fecha_corte
  WHERE op_i.momento = 'INICIAL' AND op_i.aplicable = 1 AND r_f.fecha_realizacion < r_i.fecha_realizacion;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.E.3 Programas con fecha_cierre < fecha_inicio
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'FECHA_PROGRAMA_INVALIDA', 'ADVERTENCIA', 'dbo.programas', p.id_programa,
        CONCAT('Programa ', p.codigo_programa, ' con fecha_cierre (', to_char(p.fecha_cierre, 'YYYY-MM-DD'),
               ') anterior a fecha_inicio (', to_char(p.fecha_inicio, 'YYYY-MM-DD'), ').')
   FROM pg_temp.src_programas p
  WHERE p.fecha_cierre < p.fecha_inicio;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.E.4 Sesiones con fecha fuera del rango del programa
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'FECHA_SESION_FUERA_PROGRAMA', 'ADVERTENCIA', 'dbo.sesiones', s.id_sesion,
        CONCAT('Sesión ', s.id_sesion, ' con fecha ', to_char(s.fecha_sesion, 'YYYY-MM-DD'),
               ' fuera del rango del programa [', to_char(p.fecha_inicio, 'YYYY-MM-DD'),
               ' .. ', to_char(p.fecha_cierre, 'YYYY-MM-DD'), '].')
   FROM pg_temp.src_sesiones s
   JOIN pg_temp.src_programas p ON p.id_programa = s.id_programa
  WHERE s.fecha_sesion < p.fecha_inicio OR s.fecha_sesion > p.fecha_cierre;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- 3.E.5 Asistencias registradas sobre sesiones no realizadas
 INSERT INTO dm.etl_incidencias_calidad (id_ejecucion_etl, fecha_corte, regla_codigo, severidad, entidad_origen, id_registro_origen, detalle)
 SELECT v_id_ejecucion_etl, v_fecha_corte, 'ASISTENCIA_SESION_NO_REALIZADA', 'ADVERTENCIA', 'dbo.asistencias', asis.id_asistencia,
        CONCAT('Asistencia (', asis.estado_asistencia, ') registrada en sesión ', s.id_sesion, ' cuyo estado es ', s.estado_sesion, '.')
   FROM pg_temp.src_asistencias asis
   JOIN pg_temp.src_sesiones s ON s.id_sesion = asis.id_sesion
  WHERE asis.estado_asistencia IN ('ASISTIO', 'INASISTENCIA') AND s.estado_sesion <> 'REALIZADA' AND s.fecha_sesion <= v_fecha_corte;
 GET DIAGNOSTICS v_count = ROW_COUNT; v_incidencias := v_incidencias + v_count;

 -- ========================================================================
 -- 4. BLOQUE TRANSACCIONAL DE MERGE INCREMENTAL (DIMENSIONES Y HECHOS)
 -- ========================================================================
 BEGIN
  -- 4.1 DimEstudiante
  MERGE INTO dm.DimEstudiante AS tgt
  USING (
   SELECT e.id_estudiante, e.codigo_estudiante, e.edad_anios,
          CASE WHEN e.edad_anios BETWEEN 18 AND 20 THEN '18-20'
               WHEN e.edad_anios BETWEEN 21 AND 24 THEN '21-24'
               ELSE '25+' END AS grupo_etario,
          e.sexo_codificado, e.facultad_o_area, e.carrera, e.ciclo_academico
     FROM pg_temp.src_estudiantes e
  ) AS src ON tgt.id_estudiante = src.id_estudiante
  WHEN MATCHED AND (
      tgt.codigo_estudiante IS DISTINCT FROM src.codigo_estudiante
   OR tgt.edad_anios        IS DISTINCT FROM src.edad_anios
   OR tgt.grupo_etario      IS DISTINCT FROM src.grupo_etario
   OR tgt.sexo_codificado   IS DISTINCT FROM src.sexo_codificado
   OR tgt.facultad_o_area   IS DISTINCT FROM src.facultad_o_area
   OR tgt.carrera           IS DISTINCT FROM src.carrera
   OR tgt.ciclo_academico   IS DISTINCT FROM src.ciclo_academico
  ) THEN
   UPDATE SET codigo_estudiante = src.codigo_estudiante, edad_anios = src.edad_anios, grupo_etario = src.grupo_etario,
              sexo_codificado = src.sexo_codificado, facultad_o_area = src.facultad_o_area,
              carrera = src.carrera, ciclo_academico = src.ciclo_academico
  WHEN NOT MATCHED THEN
   INSERT (id_estudiante, codigo_estudiante, edad_anios, grupo_etario, sexo_codificado, facultad_o_area, carrera, ciclo_academico)
   VALUES (src.id_estudiante, src.codigo_estudiante, src.edad_anios, src.grupo_etario, src.sexo_codificado, src.facultad_o_area, src.carrera, src.ciclo_academico);

  -- 4.2 DimPrograma
  MERGE INTO dm.DimPrograma AS tgt
  USING pg_temp.src_programas AS src ON tgt.id_programa = src.id_programa
  WHEN MATCHED AND (
      tgt.codigo_programa   IS DISTINCT FROM src.codigo_programa
   OR tgt.nombre_programa   IS DISTINCT FROM src.nombre_programa
   OR tgt.periodo_academico IS DISTINCT FROM src.periodo_academico
   OR tgt.fecha_inicio      IS DISTINCT FROM src.fecha_inicio
   OR tgt.fecha_cierre      IS DISTINCT FROM src.fecha_cierre
   OR tgt.estado_programa   IS DISTINCT FROM src.estado_programa
  ) THEN
   UPDATE SET codigo_programa = src.codigo_programa, nombre_programa = src.nombre_programa,
              periodo_academico = src.periodo_academico, fecha_inicio = src.fecha_inicio,
              fecha_cierre = src.fecha_cierre, estado_programa = src.estado_programa
  WHEN NOT MATCHED THEN
   INSERT (id_programa, codigo_programa, nombre_programa, periodo_academico, fecha_inicio, fecha_cierre, estado_programa)
   VALUES (src.id_programa, src.codigo_programa, src.nombre_programa, src.periodo_academico, src.fecha_inicio, src.fecha_cierre, src.estado_programa);

  -- 4.3 DimPractica
  MERGE INTO dm.DimPractica AS tgt
  USING (
   SELECT id_practica, codigo_practica, nombre_practica,
          CASE WHEN es_mixto = 1 THEN 'Mixto' ELSE 'Unicomponente' END AS tipo_practica, es_mixto
     FROM pg_temp.src_cat_practicas
  ) AS src ON tgt.id_practica = src.id_practica
  WHEN MATCHED AND (
      tgt.codigo_practica IS DISTINCT FROM src.codigo_practica
   OR tgt.nombre_practica IS DISTINCT FROM src.nombre_practica
   OR tgt.tipo_practica   IS DISTINCT FROM src.tipo_practica
   OR tgt.es_mixto        IS DISTINCT FROM src.es_mixto
  ) THEN
   UPDATE SET codigo_practica = src.codigo_practica, nombre_practica = src.nombre_practica,
              tipo_practica = src.tipo_practica, es_mixto = src.es_mixto
  WHEN NOT MATCHED THEN
   INSERT (id_practica, codigo_practica, nombre_practica, tipo_practica, es_mixto)
   VALUES (src.id_practica, src.codigo_practica, src.nombre_practica, src.tipo_practica, src.es_mixto);

  -- 4.4 DimInstrumento
  MERGE INTO dm.DimInstrumento AS tgt
  USING (
   SELECT id_instrumento, codigo_instrumento, version_instrumento, nombre_instrumento,
          puntaje_minimo, puntaje_maximo,
          CASE WHEN codigo_instrumento = 'PSS-10' THEN 4.00 ELSE 10.00 END AS meta_reduccion_operativa,
          requiere_evento_indice
     FROM pg_temp.src_cat_instrumentos
  ) AS src ON tgt.id_instrumento = src.id_instrumento
  WHEN MATCHED AND (
      tgt.codigo_instrumento       IS DISTINCT FROM src.codigo_instrumento
   OR tgt.version_instrumento      IS DISTINCT FROM src.version_instrumento
   OR tgt.nombre_instrumento       IS DISTINCT FROM src.nombre_instrumento
   OR tgt.puntaje_minimo           IS DISTINCT FROM src.puntaje_minimo
   OR tgt.puntaje_maximo           IS DISTINCT FROM src.puntaje_maximo
   OR tgt.meta_reduccion_operativa IS DISTINCT FROM src.meta_reduccion_operativa
   OR tgt.requiere_evento_indice   IS DISTINCT FROM src.requiere_evento_indice
  ) THEN
   UPDATE SET codigo_instrumento = src.codigo_instrumento, version_instrumento = src.version_instrumento,
              nombre_instrumento = src.nombre_instrumento, puntaje_minimo = src.puntaje_minimo,
              puntaje_maximo = src.puntaje_maximo, meta_reduccion_operativa = src.meta_reduccion_operativa,
              requiere_evento_indice = src.requiere_evento_indice
  WHEN NOT MATCHED THEN
   INSERT (id_instrumento, codigo_instrumento, version_instrumento, nombre_instrumento,
           puntaje_minimo, puntaje_maximo, meta_reduccion_operativa, requiere_evento_indice)
   VALUES (src.id_instrumento, src.codigo_instrumento, src.version_instrumento, src.nombre_instrumento,
           src.puntaje_minimo, src.puntaje_maximo, src.meta_reduccion_operativa, src.requiere_evento_indice);

  -- 4.5 DimEventoIndice (preserva fila -1 'No aplica' para PSS-10)
  MERGE INTO dm.DimEventoIndice AS tgt
  USING (
   SELECT ei.id_evento_indice, ei.codigo_evento_local, cat.codigo_categoria, cat.nombre_categoria, ei.anio_ocurrencia_aprox
     FROM pg_temp.src_eventos_indice ei
     JOIN pg_temp.src_cat_categorias_evento_indice cat ON cat.id_categoria_evento = ei.id_categoria_evento
  ) AS src ON tgt.id_evento_indice = src.id_evento_indice
  WHEN MATCHED AND (
      tgt.codigo_evento_local   IS DISTINCT FROM src.codigo_evento_local
   OR tgt.codigo_categoria      IS DISTINCT FROM src.codigo_categoria
   OR tgt.nombre_categoria      IS DISTINCT FROM src.nombre_categoria
   OR tgt.anio_ocurrencia_aprox IS DISTINCT FROM src.anio_ocurrencia_aprox
  ) THEN
   UPDATE SET codigo_evento_local = src.codigo_evento_local, codigo_categoria = src.codigo_categoria,
              nombre_categoria = src.nombre_categoria, anio_ocurrencia_aprox = src.anio_ocurrencia_aprox
  WHEN NOT MATCHED THEN
   INSERT (id_evento_indice, codigo_evento_local, codigo_categoria, nombre_categoria, anio_ocurrencia_aprox, es_no_aplica)
   VALUES (src.id_evento_indice, src.codigo_evento_local, src.codigo_categoria, src.nombre_categoria, src.anio_ocurrencia_aprox, 0);

  -- ======================================================================
  -- 5. MERGE INCREMENTAL EN dm.HechoContinuidad (KPI-03 — REGLA D02)
  -- ======================================================================
  WITH BaseAsignaciones AS (
   SELECT a.id_asignacion, a.id_estudiante, a.id_programa, p.id_practica_principal, a.fecha_retiro,
          CASE WHEN a.fecha_retiro IS NOT NULL AND a.fecha_retiro <= v_fecha_corte THEN 1 ELSE 0 END AS es_retirado_al_corte,
          CASE WHEN a.fecha_retiro IS NOT NULL AND a.fecha_retiro <= v_fecha_corte THEN a.fecha_retiro ELSE v_fecha_corte END AS fecha_limite_exigibilidad
     FROM pg_temp.src_asignaciones a
     JOIN pg_temp.src_programas p ON p.id_programa = a.id_programa
    WHERE a.fecha_inscripcion <= v_fecha_corte
  ),
  PrimeraAsistencia AS (
   SELECT ba.id_asignacion, MIN(s.fecha_sesion) AS fecha_primera_asistencia
     FROM BaseAsignaciones ba
     JOIN pg_temp.src_sesiones s ON s.id_programa = ba.id_programa AND s.estado_sesion = 'REALIZADA' AND s.fecha_sesion <= ba.fecha_limite_exigibilidad
     JOIN pg_temp.src_asistencias asis ON asis.id_asignacion = ba.id_asignacion AND asis.id_sesion = s.id_sesion AND asis.estado_asistencia = 'ASISTIO'
    GROUP BY ba.id_asignacion
  ),
  SesionesExigiblesDetalle AS (
   SELECT ba.id_asignacion, s.id_sesion, s.fecha_sesion, s.numero_sesion, asis.estado_asistencia,
          COALESCE(asis.minutos_asistidos, 0) AS minutos_asistidos,
          ROW_NUMBER() OVER (PARTITION BY ba.id_asignacion ORDER BY s.fecha_sesion DESC, s.numero_sesion DESC) AS rn_reciente
     FROM BaseAsignaciones ba
     JOIN PrimeraAsistencia pa ON pa.id_asignacion = ba.id_asignacion
     JOIN pg_temp.src_sesiones s ON s.id_programa = ba.id_programa AND s.estado_sesion = 'REALIZADA'
                                AND s.fecha_sesion >= pa.fecha_primera_asistencia AND s.fecha_sesion <= ba.fecha_limite_exigibilidad
     LEFT JOIN pg_temp.src_asistencias asis ON asis.id_asignacion = ba.id_asignacion AND asis.id_sesion = s.id_sesion
  ),
  ResumenAsistencia AS (
   SELECT id_asignacion,
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
   SELECT ba.id_asignacion, ba.id_estudiante, ba.id_programa, ba.id_practica_principal,
          pa.fecha_primera_asistencia, ra.fecha_ultima_asistencia,
          COALESCE(ra.sesiones_exigibles, 0) AS sesiones_exigibles,
          COALESCE(ra.asistencias, 0) AS asistencias,
          COALESCE(ra.inasistencias, 0) AS inasistencias,
          COALESCE(ra.minutos_asistidos, 0) AS minutos_asistidos,
          CAST(CASE WHEN COALESCE(ra.sesiones_exigibles, 0) >= 3 THEN 1 ELSE 0 END AS SMALLINT) AS EsEvaluable,
          CASE
           WHEN ba.es_retirado_al_corte = 1 THEN 'RETIRADO'
           WHEN COALESCE(ra.sesiones_exigibles, 0) < 3 THEN 'NO_EVALUABLE'
           WHEN COALESCE(ra.asistio_ultima, 0) = 1 THEN 'ACTIVO'
           WHEN COALESCE(ra.asistio_ultimas_3, 0) = 1 THEN 'EN_RIESGO'
           ELSE 'ABANDONO'
          END AS codigo_estado
     FROM BaseAsignaciones ba
     LEFT JOIN PrimeraAsistencia pa ON pa.id_asignacion = ba.id_asignacion
     LEFT JOIN ResumenAsistencia ra ON ra.id_asignacion = ba.id_asignacion
  ),
  FuenteContinuidad AS (
   SELECT v_sk_tiempo_corte AS sk_tiempo_corte, de.sk_estudiante, dp.sk_programa, dpr.sk_practica, dec.sk_estado_continuidad,
          c.id_asignacion, c.EsEvaluable,
          CAST(CASE WHEN c.codigo_estado IN ('ACTIVO', 'EN_RIESGO') AND c.EsEvaluable = 1 THEN 1 ELSE 0 END AS SMALLINT) AS Continua,
          c.sesiones_exigibles AS SesionesExigibles, c.asistencias AS Asistencias,
          c.inasistencias AS Inasistencias, c.minutos_asistidos AS MinutosAsistidos,
          c.fecha_primera_asistencia, c.fecha_ultima_asistencia
     FROM Clasificado c
     JOIN dm.DimEstudiante        de  ON de.id_estudiante = c.id_estudiante
     JOIN dm.DimPrograma          dp  ON dp.id_programa   = c.id_programa
     JOIN dm.DimPractica          dpr ON dpr.id_practica  = c.id_practica_principal
     JOIN dm.DimEstadoContinuidad dec ON dec.codigo_estado = c.codigo_estado AND dec.EsEvaluable = c.EsEvaluable
  )
  MERGE INTO dm.HechoContinuidad AS tgt
  USING FuenteContinuidad AS src
     ON tgt.sk_tiempo_corte = v_sk_tiempo_corte
    AND tgt.sk_estudiante   = src.sk_estudiante
    AND tgt.sk_programa     = src.sk_programa
  WHEN MATCHED AND (
      tgt.sk_practica              IS DISTINCT FROM src.sk_practica
   OR tgt.sk_estado_continuidad    IS DISTINCT FROM src.sk_estado_continuidad
   OR tgt.id_asignacion            IS DISTINCT FROM src.id_asignacion
   OR tgt.EsEvaluable              IS DISTINCT FROM src.EsEvaluable
   OR tgt.Continua                 IS DISTINCT FROM src.Continua
   OR tgt.SesionesExigibles        IS DISTINCT FROM src.SesionesExigibles
   OR tgt.Asistencias              IS DISTINCT FROM src.Asistencias
   OR tgt.Inasistencias            IS DISTINCT FROM src.Inasistencias
   OR tgt.MinutosAsistidos         IS DISTINCT FROM src.MinutosAsistidos
   OR tgt.fecha_primera_asistencia IS DISTINCT FROM src.fecha_primera_asistencia
   OR tgt.fecha_ultima_asistencia  IS DISTINCT FROM src.fecha_ultima_asistencia
  ) THEN
   UPDATE SET
    sk_practica = src.sk_practica, sk_estado_continuidad = src.sk_estado_continuidad,
    id_asignacion = src.id_asignacion, EsEvaluable = src.EsEvaluable, Continua = src.Continua,
    SesionesExigibles = src.SesionesExigibles, Asistencias = src.Asistencias,
    Inasistencias = src.Inasistencias, MinutosAsistidos = src.MinutosAsistidos,
    fecha_primera_asistencia = src.fecha_primera_asistencia,
    fecha_ultima_asistencia = src.fecha_ultima_asistencia, id_ejecucion_etl = v_id_ejecucion_etl
  WHEN NOT MATCHED THEN
   INSERT (sk_tiempo_corte, sk_estudiante, sk_programa, sk_practica, sk_estado_continuidad,
           id_asignacion, EsEvaluable, Continua, SesionesExigibles, Asistencias, Inasistencias,
           MinutosAsistidos, fecha_primera_asistencia, fecha_ultima_asistencia, id_ejecucion_etl)
   VALUES (src.sk_tiempo_corte, src.sk_estudiante, src.sk_programa, src.sk_practica, src.sk_estado_continuidad,
           src.id_asignacion, src.EsEvaluable, src.Continua, src.SesionesExigibles, src.Asistencias, src.Inasistencias,
           src.MinutosAsistidos, src.fecha_primera_asistencia, src.fecha_ultima_asistencia, v_id_ejecucion_etl)
  WHEN NOT MATCHED BY SOURCE AND tgt.sk_tiempo_corte = v_sk_tiempo_corte THEN
   DELETE;

  SELECT COUNT(*) INTO v_filas_continuidad FROM dm.HechoContinuidad WHERE sk_tiempo_corte = v_sk_tiempo_corte;

  -- ======================================================================
  -- 6. MERGE INCREMENTAL EN dm.HechoCumplimientoEvaluaciones (KPI-04 — D01)
  --    Conserva regla D01 PostgreSQL: elegible desde fecha_prevista <= v_fecha_corte.
  -- ======================================================================
  WITH OportunidadesConDuplicado AS (
   SELECT r.id_oportunidad
     FROM pg_temp.src_resultados_evaluacion r
    WHERE r.es_vigente = 1 AND r.estado_validez = 'VALIDO' AND r.fecha_realizacion <= v_fecha_corte
    GROUP BY r.id_oportunidad HAVING COUNT(*) > 1
  ),
  ResultadoVigenteUnico AS (
   SELECT r.id_oportunidad, r.id_resultado, r.puntaje_total, r.numero_version, r.fecha_realizacion, r.en_ventana
     FROM pg_temp.src_resultados_evaluacion r
     JOIN pg_temp.src_oportunidades_evaluacion op ON op.id_oportunidad = r.id_oportunidad
     JOIN pg_temp.src_cat_instrumentos ci ON ci.id_instrumento = op.id_instrumento
    WHERE r.es_vigente = 1 AND r.estado_validez = 'VALIDO'
      AND r.fecha_realizacion IS NOT NULL AND r.puntaje_total IS NOT NULL
      AND r.fecha_realizacion <= v_fecha_corte
      AND r.puntaje_total BETWEEN ci.puntaje_minimo AND ci.puntaje_maximo
      AND NOT EXISTS (SELECT 1 FROM OportunidadesConDuplicado d WHERE d.id_oportunidad = r.id_oportunidad)
  ),
  BaseCumplimiento AS (
   SELECT op.id_oportunidad, op.id_estudiante, op.id_programa, p.id_practica_principal,
          op.id_instrumento, op.id_evento_indice, op.momento, op.fecha_ventana_fin, op.fecha_prevista,
          rv.id_resultado, rv.puntaje_total, rv.numero_version, rv.fecha_realizacion, rv.en_ventana,
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
      AND op.fecha_prevista IS NOT NULL
      AND op.fecha_ventana_inicio IS NOT NULL
      AND op.fecha_ventana_fin IS NOT NULL
      AND op.fecha_ventana_inicio <= v_fecha_corte
  ),
  FuenteCumplimiento AS (
   SELECT bc.id_oportunidad, v_sk_tiempo_corte AS sk_tiempo_corte,
          CAST(to_char(bc.fecha_prevista, 'YYYYMMDD') AS INT) AS sk_tiempo_previsto,
          CASE WHEN bc.fecha_realizacion IS NOT NULL THEN CAST(to_char(bc.fecha_realizacion, 'YYYYMMDD') AS INT) ELSE -1 END AS sk_tiempo_realizacion,
          de.sk_estudiante, dp.sk_programa, dpr.sk_practica, di.sk_instrumento,
          COALESCE(devt.sk_evento_indice, -1) AS sk_evento_indice,
          dmom.sk_momento, deval.sk_estado_evaluacion,
          CAST(1 AS SMALLINT) AS Oportunidad, bc.EsElegible, bc.EsCompletadaElegible,
          CAST(CASE WHEN bc.codigo_estado_eval = 'COMPLETADA_EN_VENTANA' THEN 1 ELSE 0 END AS SMALLINT) AS EsEnVentana,
          CAST(CASE WHEN bc.codigo_estado_eval = 'COMPLETADA_TARDIA' THEN 1 ELSE 0 END AS SMALLINT) AS EsTardia,
          CAST(CASE WHEN bc.codigo_estado_eval = 'PENDIENTE_EN_VENTANA' THEN 1 ELSE 0 END AS SMALLINT) AS EsPendiente,
          CAST(CASE WHEN bc.codigo_estado_eval = 'VENCIDA' THEN 1 ELSE 0 END AS SMALLINT) AS EsVencida,
          bc.puntaje_total AS PuntajeObtenido, bc.numero_version AS NumeroVersion, bc.id_resultado AS id_resultado_vigente
     FROM BaseCumplimiento bc
     JOIN dm.DimEstudiante        de    ON de.id_estudiante     = bc.id_estudiante
     JOIN dm.DimPrograma          dp    ON dp.id_programa       = bc.id_programa
     JOIN dm.DimPractica          dpr   ON dpr.id_practica      = bc.id_practica_principal
     JOIN dm.DimInstrumento       di    ON di.id_instrumento    = bc.id_instrumento
     LEFT JOIN dm.DimEventoIndice devt  ON devt.id_evento_indice = bc.id_evento_indice
     JOIN dm.DimMomento           dmom  ON dmom.codigo_momento  = bc.momento
     JOIN dm.DimEstadoEvaluacion  deval ON deval.codigo_estado  = bc.codigo_estado_eval
  )
  MERGE INTO dm.HechoCumplimientoEvaluaciones AS tgt
  USING FuenteCumplimiento AS src
     ON tgt.sk_tiempo_corte = v_sk_tiempo_corte
    AND tgt.id_oportunidad  = src.id_oportunidad
  WHEN MATCHED AND (
      tgt.sk_tiempo_previsto    IS DISTINCT FROM src.sk_tiempo_previsto
   OR tgt.sk_tiempo_realizacion IS DISTINCT FROM src.sk_tiempo_realizacion
   OR tgt.sk_estudiante         IS DISTINCT FROM src.sk_estudiante
   OR tgt.sk_programa           IS DISTINCT FROM src.sk_programa
   OR tgt.sk_practica           IS DISTINCT FROM src.sk_practica
   OR tgt.sk_instrumento        IS DISTINCT FROM src.sk_instrumento
   OR tgt.sk_evento_indice      IS DISTINCT FROM src.sk_evento_indice
   OR tgt.sk_momento            IS DISTINCT FROM src.sk_momento
   OR tgt.sk_estado_evaluacion  IS DISTINCT FROM src.sk_estado_evaluacion
   OR tgt.EsElegible            IS DISTINCT FROM src.EsElegible
   OR tgt.EsCompletadaElegible  IS DISTINCT FROM src.EsCompletadaElegible
   OR tgt.EsEnVentana           IS DISTINCT FROM src.EsEnVentana
   OR tgt.EsTardia              IS DISTINCT FROM src.EsTardia
   OR tgt.EsPendiente           IS DISTINCT FROM src.EsPendiente
   OR tgt.EsVencida             IS DISTINCT FROM src.EsVencida
   OR tgt.PuntajeObtenido       IS DISTINCT FROM src.PuntajeObtenido
   OR tgt.NumeroVersion         IS DISTINCT FROM src.NumeroVersion
   OR tgt.id_resultado_vigente  IS DISTINCT FROM src.id_resultado_vigente
  ) THEN
   UPDATE SET
    sk_tiempo_previsto = src.sk_tiempo_previsto, sk_tiempo_realizacion = src.sk_tiempo_realizacion,
    sk_estudiante = src.sk_estudiante, sk_programa = src.sk_programa, sk_practica = src.sk_practica,
    sk_instrumento = src.sk_instrumento, sk_evento_indice = src.sk_evento_indice,
    sk_momento = src.sk_momento, sk_estado_evaluacion = src.sk_estado_evaluacion,
    Oportunidad = src.Oportunidad, EsElegible = src.EsElegible, EsCompletadaElegible = src.EsCompletadaElegible,
    EsEnVentana = src.EsEnVentana, EsTardia = src.EsTardia, EsPendiente = src.EsPendiente, EsVencida = src.EsVencida,
    PuntajeObtenido = src.PuntajeObtenido, NumeroVersion = src.NumeroVersion,
    id_resultado_vigente = src.id_resultado_vigente, id_ejecucion_etl = v_id_ejecucion_etl
  WHEN NOT MATCHED THEN
   INSERT (id_oportunidad, sk_tiempo_corte, sk_tiempo_previsto, sk_tiempo_realizacion,
           sk_estudiante, sk_programa, sk_practica, sk_instrumento, sk_evento_indice,
           sk_momento, sk_estado_evaluacion, Oportunidad, EsElegible, EsCompletadaElegible,
           EsEnVentana, EsTardia, EsPendiente, EsVencida, PuntajeObtenido, NumeroVersion,
           id_resultado_vigente, id_ejecucion_etl)
   VALUES (src.id_oportunidad, src.sk_tiempo_corte, src.sk_tiempo_previsto, src.sk_tiempo_realizacion,
           src.sk_estudiante, src.sk_programa, src.sk_practica, src.sk_instrumento, src.sk_evento_indice,
           src.sk_momento, src.sk_estado_evaluacion, src.Oportunidad, src.EsElegible, src.EsCompletadaElegible,
           src.EsEnVentana, src.EsTardia, src.EsPendiente, src.EsVencida, src.PuntajeObtenido, src.NumeroVersion,
           src.id_resultado_vigente, v_id_ejecucion_etl)
  WHEN NOT MATCHED BY SOURCE AND tgt.sk_tiempo_corte = v_sk_tiempo_corte THEN
   DELETE;

  SELECT COUNT(*) INTO v_filas_cumplimiento FROM dm.HechoCumplimientoEvaluaciones WHERE sk_tiempo_corte = v_sk_tiempo_corte;

  -- ======================================================================
  -- 7. MERGE INCREMENTAL EN dm.HechoResultadosEvaluacion (KPI-01, 02, 05)
  -- ======================================================================
  WITH OportunidadesConDuplicado AS (
   SELECT r.id_oportunidad
     FROM pg_temp.src_resultados_evaluacion r
    WHERE r.es_vigente = 1 AND r.estado_validez = 'VALIDO' AND r.fecha_realizacion <= v_fecha_corte
    GROUP BY r.id_oportunidad HAVING COUNT(*) > 1
  ),
  ResultadosEnVentanaValidos AS (
   SELECT op.id_oportunidad, op.id_asignacion, op.id_estudiante, op.id_programa,
          op.id_instrumento, op.codigo_instrumento, op.id_version_instrumento,
          op.id_evento_indice, op.momento, r.id_resultado, r.puntaje_total, r.fecha_realizacion
     FROM pg_temp.src_oportunidades_evaluacion op
     JOIN pg_temp.src_resultados_evaluacion r ON r.id_oportunidad = op.id_oportunidad
     JOIN pg_temp.src_cat_instrumentos ci ON ci.id_instrumento = op.id_instrumento
     LEFT JOIN pg_temp.src_eventos_indice ei ON ei.id_evento_indice = op.id_evento_indice
    WHERE op.aplicable = 1 AND r.es_vigente = 1 AND r.estado_validez = 'VALIDO' AND r.en_ventana = 1
      AND r.fecha_realizacion IS NOT NULL AND r.puntaje_total IS NOT NULL
      AND r.fecha_realizacion <= v_fecha_corte
      AND r.fecha_realizacion BETWEEN op.fecha_ventana_inicio AND op.fecha_ventana_fin
      AND r.puntaje_total BETWEEN ci.puntaje_minimo AND ci.puntaje_maximo
      AND (op.id_evento_indice IS NULL OR ei.id_estudiante = op.id_estudiante)
      AND NOT EXISTS (SELECT 1 FROM OportunidadesConDuplicado d WHERE d.id_oportunidad = op.id_oportunidad)
  ),
  ParesValidos AS (
   SELECT ini.id_asignacion, ini.id_estudiante, ini.id_programa, p.id_practica_principal,
          ini.id_instrumento, ini.codigo_instrumento, ini.id_version_instrumento, ini.id_evento_indice,
          ini.id_resultado AS id_resultado_inicial, fin.id_resultado AS id_resultado_final,
          fin.fecha_realizacion AS fecha_realizacion_final,
          ini.puntaje_total AS SumaInicial, fin.puntaje_total AS SumaFinal,
          CAST(ini.puntaje_total - fin.puntaje_total AS SMALLINT) AS PuntosReduccion
     FROM ResultadosEnVentanaValidos ini
     JOIN ResultadosEnVentanaValidos fin
       ON fin.id_asignacion = ini.id_asignacion AND fin.id_estudiante = ini.id_estudiante
      AND fin.id_programa = ini.id_programa AND fin.id_instrumento = ini.id_instrumento
      AND fin.momento = 'FINAL'
      AND COALESCE(fin.id_version_instrumento, -1) = COALESCE(ini.id_version_instrumento, -1)
      AND ((ini.codigo_instrumento = 'PSS-10' AND ini.id_evento_indice IS NULL AND fin.id_evento_indice IS NULL)
        OR (ini.codigo_instrumento = 'PCL-5' AND ini.id_evento_indice IS NOT NULL AND ini.id_evento_indice = fin.id_evento_indice))
      AND fin.fecha_realizacion >= ini.fecha_realizacion
     JOIN pg_temp.src_programas p ON p.id_programa = ini.id_programa
    WHERE ini.momento = 'INICIAL'
  ),
  FuenteResultados AS (
   SELECT v_sk_tiempo_corte AS sk_tiempo_corte,
          CAST(to_char(pv.fecha_realizacion_final, 'YYYYMMDD') AS INT) AS sk_tiempo_final,
          de.sk_estudiante, dp.sk_programa, dpr.sk_practica, di.sk_instrumento,
          COALESCE(devt.sk_evento_indice, -1) AS sk_evento_indice,
          pv.id_asignacion, pv.id_resultado_inicial, pv.id_resultado_final, pv.id_version_instrumento,
          CAST(1 AS SMALLINT) AS ParesValidos, pv.SumaInicial, pv.SumaFinal, pv.PuntosReduccion,
          CAST(CASE WHEN pv.PuntosReduccion > 0 THEN 1 ELSE 0 END AS SMALLINT) AS EsReduccion,
          CAST(CASE WHEN pv.PuntosReduccion = 0 THEN 1 ELSE 0 END AS SMALLINT) AS EsSinCambio,
          CAST(CASE WHEN pv.PuntosReduccion < 0 THEN 1 ELSE 0 END AS SMALLINT) AS EsIncremento,
          CAST(CASE WHEN pv.PuntosReduccion >= di.meta_reduccion_operativa THEN 1 ELSE 0 END AS SMALLINT) AS CumpleMetaIndividual
     FROM ParesValidos pv
     JOIN dm.DimEstudiante        de   ON de.id_estudiante     = pv.id_estudiante
     JOIN dm.DimPrograma          dp   ON dp.id_programa       = pv.id_programa
     JOIN dm.DimPractica          dpr  ON dpr.id_practica      = pv.id_practica_principal
     JOIN dm.DimInstrumento       di   ON di.id_instrumento    = pv.id_instrumento
     LEFT JOIN dm.DimEventoIndice devt ON devt.id_evento_indice = pv.id_evento_indice
  )
  MERGE INTO dm.HechoResultadosEvaluacion AS tgt
  USING FuenteResultados AS src
     ON tgt.sk_tiempo_corte  = v_sk_tiempo_corte
    AND tgt.sk_estudiante    = src.sk_estudiante
    AND tgt.sk_programa      = src.sk_programa
    AND tgt.sk_instrumento   = src.sk_instrumento
    AND tgt.sk_evento_indice = src.sk_evento_indice
  WHEN MATCHED AND (
      tgt.sk_tiempo_final        IS DISTINCT FROM src.sk_tiempo_final
   OR tgt.sk_practica            IS DISTINCT FROM src.sk_practica
   OR tgt.id_asignacion          IS DISTINCT FROM src.id_asignacion
   OR tgt.id_resultado_inicial   IS DISTINCT FROM src.id_resultado_inicial
   OR tgt.id_resultado_final     IS DISTINCT FROM src.id_resultado_final
   OR tgt.id_version_instrumento IS DISTINCT FROM src.id_version_instrumento
   OR tgt.SumaInicial            IS DISTINCT FROM src.SumaInicial
   OR tgt.SumaFinal              IS DISTINCT FROM src.SumaFinal
   OR tgt.PuntosReduccion        IS DISTINCT FROM src.PuntosReduccion
   OR tgt.EsReduccion            IS DISTINCT FROM src.EsReduccion
   OR tgt.EsSinCambio            IS DISTINCT FROM src.EsSinCambio
   OR tgt.EsIncremento           IS DISTINCT FROM src.EsIncremento
   OR tgt.CumpleMetaIndividual   IS DISTINCT FROM src.CumpleMetaIndividual
  ) THEN
   UPDATE SET
    sk_tiempo_final = src.sk_tiempo_final, sk_practica = src.sk_practica,
    id_asignacion = src.id_asignacion, id_resultado_inicial = src.id_resultado_inicial,
    id_resultado_final = src.id_resultado_final, id_version_instrumento = src.id_version_instrumento,
    ParesValidos = src.ParesValidos, SumaInicial = src.SumaInicial, SumaFinal = src.SumaFinal,
    PuntosReduccion = src.PuntosReduccion, EsReduccion = src.EsReduccion,
    EsSinCambio = src.EsSinCambio, EsIncremento = src.EsIncremento,
    CumpleMetaIndividual = src.CumpleMetaIndividual, id_ejecucion_etl = v_id_ejecucion_etl
  WHEN NOT MATCHED THEN
   INSERT (sk_tiempo_corte, sk_tiempo_final, sk_estudiante, sk_programa, sk_practica,
           sk_instrumento, sk_evento_indice, id_asignacion, id_resultado_inicial, id_resultado_final,
           id_version_instrumento, ParesValidos, SumaInicial, SumaFinal, PuntosReduccion,
           EsReduccion, EsSinCambio, EsIncremento, CumpleMetaIndividual, id_ejecucion_etl)
   VALUES (src.sk_tiempo_corte, src.sk_tiempo_final, src.sk_estudiante, src.sk_programa, src.sk_practica,
           src.sk_instrumento, src.sk_evento_indice, src.id_asignacion, src.id_resultado_inicial, src.id_resultado_final,
           src.id_version_instrumento, src.ParesValidos, src.SumaInicial, src.SumaFinal, src.PuntosReduccion,
           src.EsReduccion, src.EsSinCambio, src.EsIncremento, src.CumpleMetaIndividual, v_id_ejecucion_etl)
  WHEN NOT MATCHED BY SOURCE AND tgt.sk_tiempo_corte = v_sk_tiempo_corte THEN
   DELETE;

  SELECT COUNT(*) INTO v_filas_resultados FROM dm.HechoResultadosEvaluacion WHERE sk_tiempo_corte = v_sk_tiempo_corte;

  UPDATE dm.etl_log_ejecuciones
     SET fin_ejecucion = clock_timestamp(),
         estado = 'EXITOSO',
         filas_continuidad = v_filas_continuidad,
         filas_cumplimiento = v_filas_cumplimiento,
         filas_resultados = v_filas_resultados,
         incidencias_detectadas = v_incidencias,
         mensaje = CONCAT('Carga incremental exitosa al corte ', to_char(v_fecha_corte, 'YYYY-MM-DD'),
                          '. Cont=', v_filas_continuidad, ', Cump=', v_filas_cumplimiento,
                          ', Res=', v_filas_resultados, ', Inc=', v_incidencias)
   WHERE id_ejecucion_etl = v_id_ejecucion_etl;

 EXCEPTION WHEN OTHERS THEN
  INSERT INTO dm.etl_incidencias_calidad (
   id_ejecucion_etl, fecha_corte, regla_codigo, severidad,
   entidad_origen, id_registro_origen, detalle
  ) VALUES (
   v_id_ejecucion_etl, v_fecha_corte, 'ERROR_EJECUCION_ETL', 'ERROR',
   'dm.ejecutar_etl', NULL, left(SQLERRM, 500)
  );
  UPDATE dm.etl_log_ejecuciones
     SET fin_ejecucion = clock_timestamp(),
         estado = 'ERROR',
         incidencias_detectadas = v_incidencias + 1,
         mensaje = left(SQLERRM, 500)
   WHERE id_ejecucion_etl = v_id_ejecucion_etl;
 END;

 RETURN v_id_ejecucion_etl;
END;
$$;
