-- Ejecutar en mmet_bi_oltp. Las restricciones validan filas e integridad referencial.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM dbo.respuestas_evaluacion re JOIN dbo.resultados_evaluacion r USING(id_resultado) GROUP BY r.id_resultado HAVING sum(re.valor_puntuado)<>max(r.puntaje_total)) THEN RAISE EXCEPTION 'Puntuaciones no coinciden con respuestas'; END IF;
END $$;
SELECT 'estudiantes' AS tabla,count(*) FROM dbo.estudiantes UNION ALL SELECT 'asistencias',count(*) FROM dbo.asistencias UNION ALL SELECT 'resultados',count(*) FROM dbo.resultados_evaluacion;
