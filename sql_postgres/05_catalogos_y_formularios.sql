-- Catálogos y contenido existentes del proyecto; solo para instalación DEMO vacía.
BEGIN;
INSERT INTO dbo.cat_practicas (id_practica, codigo_practica, nombre_practica, descripcion, es_mixto) VALUES
(1, 'P-01',  'Atención plena a la respiración', 'Atención centrada en la respiración',                     0),
(2, 'P-02',  'Escaneo corporal',                'Atención a las sensaciones corporales',                   0),
(3, 'P-03',  'Meditación caminando',            'Atención consciente durante el movimiento',               0),
(4, 'P-04',  'Meditación de bondad amorosa',    'Cultivo de amabilidad y compasión',                       0),
(5, 'MIXTO', 'Mixto',                           'Combina varias técnicas a lo largo de las sesiones',      1);
INSERT INTO dbo.cat_instrumentos (
    id_instrumento, codigo_instrumento, version_instrumento, nombre_instrumento,
    puntaje_minimo, puntaje_maximo, requiere_evento_indice
) VALUES
(1, 'PSS-10', 'v1.0-ES',  'Escala de Estrés Percibido (10 ítems)',          0, 40, 0),
(2, 'PCL-5',  'DSM-5-ES', 'Lista de Chequeo de TEPT para DSM-5 (20 ítems)', 0, 80, 1);
INSERT INTO dbo.cat_categorias_evento_indice (id_categoria_evento, codigo_categoria, nombre_categoria) VALUES
(1, 'ACCIDENTE_GRAVE',         'Accidente de tránsito o lesión grave'),
(2, 'DESASTRE_NATURAL',        'Desastre natural o emergencia climática'),
(3, 'VIOLENCIA_INTERPERSONAL', 'Exposición a violencia interpersonal'),
(4, 'PERDIDA_SUBITA',          'Pérdida súbita de un ser querido'),
(5, 'EMERGENCIA_MEDICA',       'Emergencia médica grave propia o familiar'),
(6, 'OTRO_CODIFICADO',         'Otro evento potencialmente traumático codificado');
INSERT INTO dbo.cat_variables_complementarias (
    id_variable, codigo_variable, nombre_variable, unidad_medida, metodo_medicion, valor_minimo, valor_maximo
) VALUES
(1, 'HRV_RMSSD',       'Variabilidad de la Frecuencia Cardíaca (RMSSD)', 'ms',     'Sensor PPG óptico',   10.000, 200.000),
(2, 'HORAS_SUENO',     'Duración promedio de sueño nocturno',            'horas',  'Autorreporte diario',  2.000,  14.000),
(3, 'AFECTO_POSITIVO', 'Afecto positivo semanal (PANAS-P)',              'puntos', 'Cuestionario PANAS',  10.000,  50.000);
DO $$ DECLARE v_pcl SMALLINT; v_pss SMALLINT; v_pclv BIGINT; v_pssv BIGINT; BEGIN
v_pcl := (SELECT id_instrumento FROM dbo.cat_instrumentos WHERE codigo_instrumento='PCL-5' AND version_instrumento='DSM-5-ES');
v_pss := (SELECT id_instrumento FROM dbo.cat_instrumentos WHERE codigo_instrumento='PSS-10' AND version_instrumento='v1.0-ES');
IF v_pcl IS NULL OR v_pss IS NULL THEN RAISE EXCEPTION 'Faltan catálogos'; END IF;

-- ============================================================================
-- 1. PCL-5 ESPAÑOL (20 ítems, escala 0-4, total 0-80)
-- ============================================================================
IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_versiones WHERE id_instrumento=v_pcl AND numero_version='VA-2023-08-29' AND idioma='es') THEN
 INSERT INTO dbo.instrumento_versiones(id_instrumento,numero_version,idioma,periodo_referencia,instrucciones,texto_periodo,fuente,estado_contenido,condiciones_uso)
 VALUES(v_pcl,'VA-2023-08-29','es','Último mes',
 'A continuación, hay una lista de problemas que a veces tienen las personas en respuesta a una experiencia muy estresante. Teniendo en mente su peor evento, lea cada problema y seleccione cuánto le ha molestado durante el último mes.',
 'Durante el último mes, ¿cuánta molestia ha sentido por:',
 'https://www.ptsd.va.gov/professional/assessment/documents/PCL-5_spanish_508_v16.pdf','BORRADOR',
 'Dominio público; traducción española confirmada por NCPTSD y no validada en investigación publicada. La institución exige reconocer esta limitación.');
END IF;

