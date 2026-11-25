/*
  Configuración versionada de instrumentos para MMET_BI_OLTP.
  Reejecutable, no destructiva; no crea ni corrige respuestas históricas.
  - PCL-5 español: traducción estándar del National Center for PTSD,
    versión 29-08-2023 (PCL-5_spanish_508_v16.pdf), 20 ítems (0-4), total 0-80.
  - PSS-10 español: adaptación española estándar (Cohen & Williamson, 1988;
    Remor, 2006), 10 ítems (0-4), inversión automática en ítems 4, 5, 7 y 8,
    puntaje total 0-40. Habilitado y publicado para operación de punta a punta.
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

-- ============================================================================
-- 1. PCL-5 ESPAÑOL (20 ítems, escala 0-4, total 0-80)
-- ============================================================================
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

-- ============================================================================
-- 2. PSS-10 ESPAÑOL (10 ítems, escala 0-4, inversión en 4, 5, 7 y 8, total 0-40)
-- ============================================================================
IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_versiones WHERE id_instrumento=@pss AND numero_version=N'PSS10-ES-2026' AND idioma=N'es')
 INSERT dbo.instrumento_versiones(id_instrumento,numero_version,idioma,periodo_referencia,instrucciones,texto_periodo,fuente,estado_contenido,condiciones_uso)
 VALUES(@pss,N'PSS10-ES-2026',N'es',N'Último mes',
 N'Las preguntas en esta escala hacen referencia a sus sentimientos y pensamientos durante el último mes. En cada caso, indique con qué frecuencia usted se sintió o pensó de determinada manera.',
 N'En el último mes, ¿con qué frecuencia...',
 N'Cohen & Williamson (1988); adaptación española PSS-10 (Remor, 2006) — uso académico MMET_BI UNT 2026-II',N'BORRADOR',
 N'Uso académico y de investigación no comercial para el proyecto universitario MMET_BI (UNT Trujillo 2026-II). Escala 0-4 con inversión automática en ítems 4, 5, 7 y 8 (puntaje total 0-40).');

DECLARE @pssv BIGINT=(SELECT id_version_instrumento FROM dbo.instrumento_versiones WHERE id_instrumento=@pss AND numero_version=N'PSS10-ES-2026' AND idioma=N'es');

IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_items WHERE id_version_instrumento=@pssv)
 INSERT dbo.instrumento_items(id_version_instrumento,numero_item,texto_item,puntuacion_inversa) VALUES
 (@pssv,1,N'¿Con qué frecuencia ha estado afectado(a) por algo que ha ocurrido inesperadamente?',0),
 (@pssv,2,N'¿Con qué frecuencia se ha sentido incapaz de controlar las cosas importantes en su vida?',0),
 (@pssv,3,N'¿Con qué frecuencia se ha sentido nervioso(a) o estresado(a)?',0),
 (@pssv,4,N'¿Con qué frecuencia ha estado seguro(a) sobre su capacidad para manejar sus problemas personales?',1),
 (@pssv,5,N'¿Con qué frecuencia ha sentido que las cosas le van bien?',1),
 (@pssv,6,N'¿Con qué frecuencia ha sentido que no podía afrontar todas las cosas que tenía que hacer?',0),
 (@pssv,7,N'¿Con qué frecuencia ha podido controlar las dificultades de su vida?',1),
 (@pssv,8,N'¿Con qué frecuencia se ha sentido que tenía todo bajo control?',1),
 (@pssv,9,N'¿Con qué frecuencia ha estado enfadado(a) porque las cosas que le han ocurrido estaban fuera de su control?',0),
 (@pssv,10,N'¿Con qué frecuencia ha sentido que las dificultades se acumulan tanto que no puede superarlas?',0);

IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_opciones_respuesta WHERE id_version_instrumento=@pssv)
 INSERT dbo.instrumento_opciones_respuesta(id_version_instrumento,valor,etiqueta) VALUES
 (@pssv,0,N'Nunca'),(@pssv,1,N'Casi nunca'),(@pssv,2,N'De vez en cuando'),(@pssv,3,N'A menudo'),(@pssv,4,N'Muy a menudo');

UPDATE dbo.instrumento_versiones SET estado_contenido=N'PUBLICADO'
WHERE id_version_instrumento=@pssv AND estado_contenido=N'BORRADOR';

-- ============================================================================
-- 3. VINCULACIÓN DE VERSIONES PUBLICADAS A OPORTUNIDADES ABIERTAS SIN RESULTADO
-- ============================================================================
UPDATE op SET id_version_instrumento=@pclv
FROM dbo.oportunidades_evaluacion op
WHERE op.codigo_instrumento=N'PCL-5' AND op.aplicable=1 AND op.id_version_instrumento IS NULL
  AND NOT EXISTS(SELECT 1 FROM dbo.resultados_evaluacion r WHERE r.id_oportunidad=op.id_oportunidad AND r.es_vigente=1 AND r.estado_validez=N'VALIDO');

UPDATE op SET id_version_instrumento=@pssv
FROM dbo.oportunidades_evaluacion op
WHERE op.codigo_instrumento=N'PSS-10' AND op.aplicable=1 AND op.id_version_instrumento IS NULL
  AND NOT EXISTS(SELECT 1 FROM dbo.resultados_evaluacion r WHERE r.id_oportunidad=op.id_oportunidad AND r.es_vigente=1 AND r.estado_validez=N'VALIDO');

PRINT N'Versiones activas PCL-5 (20 ítems) y PSS-10 (10 ítems, inversión 4,5,7,8) publicadas y vinculadas.';
GO
