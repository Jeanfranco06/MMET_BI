-- PostgreSQL 17: integridad operativa y auditoría. Ejecutar en mmet_bi_oltp.
BEGIN;
CREATE OR REPLACE FUNCTION dbo.validar_sesion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM dbo.cat_practicas WHERE id_practica=NEW.id_practica_tecnica AND es_mixto=1) THEN RAISE EXCEPTION 'Una sesión requiere una técnica concreta, no MIXTO.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_sesion BEFORE INSERT OR UPDATE ON dbo.sesiones FOR EACH ROW EXECUTE FUNCTION dbo.validar_sesion();
CREATE OR REPLACE FUNCTION dbo.validar_asistencia() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM dbo.sesiones WHERE id_sesion=NEW.id_sesion AND estado_sesion<>'REALIZADA') AND NEW.estado_asistencia IN ('ASISTIO','INASISTENCIA') THEN RAISE EXCEPTION 'Solo una sesión realizada admite asistencias o inasistencias.'; END IF;
 IF TG_OP='UPDATE' THEN NEW.registrado_en:=OLD.registrado_en; NEW.actualizado_en:=clock_timestamp(); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_asistencia BEFORE INSERT OR UPDATE ON dbo.asistencias FOR EACH ROW EXECUTE FUNCTION dbo.validar_asistencia();
CREATE OR REPLACE FUNCTION dbo.auditar_asistencia() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
 INSERT INTO dbo.historial_asistencias(id_asistencia,id_programa,id_asignacion,id_sesion,tipo_operacion,estado_anterior,minutos_anteriores,fecha_registro_original)
 VALUES(OLD.id_asistencia,OLD.id_programa,OLD.id_asignacion,OLD.id_sesion,TG_OP,OLD.estado_asistencia,OLD.minutos_asistidos,OLD.registrado_en);
 RETURN OLD;
 END IF;
 INSERT INTO dbo.historial_asistencias(id_asistencia,id_programa,id_asignacion,id_sesion,tipo_operacion,estado_anterior,estado_nuevo,minutos_anteriores,minutos_nuevos,fecha_registro_original)
 VALUES(NEW.id_asistencia,NEW.id_programa,NEW.id_asignacion,NEW.id_sesion,TG_OP,CASE WHEN TG_OP='UPDATE' THEN OLD.estado_asistencia END,NEW.estado_asistencia,CASE WHEN TG_OP='UPDATE' THEN OLD.minutos_asistidos END,NEW.minutos_asistidos,NEW.registrado_en);
 RETURN NEW;
END $$;
CREATE TRIGGER auditar_asistencia AFTER INSERT OR UPDATE OR DELETE ON dbo.asistencias FOR EACH ROW EXECUTE FUNCTION dbo.auditar_asistencia();
CREATE OR REPLACE FUNCTION dbo.validar_resultado() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op dbo.oportunidades_evaluacion;
BEGIN
 SELECT * INTO STRICT op FROM dbo.oportunidades_evaluacion WHERE id_oportunidad=NEW.id_oportunidad;
 IF op.aplicable<>1 THEN RAISE EXCEPTION 'Oportunidad no aplicable.'; END IF;
 IF NEW.en_ventana<>(CASE WHEN NEW.fecha_realizacion BETWEEN op.fecha_ventana_inicio AND op.fecha_ventana_fin THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'en_ventana no coincide con las fechas.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_resultado BEFORE INSERT OR UPDATE ON dbo.resultados_evaluacion FOR EACH ROW EXECUTE FUNCTION dbo.validar_resultado();
CREATE OR REPLACE FUNCTION dbo.proteger_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.estado_contenido='PUBLICADO' THEN RAISE EXCEPTION 'La versión publicada es inmutable; cree otra versión.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER proteger_version BEFORE UPDATE OR DELETE ON dbo.instrumento_versiones FOR EACH ROW EXECUTE FUNCTION dbo.proteger_version();
CREATE OR REPLACE FUNCTION dbo.proteger_contenido() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM dbo.instrumento_versiones WHERE id_version_instrumento=OLD.id_version_instrumento AND estado_contenido='PUBLICADO') THEN RAISE EXCEPTION 'Contenido publicado inmutable.'; END IF;
 IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM dbo.instrumento_versiones WHERE id_version_instrumento=NEW.id_version_instrumento AND estado_contenido='PUBLICADO') THEN RAISE EXCEPTION 'Contenido publicado inmutable.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER proteger_items BEFORE INSERT OR UPDATE OR DELETE ON dbo.instrumento_items FOR EACH ROW EXECUTE FUNCTION dbo.proteger_contenido();
CREATE TRIGGER proteger_opciones BEFORE INSERT OR UPDATE OR DELETE ON dbo.instrumento_opciones_respuesta FOR EACH ROW EXECUTE FUNCTION dbo.proteger_contenido();
COMMIT;