v_pclv := (SELECT id_version_instrumento FROM dbo.instrumento_versiones WHERE id_instrumento=v_pcl AND numero_version='VA-2023-08-29' AND idioma='es');

IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_items WHERE id_version_instrumento=v_pclv) THEN
 INSERT INTO dbo.instrumento_items(id_version_instrumento,numero_item,texto_item,puntuacion_inversa) VALUES
 (v_pclv,1,'Recuerdos repetidos, perturbadores e indeseados sobre la experiencia estresante?',0),
 (v_pclv,2,'Sueños repetidos y perturbadores sobre la experiencia estresante?',0),
 (v_pclv,3,'Sentir o actuar repentinamente como si la experiencia estresante estuviera sucediendo nuevamente (como si realmente estuviera allí reviviéndola)?',0),
 (v_pclv,4,'Sentirse muy angustiado(a) cuando algo le hizo recordar la experiencia estresante?',0),
 (v_pclv,5,'Tener reacciones físicas intensas cuando algo le hizo recordar la experiencia estresante (por ejemplo, palpitaciones, dificultad para respirar, sudoración)?',0),
 (v_pclv,6,'Evitar recuerdos, pensamientos o sentimientos relacionados con la experiencia estresante?',0),
 (v_pclv,7,'Evitar recordatorios externos de la experiencia estresante (por ejemplo, personas, lugares, conversaciones, actividades, objetos o situaciones)?',0),
 (v_pclv,8,'Dificultad para recordar partes importantes de la experiencia estresante?',0),
 (v_pclv,9,'Tener creencias negativas muy fuertes acerca de sí mismo(a), otras personas o el mundo (por ejemplo, pensamientos como: soy malo(a), hay algo seriamente mal en mí, no se puede confiar en nadie, el mundo es completamente peligroso)?',0),
 (v_pclv,10,'Culparse a sí mismo(a) o a otros por la experiencia estresante, o por lo que sucedió después de ésta?',0),
 (v_pclv,11,'Tener sentimientos negativos intensos, como miedo, terror, ira, culpa o vergüenza?',0),
 (v_pclv,12,'Pérdida de interés en actividades que antes disfrutaba?',0),
 (v_pclv,13,'Sentirse distante o desconectado(a) de otras personas?',0),
 (v_pclv,14,'Dificultad para sentir emociones positivas (por ejemplo, no poder sentir felicidad o sentimientos de amor por las personas cercanas a usted)?',0),
 (v_pclv,15,'Comportamiento irritable, explosiones de rabia o actuar agresivamente?',0),
 (v_pclv,16,'Tomar demasiados riesgos o hacer cosas que podrían causarle daño?',0),
 (v_pclv,17,'Estar súper alerta, o vigilante, o en guardia?',0),
 (v_pclv,18,'Sentirse muy nervioso(a) o sobresaltarse fácilmente?',0),
 (v_pclv,19,'Tener dificultad para concentrarse?',0),
 (v_pclv,20,'Tener dificultad para dormirse o mantenerse dormido(a)?',0);
END IF;

IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_opciones_respuesta WHERE id_version_instrumento=v_pclv) THEN
 INSERT INTO dbo.instrumento_opciones_respuesta(id_version_instrumento,valor,etiqueta) VALUES
 (v_pclv,0,'Nada en absoluto'),(v_pclv,1,'Un poco'),(v_pclv,2,'Moderadamente'),(v_pclv,3,'Bastante'),(v_pclv,4,'Extremadamente');
END IF;

UPDATE dbo.instrumento_versiones SET estado_contenido='PUBLICADO'
WHERE id_version_instrumento=v_pclv AND estado_contenido='BORRADOR';

-- ============================================================================
-- 2. PSS-10 ESPAÑOL (10 ítems, escala 0-4, inversión en 4, 5, 7 y 8, total 0-40)
-- ============================================================================
IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_versiones WHERE id_instrumento=v_pss AND numero_version='PSS10-ES-2026' AND idioma='es') THEN
 INSERT INTO dbo.instrumento_versiones(id_instrumento,numero_version,idioma,periodo_referencia,instrucciones,texto_periodo,fuente,estado_contenido,condiciones_uso)
 VALUES(v_pss,'PSS10-ES-2026','es','Último mes',
 'Las preguntas en esta escala hacen referencia a sus sentimientos y pensamientos durante el último mes. En cada caso, indique con qué frecuencia usted se sintió o pensó de determinada manera.',
 'En el último mes, ¿con qué frecuencia...',
 'Cohen & Williamson (1988); adaptación española PSS-10 (Remor, 2006) — uso académico MMET_BI UNT 2026-II','BORRADOR',
 'Uso académico y de investigación no comercial para el proyecto universitario MMET_BI (UNT Trujillo 2026-II). Escala 0-4 con inversión automática en ítems 4, 5, 7 y 8 (puntaje total 0-40).');
