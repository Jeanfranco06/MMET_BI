/*
  Configuración versionada de instrumentos para MMET_BI_OLTP.
  Reejecutable, no destructiva; no crea ni corrige respuestas históricas.
  La versión española PCL-5 es la traducción estándar del National Center
  for PTSD, versión 29-08-2023. Fuente oficial: PCL-5_spanish_508_v16.pdf.
  Se registra su limitación de validación publicada.
  PSS-10 permanece BLOQUEADO hasta documentar autorización de la traducción.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
USE MMET_BI_OLTP;
GO

DECLARE @pcl SMALLINT=(SELECT id_instrumento FROM dbo.cat_instrumentos WHERE codigo_instrumento=N'PCL-5' AND version_instrumento=N'DSM-5-ES');
DECLARE @pss SMALLINT=(SELECT id_instrumento FROM dbo.cat_instrumentos WHERE codigo_instrumento=N'PSS-10' AND version_instrumento=N'v1.0-ES');
IF @pcl IS NULL OR @pss IS NULL THROW 51000,N'No se encontraron las definiciones base de PSS-10 y PCL-5.',1;

IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_versiones WHERE id_instrumento=@pcl AND numero_version=N'VA-2023-08-29' AND idioma=N'es')
 INSERT dbo.instrumento_versiones(id_instrumento,numero_version,idioma,periodo_referencia,instrucciones,texto_periodo,fuente,estado_contenido,condiciones_uso)
 VALUES(@pcl,N'VA-2023-08-29',N'es',N'Último mes',
 N'A continuación, hay una lista de problemas que a veces tienen las personas en respuesta a una experiencia muy estresante. Teniendo en mente su peor evento, lea cada problema y seleccione cuánto le ha molestado durante el último mes.',
 N'Durante el último mes, ¿cuánta molestia ha sentido por:',
 N'https://www.ptsd.va.gov/professional/assessment/documents/PCL-5_spanish_508_v16.pdf',N'BORRADOR',
 N'Dominio público; traducción española confirmada por NCPTSD y no validada en investigación publicada. La institución exige reconocer esta limitación.');
DECLARE @pclv BIGINT=(SELECT id_version_instrumento FROM dbo.instrumento_versiones WHERE id_instrumento=@pcl AND numero_version=N'VA-2023-08-29' AND idioma=N'es');
IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_items WHERE id_version_instrumento=@pclv)
 INSERT dbo.instrumento_items(id_version_instrumento,numero_item,texto_item,puntuacion_inversa) VALUES
 (@pclv,1,N'Recuerdos repetidos, perturbadores e indeseados sobre la experiencia estresante?',0),
 (@pclv,2,N'Sueños repetidos y perturbadores sobre la experiencia estresante?',0),
 (@pclv,3,N'Sentir o actuar repentinamente como si la experiencia estresante estuviera sucediendo nuevamente (como si realmente estuviera allí reviviéndola)?',0),
 (@pclv,4,N'Sentirse muy angustiado(a) cuando algo le hizo recordar la experiencia estresante?',0),
 (@pclv,5,N'Tener reacciones físicas intensas cuando algo le hizo recordar la experiencia estresante (por ejemplo, palpitaciones, dificultad para respirar, sudoración)?',0),
 (@pclv,6,N'Evitar recuerdos, pensamientos o sentimientos relacionados con la experiencia estresante?',0),
 (@pclv,7,N'Evitar recordatorios externos de la experiencia estresante (por ejemplo, personas, lugares, conversaciones, actividades, objetos o situaciones)?',0),
 (@pclv,8,N'Dificultad para recordar partes importantes de la experiencia estresante?',0),
 (@pclv,9,N'Tener creencias negativas muy fuertes acerca de sí mismo(a), otras personas o el mundo (por ejemplo, pensamientos como: soy malo(a), hay algo seriamente mal en mí, no se puede confiar en nadie, el mundo es completamente peligroso)?',0),
 (@pclv,10,N'Culparse a sí mismo(a) o a otros por la experiencia estresante, o por lo que sucedió después de ésta?',0),
 (@pclv,11,N'Tener sentimientos negativos intensos, como miedo, terror, ira, culpa o vergüenza?',0),
 (@pclv,12,N'Pérdida de interés en actividades que antes disfrutaba?',0),
 (@pclv,13,N'Sentirse distante o desconectado(a) de otras personas?',0),
 (@pclv,14,N'Dificultad para sentir emociones positivas (por ejemplo, no poder sentir felicidad o sentimientos de amor por las personas cercanas a usted)?',0),
 (@pclv,15,N'Comportamiento irritable, explosiones de rabia o actuar agresivamente?',0),
 (@pclv,16,N'Tomar demasiados riesgos o hacer cosas que podrían causarle daño?',0),
 (@pclv,17,N'Estar súper alerta, o vigilante, o en guardia?',0),
 (@pclv,18,N'Sentirse muy nervioso(a) o sobresaltarse fácilmente?',0),
 (@pclv,19,N'Tener dificultad para concentrarse?',0),
 (@pclv,20,N'Tener dificultad para dormirse o mantenerse dormido(a)?',0);
IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_opciones_respuesta WHERE id_version_instrumento=@pclv)
 INSERT dbo.instrumento_opciones_respuesta(id_version_instrumento,valor,etiqueta) VALUES
 (@pclv,0,N'Nada en absoluto'),(@pclv,1,N'Un poco'),(@pclv,2,N'Moderadamente'),(@pclv,3,N'Bastante'),(@pclv,4,N'Extremadamente');
UPDATE dbo.instrumento_versiones SET estado_contenido=N'PUBLICADO'
WHERE id_version_instrumento=@pclv AND estado_contenido=N'BORRADOR';

IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_versiones WHERE id_instrumento=@pss AND numero_version=N'PENDIENTE-AUTORIZACION' AND idioma=N'es')
 INSERT dbo.instrumento_versiones(id_instrumento,numero_version,idioma,periodo_referencia,instrucciones,texto_periodo,fuente,estado_contenido,condiciones_uso)
 VALUES(@pss,N'PENDIENTE-AUTORIZACION',N'es',N'Último mes',NULL,NULL,
 N'https://www.cmu.edu/dietrich/psychology/stress-immunity-disease-lab/scales/index.html',N'BLOQUEADO',
 N'No publicar hasta documentar autorización de uso de la traducción española y sus etiquetas. Se registran únicamente la estructura y las reglas de puntuación.');
DECLARE @pssv BIGINT=(SELECT id_version_instrumento FROM dbo.instrumento_versiones WHERE id_instrumento=@pss AND numero_version=N'PENDIENTE-AUTORIZACION' AND idioma=N'es');
IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_items WHERE id_version_instrumento=@pssv)
 INSERT dbo.instrumento_items(id_version_instrumento,numero_item,texto_item,puntuacion_inversa) VALUES
 (@pssv,1,NULL,0),(@pssv,2,NULL,0),(@pssv,3,NULL,0),(@pssv,4,NULL,1),(@pssv,5,NULL,1),
 (@pssv,6,NULL,0),(@pssv,7,NULL,1),(@pssv,8,NULL,1),(@pssv,9,NULL,0),(@pssv,10,NULL,0);

-- Solo vincula formularios publicables a oportunidades sin resultado previo.
UPDATE op SET id_version_instrumento=@pclv
FROM dbo.oportunidades_evaluacion op
WHERE op.codigo_instrumento=N'PCL-5' AND op.aplicable=1 AND op.id_version_instrumento IS NULL
  AND NOT EXISTS(SELECT 1 FROM dbo.resultados_evaluacion r WHERE r.id_oportunidad=op.id_oportunidad AND r.es_vigente=1 AND r.estado_validez=N'VALIDO');
PRINT N'PCL-5 español versionado; PSS-10 permanece bloqueado hasta autorización.';
GO
