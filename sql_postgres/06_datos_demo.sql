-- Datos SINTÉTICOS reproducibles. Se rehúsa poblar un OLTP con estudiantes existentes.
BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM dbo.estudiantes) THEN RAISE EXCEPTION 'El OLTP ya tiene datos; seed no sobrescribe datos.'; END IF; END $$;
INSERT INTO dbo.estudiantes(codigo_estudiante,nombres,apellidos,correo_institucional,edad_anios,sexo_codificado,facultad_o_area,carrera,ciclo_academico)
SELECT 'UNT26-EST-'||lpad(n::text,4,'0'),'Estudiante '||n,'Sintético','demo'||n||'@example.invalid',18+n%12,CASE WHEN n%2=0 THEN 'F' ELSE 'M' END,'Facultad '||(1+n%4),'Carrera '||(1+n%8),1+n%10 FROM generate_series(1,1000) n;
INSERT INTO dbo.programas(codigo_programa,nombre_programa,periodo_academico,id_practica_principal,fecha_inicio,fecha_cierre,ventana_inicial_inicio,ventana_inicial_fin,ventana_final_inicio,ventana_final_fin,estado_programa)
SELECT 'DEMO-'||n,'Programa sintético '||n,'2026-II',1+(n-1)%5,'2026-08-01','2026-11-23','2026-08-01','2026-08-15','2026-11-01','2026-11-23','FINALIZADO' FROM generate_series(1,10) n;
INSERT INTO dbo.sesiones(id_programa,numero_sesion,id_practica_tecnica,modalidad,duracion_programada_min,fecha_sesion,fecha_hora_inicio,estado_sesion)
SELECT p.id_programa,n,CASE WHEN p.id_practica_principal=5 THEN 1+(n-1)%4 ELSE p.id_practica_principal END,'PRESENCIAL',60,DATE '2026-08-15'+n*7,(DATE '2026-08-15'+n*7)+TIME '09:00','REALIZADA' FROM dbo.programas p CROSS JOIN generate_series(1,10) n;
INSERT INTO dbo.asignaciones(id_estudiante,id_programa,fecha_inscripcion,estado_asignacion)
SELECT e.id_estudiante,p.id_programa,'2026-08-01','ACTIVO' FROM dbo.estudiantes e JOIN dbo.programas p ON p.id_programa=1+(e.id_estudiante-1)%10 OR p.id_programa=1+e.id_estudiante%10;
INSERT INTO dbo.asistencias(id_programa,id_asignacion,id_sesion,estado_asistencia,minutos_asistidos)
SELECT a.id_programa,a.id_asignacion,s.id_sesion,CASE WHEN s.numero_sesion=1 OR (a.id_estudiante+s.numero_sesion)%7<>0 THEN 'ASISTIO' ELSE 'INASISTENCIA' END,CASE WHEN s.numero_sesion=1 OR (a.id_estudiante+s.numero_sesion)%7<>0 THEN 60 ELSE 0 END FROM dbo.asignaciones a JOIN dbo.sesiones s USING(id_programa);
INSERT INTO dbo.eventos_indice(id_estudiante,id_categoria_evento,codigo_evento_local,anio_ocurrencia_aprox)
SELECT id_estudiante,1+(id_estudiante%6),'EVT-01',2025 FROM dbo.estudiantes WHERE id_estudiante%3=0;
INSERT INTO dbo.oportunidades_evaluacion(id_asignacion,id_estudiante,id_programa,id_instrumento,codigo_instrumento,id_evento_indice,momento,fecha_ventana_inicio,fecha_ventana_fin,fecha_prevista,id_version_instrumento)
SELECT a.id_asignacion,a.id_estudiante,a.id_programa,i.id_instrumento,i.codigo_instrumento,CASE WHEN i.codigo_instrumento='PCL-5' THEN ev.id_evento_indice END,m.momento,m.inicio,m.fin,m.prevista,v.id_version_instrumento
FROM dbo.asignaciones a CROSS JOIN dbo.cat_instrumentos i
JOIN dbo.instrumento_versiones v ON v.id_instrumento=i.id_instrumento AND v.estado_contenido='PUBLICADO'
LEFT JOIN dbo.eventos_indice ev ON ev.id_estudiante=a.id_estudiante
CROSS JOIN (VALUES('INICIAL',DATE '2026-08-01',DATE '2026-08-15',DATE '2026-08-15'),('FINAL',DATE '2026-11-01',DATE '2026-11-23',DATE '2026-11-01')) m(momento,inicio,fin,prevista)
WHERE i.codigo_instrumento='PSS-10' OR ev.id_evento_indice IS NOT NULL;
-- Score and individual answers derive from the SAME deterministic formula.
INSERT INTO dbo.resultados_evaluacion(id_oportunidad,codigo_instrumento,puntaje_total,fecha_realizacion,en_ventana)
SELECT op.id_oportunidad,op.codigo_instrumento,sum(CASE WHEN op.momento='INICIAL' THEN 2+(op.id_estudiante+it.numero_item)%2 ELSE 1+(op.id_estudiante+it.numero_item)%2 END),CASE WHEN op.momento='INICIAL' THEN DATE '2026-08-10' ELSE DATE '2026-11-05' END,1
FROM dbo.oportunidades_evaluacion op JOIN dbo.instrumento_items it USING(id_version_instrumento) GROUP BY op.id_oportunidad;
INSERT INTO dbo.respuestas_evaluacion(id_resultado,id_version_instrumento,id_item,valor_respuesta,valor_puntuado)
SELECT r.id_resultado,op.id_version_instrumento,it.id_item,CASE WHEN it.puntuacion_inversa=1 THEN 4-v.score ELSE v.score END,v.score
FROM dbo.resultados_evaluacion r JOIN dbo.oportunidades_evaluacion op USING(id_oportunidad) JOIN dbo.instrumento_items it USING(id_version_instrumento)
CROSS JOIN LATERAL(SELECT (CASE WHEN op.momento='INICIAL' THEN 2 ELSE 1 END)+(op.id_estudiante+it.numero_item)%2 AS score) v;
COMMIT;