END IF;

v_pssv := (SELECT id_version_instrumento FROM dbo.instrumento_versiones WHERE id_instrumento=v_pss AND numero_version='PSS10-ES-2026' AND idioma='es');

IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_items WHERE id_version_instrumento=v_pssv) THEN
 INSERT INTO dbo.instrumento_items(id_version_instrumento,numero_item,texto_item,puntuacion_inversa) VALUES
 (v_pssv,1,'¿Con qué frecuencia ha estado afectado(a) por algo que ha ocurrido inesperadamente?',0),
 (v_pssv,2,'¿Con qué frecuencia se ha sentido incapaz de controlar las cosas importantes en su vida?',0),
 (v_pssv,3,'¿Con qué frecuencia se ha sentido nervioso(a) o estresado(a)?',0),
 (v_pssv,4,'¿Con qué frecuencia ha estado seguro(a) sobre su capacidad para manejar sus problemas personales?',1),
 (v_pssv,5,'¿Con qué frecuencia ha sentido que las cosas le van bien?',1),
 (v_pssv,6,'¿Con qué frecuencia ha sentido que no podía afrontar todas las cosas que tenía que hacer?',0),
 (v_pssv,7,'¿Con qué frecuencia ha podido controlar las dificultades de su vida?',1),
 (v_pssv,8,'¿Con qué frecuencia se ha sentido que tenía todo bajo control?',1),
 (v_pssv,9,'¿Con qué frecuencia ha estado enfadado(a) porque las cosas que le han ocurrido estaban fuera de su control?',0),
 (v_pssv,10,'¿Con qué frecuencia ha sentido que las dificultades se acumulan tanto que no puede superarlas?',0);
END IF;

IF NOT EXISTS(SELECT 1 FROM dbo.instrumento_opciones_respuesta WHERE id_version_instrumento=v_pssv) THEN
 INSERT INTO dbo.instrumento_opciones_respuesta(id_version_instrumento,valor,etiqueta) VALUES
 (v_pssv,0,'Nunca'),(v_pssv,1,'Casi nunca'),(v_pssv,2,'De vez en cuando'),(v_pssv,3,'A menudo'),(v_pssv,4,'Muy a menudo');
END IF;

UPDATE dbo.instrumento_versiones SET estado_contenido='PUBLICADO'
WHERE id_version_instrumento=v_pssv AND estado_contenido='BORRADOR';

-- ============================================================================
-- 3. VINCULACIÓN DE VERSIONES PUBLICADAS A OPORTUNIDADES ABIERTAS SIN RESULTADO
-- ============================================================================
UPDATE dbo.oportunidades_evaluacion op SET id_version_instrumento=v_pclv
WHERE op.codigo_instrumento='PCL-5' AND op.aplicable=1 AND op.id_version_instrumento IS NULL
  AND NOT EXISTS(SELECT 1 FROM dbo.resultados_evaluacion r WHERE r.id_oportunidad=op.id_oportunidad AND r.es_vigente=1 AND r.estado_validez='VALIDO');

UPDATE dbo.oportunidades_evaluacion op SET id_version_instrumento=v_pssv
WHERE op.codigo_instrumento='PSS-10' AND op.aplicable=1 AND op.id_version_instrumento IS NULL
  AND NOT EXISTS(SELECT 1 FROM dbo.resultados_evaluacion r WHERE r.id_oportunidad=op.id_oportunidad AND r.es_vigente=1 AND r.estado_validez='VALIDO');



END $$;
SELECT setval(pg_get_serial_sequence('dbo.cat_practicas','id_practica'),(SELECT max(id_practica) FROM dbo.cat_practicas));
SELECT setval(pg_get_serial_sequence('dbo.cat_instrumentos','id_instrumento'),(SELECT max(id_instrumento) FROM dbo.cat_instrumentos));
SELECT setval(pg_get_serial_sequence('dbo.cat_categorias_evento_indice','id_categoria_evento'),(SELECT max(id_categoria_evento) FROM dbo.cat_categorias_evento_indice));
SELECT setval(pg_get_serial_sequence('dbo.cat_variables_complementarias','id_variable'),(SELECT max(id_variable) FROM dbo.cat_variables_complementarias));
COMMIT;
