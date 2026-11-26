-- Ejecutar como propietario de la restauración en mmet_bi_oltp.
-- Crear el usuario de conexión por separado con CREATE ROLE y \password.
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'mmet_bi_oltp' THEN
    RAISE EXCEPTION 'Este script requiere mmet_bi_oltp';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mmet_oltp_app') THEN
    CREATE ROLE mmet_oltp_app NOLOGIN;
  END IF;
END $$;

GRANT CONNECT ON DATABASE mmet_bi_oltp TO mmet_oltp_app;
GRANT USAGE ON SCHEMA dbo TO mmet_oltp_app;
GRANT SELECT ON dbo.cat_practicas, dbo.cat_instrumentos, dbo.cat_categorias_evento_indice,
  dbo.estudiantes, dbo.programas, dbo.sesiones, dbo.asignaciones, dbo.asistencias,
  dbo.eventos_indice, dbo.oportunidades_evaluacion, dbo.resultados_evaluacion,
  dbo.instrumento_versiones, dbo.instrumento_items, dbo.instrumento_opciones_respuesta,
  dbo.usuarios_sistema, dbo.sesiones_autenticacion, dbo.respuestas_borrador,
  dbo.respuestas_evaluacion TO mmet_oltp_app;
GRANT INSERT ON dbo.estudiantes, dbo.sesiones, dbo.asignaciones, dbo.asistencias,
  dbo.eventos_indice, dbo.oportunidades_evaluacion, dbo.resultados_evaluacion,
  dbo.usuarios_sistema, dbo.sesiones_autenticacion, dbo.respuestas_borrador,
  dbo.respuestas_evaluacion, dbo.historial_estados_asignacion,
  dbo.historial_estados_sesion, dbo.historial_asistencias TO mmet_oltp_app;
GRANT UPDATE ON dbo.asignaciones, dbo.asistencias, dbo.oportunidades_evaluacion,
  dbo.resultados_evaluacion, dbo.sesiones_autenticacion, dbo.respuestas_borrador TO mmet_oltp_app;
GRANT DELETE ON dbo.respuestas_borrador TO mmet_oltp_app;
COMMIT;
