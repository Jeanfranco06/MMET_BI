-- Ejecutar como propietario de la restauración en mmet_bi_dm.
-- El mismo pool del Data Mart atiende las consultas y la ruta de ETL del backend.
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'mmet_bi_dm' THEN
    RAISE EXCEPTION 'Este script requiere mmet_bi_dm';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mmet_dm_app') THEN
    CREATE ROLE mmet_dm_app NOLOGIN;
  END IF;
END $$;

GRANT CONNECT, TEMPORARY ON DATABASE mmet_bi_dm TO mmet_dm_app;
GRANT USAGE ON SCHEMA dm TO mmet_dm_app;
GRANT SELECT ON dm.DimTiempo, dm.DimEstudiante, dm.DimPrograma, dm.DimPractica,
  dm.DimInstrumento, dm.DimEventoIndice, dm.DimEstadoContinuidad, dm.DimMomento,
  dm.DimEstadoEvaluacion, dm.HechoContinuidad, dm.HechoCumplimientoEvaluaciones,
  dm.HechoResultadosEvaluacion, dm.vw_HechoEfectividadPractica,
  dm.etl_log_ejecuciones, dm.etl_incidencias_calidad TO mmet_dm_app;
GRANT INSERT, UPDATE ON dm.DimEstudiante, dm.DimPrograma, dm.DimPractica,
  dm.DimInstrumento, dm.DimEventoIndice, dm.etl_log_ejecuciones TO mmet_dm_app;
GRANT INSERT ON dm.etl_incidencias_calidad TO mmet_dm_app;
GRANT INSERT, DELETE ON dm.HechoContinuidad, dm.HechoCumplimientoEvaluaciones,
  dm.HechoResultadosEvaluacion TO mmet_dm_app;
REVOKE EXECUTE ON FUNCTION dm.ejecutar_etl(date,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dm.ejecutar_etl(date,jsonb) TO mmet_dm_app;
COMMIT;
