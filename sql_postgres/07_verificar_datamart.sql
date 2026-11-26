-- PostgreSQL 17. Ejecutar en mmet_bi_dm. Solo lectura; falla ante inconsistencias de índices, grano o reglas BI.
DO $$
DECLARE
 v_missing_idx INT;
BEGIN
 -- 1. Verificación de los 13 índices de rendimiento en esquema dm
 SELECT COUNT(*) INTO v_missing_idx
   FROM (VALUES
    ('hechocontinuidad',              'ix_hcont_corte_practica'),
    ('hechocontinuidad',              'ix_hcont_corte_programa'),
    ('hechocontinuidad',              'ix_hcont_corte_estudiante'),
    ('hechocumplimientoevaluaciones', 'ix_hcump_corte_instr_estado'),
    ('hechocumplimientoevaluaciones', 'ix_hcump_corte_programa_est'),
    ('hechoresultadosevaluacion',     'ix_hres_corte_practica_instr'),
    ('hechoresultadosevaluacion',     'ix_hres_corte_instr_prog'),
    ('dimestudiante',                 'ix_dim_est_facultad_grupo'),
    ('dimprograma',                   'ix_dim_prog_periodo'),
    ('dimeventoindice',               'ix_dim_evt_categoria'),
    ('etl_log_ejecuciones',           'ix_etl_log_corte_estado'),
    ('etl_incidencias_calidad',       'ix_etl_inc_ejecucion_regla'),
    ('etl_incidencias_calidad',       'ix_etl_inc_corte_regla')
   ) AS req(tabla, idx)
  WHERE NOT EXISTS (
   SELECT 1 FROM pg_indexes p
    WHERE p.schemaname = 'dm'
      AND lower(p.tablename) = req.tabla
      AND lower(p.indexname) = req.idx
  );

 IF v_missing_idx > 0 THEN
  RAISE EXCEPTION 'Faltan % índices de rendimiento requeridos en esquema dm.', v_missing_idx;
 END IF;

 -- 2. Verificación de grano sin duplicados
 IF EXISTS (SELECT 1 FROM dm.HechoContinuidad GROUP BY sk_estudiante, sk_programa, sk_tiempo_corte HAVING COUNT(*) > 1) THEN
  RAISE EXCEPTION 'Duplicado de grano en dm.HechoContinuidad.';
 END IF;
 IF EXISTS (SELECT 1 FROM dm.HechoCumplimientoEvaluaciones GROUP BY id_oportunidad, sk_tiempo_corte HAVING COUNT(*) > 1) THEN
  RAISE EXCEPTION 'Duplicado de grano en dm.HechoCumplimientoEvaluaciones.';
 END IF;
 IF EXISTS (SELECT 1 FROM dm.HechoResultadosEvaluacion GROUP BY sk_estudiante, sk_programa, sk_instrumento, sk_evento_indice, sk_tiempo_corte HAVING COUNT(*) > 1) THEN
  RAISE EXCEPTION 'Duplicado de grano en dm.HechoResultadosEvaluacion.';
 END IF;

 -- 3. Verificación de consistencia clínica (PSS-10 vs PCL-5 y medidas)
 IF EXISTS (
  SELECT 1 FROM dm.HechoResultadosEvaluacion
   WHERE ParesValidos <> 1 OR PuntosReduccion <> (SumaInicial - SumaFinal)
      OR (EsReduccion + EsSinCambio + EsIncremento) <> 1
 ) THEN
  RAISE EXCEPTION 'Inconsistencia en medidas de pares en dm.HechoResultadosEvaluacion.';
 END IF;

 IF EXISTS (
  SELECT 1
    FROM dm.HechoResultadosEvaluacion hr
    JOIN dm.DimInstrumento di ON di.sk_instrumento = hr.sk_instrumento
    JOIN dm.DimEventoIndice ev ON ev.sk_evento_indice = hr.sk_evento_indice
   WHERE (di.codigo_instrumento = 'PSS-10' AND ev.es_no_aplica <> 1)
      OR (di.codigo_instrumento = 'PCL-5' AND ev.es_no_aplica = 1)
 ) THEN
  RAISE EXCEPTION 'Violación de calidad: asociación incorrecta de DimEventoIndice por instrumento.';
 END IF;
END $$;

SELECT t.fecha, COUNT(*) AS pares, ROUND(SUM(h.PuntosReduccion)::numeric / NULLIF(COUNT(*), 0), 2) AS reduccion
  FROM dm.HechoResultadosEvaluacion h
  JOIN dm.DimTiempo t ON t.sk_tiempo = h.sk_tiempo_corte
 GROUP BY t.fecha
 ORDER BY t.fecha;

SELECT estado, COUNT(*) AS ejecuciones
  FROM dm.etl_log_ejecuciones
 GROUP BY estado;

SELECT *
  FROM dm.vw_HechoEfectividadPractica
 WHERE facultad_o_area = 'TODAS'
 ORDER BY sk_tiempo_corte, codigo_instrumento, codigo_practica;
