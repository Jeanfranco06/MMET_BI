/* Verificaciones de integridad de versiones y respuestas de cuestionario. */
SET NOCOUNT ON;
USE MMET_BI_OLTP;
GO

IF OBJECT_ID(N'dbo.instrumento_versiones',N'U') IS NULL
 OR OBJECT_ID(N'dbo.instrumento_items',N'U') IS NULL
 OR OBJECT_ID(N'dbo.instrumento_opciones_respuesta',N'U') IS NULL
 OR OBJECT_ID(N'dbo.respuestas_borrador',N'U') IS NULL
 OR OBJECT_ID(N'dbo.respuestas_evaluacion',N'U') IS NULL
 THROW 51100,N'Faltan tablas de captura de cuestionarios.',1;

IF OBJECT_ID(N'dbo.trg_instrumento_version_inmutable',N'TR') IS NULL
 OR OBJECT_ID(N'dbo.trg_instrumento_items_publicados',N'TR') IS NULL
 OR OBJECT_ID(N'dbo.trg_instrumento_opciones_publicadas',N'TR') IS NULL
 THROW 51105,N'Faltan triggers que protegen el contenido de versiones publicadas.',1;

IF NOT EXISTS(
 SELECT 1 FROM dbo.instrumento_versiones v
 JOIN dbo.instrumento_items i ON i.id_version_instrumento=v.id_version_instrumento
 JOIN dbo.instrumento_opciones_respuesta o ON o.id_version_instrumento=v.id_version_instrumento
 WHERE v.numero_version=N'VA-2023-08-29' AND v.estado_contenido=N'PUBLICADO'
 GROUP BY v.id_version_instrumento HAVING COUNT(DISTINCT i.id_item)=20 AND COUNT(DISTINCT o.valor)=5
) THROW 51101,N'La versión española PCL-5 debe tener 20 ítems y cinco opciones.',1;

IF EXISTS(
 SELECT 1 FROM dbo.instrumento_versiones v
 JOIN dbo.instrumento_items i ON i.id_version_instrumento=v.id_version_instrumento
 WHERE v.numero_version=N'PENDIENTE-AUTORIZACION' AND v.estado_contenido<>N'BLOQUEADO'
) THROW 51102,N'El PSS-10 debe continuar bloqueado hasta documentar la autorización de contenido.',1;

IF EXISTS(
 SELECT 1 FROM dbo.respuestas_evaluacion re
 JOIN dbo.instrumento_items i ON i.id_item=re.id_item AND i.id_version_instrumento=re.id_version_instrumento
 WHERE re.valor_puntuado<>CASE WHEN i.puntuacion_inversa=1 THEN 4-re.valor_respuesta ELSE re.valor_respuesta END
) THROW 51103,N'Hay respuestas cuyos valores puntuados no respetan la regla de inversión.',1;

IF EXISTS(
 SELECT r.id_resultado
 FROM dbo.resultados_evaluacion r
 JOIN dbo.oportunidades_evaluacion op ON op.id_oportunidad=r.id_oportunidad
 JOIN dbo.instrumento_versiones v ON v.id_version_instrumento=op.id_version_instrumento
 LEFT JOIN dbo.respuestas_evaluacion re ON re.id_resultado=r.id_resultado
 WHERE r.estado_validez=N'VALIDO' AND r.es_vigente=1
 GROUP BY r.id_resultado,v.id_instrumento
 HAVING (v.id_instrumento=1 AND COUNT(DISTINCT re.id_item)<>10)
     OR (v.id_instrumento=2 AND COUNT(DISTINCT re.id_item)<>20)
) THROW 51104,N'Un resultado vigente con versión de formulario no conserva todas las respuestas por ítem.',1;

IF EXISTS(SELECT 1 FROM dbo.resultados_evaluacion WHERE id_usuario_registro IS NULL)
 PRINT N'Existen resultados heredados sin actor registrado; no se asigna un actor retroactivo.';

SELECT v.numero_version,v.idioma,v.estado_contenido,COUNT(DISTINCT i.id_item) AS total_items,
       COUNT(DISTINCT o.valor) AS total_opciones
FROM dbo.instrumento_versiones v
LEFT JOIN dbo.instrumento_items i ON i.id_version_instrumento=v.id_version_instrumento
LEFT JOIN dbo.instrumento_opciones_respuesta o ON o.id_version_instrumento=v.id_version_instrumento
GROUP BY v.numero_version,v.idioma,v.estado_contenido
ORDER BY v.numero_version;

SELECT op.codigo_instrumento,COUNT_BIG(*) AS oportunidades_con_version
FROM dbo.oportunidades_evaluacion op
WHERE op.id_version_instrumento IS NOT NULL
GROUP BY op.codigo_instrumento;
PRINT N'Verificaciones estructurales completadas.';
GO
