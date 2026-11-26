-- Ejecutar en mmet_bi_dm. Solo lectura; falla ante pares inconsistentes.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM dm.HechoResultadosEvaluacion WHERE ParesValidos<>1 OR PuntosReduccion<>SumaInicial-SumaFinal) THEN RAISE EXCEPTION 'Inconsistencia en medidas de pares'; END IF;
END $$;
SELECT t.fecha,COUNT(*) AS pares,sum(h.PuntosReduccion)::numeric/NULLIF(count(*),0) AS reduccion FROM dm.HechoResultadosEvaluacion h JOIN dm.DimTiempo t ON t.sk_tiempo=h.sk_tiempo_corte GROUP BY t.fecha ORDER BY t.fecha;
SELECT estado,COUNT(*) AS ejecuciones FROM dm.etl_log_ejecuciones GROUP BY estado;
SELECT * FROM dm.vw_HechoEfectividadPractica ORDER BY sk_tiempo_corte,sk_practica,sk_instrumento;
