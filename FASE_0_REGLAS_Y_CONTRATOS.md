# Fase 0 Reglas y contratos del sistema MMET BI

Fecha de elaboración: 24 de noviembre de 2026. Versión: 1.1.

Estado: decisiones D01 a D03 confirmadas por el usuario e incorporadas en los contratos de todas las capas. Permanece pendiente la selección y condiciones de uso de la traducción PSS-10 (D04). Este documento define el trabajo futuro; no declara esas funcionalidades implementadas.

## 1 Alcance y autoridad

El sistema gestionará estudiantes sintéticos, programas, prácticas, sesiones, inscripciones, asistencias y cuestionarios completos, y alimentará un Data Mart mediante ETL. Mantendrá Next.js, NestJS y SQL Server.

Las decisiones expresas del usuario prevalecen sobre el README y la guía anterior. El contexto académico proporcionado es suficiente para continuar; no se requiere volver a solicitar el informe ni la asesoría.

### Objetivos

| Código | Objetivo vigente | Soporte principal |
|---|---|---|
| OBJ-1 | Determinar reducciones observadas de estrés y síntomas postraumáticos. | KPI-01 y KPI-02 |
| OBJ-2 | Monitorear y favorecer continuidad y retención. | KPI-03 |
| OBJ-3 | Comparar prácticas asociadas con mayores reducciones. | KPI-05 y RG-02 |

KPI-04 es soporte transversal de cobertura de evaluaciones. Los resultados no demuestran causalidad ni constituyen diagnósticos o prescripciones.

### Decisiones confirmadas por el usuario

- Datos y cuentas de demostración 100 % sintéticos; sin incorporar personas de datasets públicos.
- Cuestionarios completos PSS-10 y PCL-5 como funcionalidad principal.
- Respuestas por ítem, puntuación automática y trazabilidad de correcciones.
- Evaluaciones iniciales y finales, con PCL-5 solo cuando corresponda.
- Cinco KPI y cuatro reportes; sin sexto KPI por el ranking.
- IA interpreta resultados validados; no calcula las puntuaciones ni los KPI.
- Scripts SQL completos y base local sincronizados en cada fase de datos.
- D01: KPI-04 solo incluye oportunidades aplicables cuya fecha prevista de cumplimiento sea igual o anterior al corte. El avance anterior se muestra en RO-02 por separado.
- D02: retiro antes de tres sesiones exigibles se muestra RETIRADO y Evaluable: No en RO-01, fuera del numerador y denominador de KPI-03.
- D03: los cortes originales usan lo conocido y registrado hasta su cierre; toda recalculación con correcciones posteriores es una revisión explícita y auditable.
- Alibaba Cloud como primera opción; gasto y alternativa de proveedor requieren autorización específica.

## 2 Contrato de instrumentos y puntuación

| Propiedad | PSS-10 | PCL-5 |
|---|---|---|
| Ítems | 10 | 20 |
| Valores de respuesta | Enteros de 0 a 4 | Enteros de 0 a 4 |
| Referencia prevista | Último mes | Último mes |
| Ítems inversos | 4, 5, 7 y 8; valor puntuado = 4 menos respuesta | Ninguno |
| Total | Suma de valores puntuados; 0 a 40 | Suma de respuestas; 0 a 80 |
| Aplicación | Oportunidades inicial y final asignadas | Solo con aplicabilidad establecida y evento índice codificado |

Estas reglas corresponden a las fuentes oficiales F01 y F03. Las instrucciones y etiquetas finales en español se tomarán de la traducción seleccionada; no se improvisarán textos ni se cambiará la numeración de los ítems inversos.

La ventana de respuesta pertenece al programa. El periodo de referencia pertenece al instrumento. Una programación semanal no modifica el periodo de referencia del formulario.

### Definición versionada

Cada versión conservará código, idioma, procedencia, edición, instrucciones, referencia temporal, ítems ordenados, opciones permitidas, reglas de puntuación y condiciones de uso. Una versión utilizada será inmutable. Una modificación de textos, opciones o puntuación generará una versión distinta.

La versión del instrumento, la versión de las respuestas/resultados y la versión de las reglas ETL son identificadores diferentes.

### Condiciones de uso verificadas y tareas de contenido

- PSS: CMU remite solicitudes a ePROVIDE. Las traducciones tienen condiciones adicionales y CMU indica contactar a sus traductores (F02). No se ha verificado una autorización específica para la traducción del proyecto.
- PCL-5: la fuente oficial publica el instrumento y traducción española en dominio público, e informa limitaciones de validación de su traducción (F04).
- Selección técnica para PCL-5: traducción española estándar mensual publicada por el National Center for PTSD, archivo PCL-5_spanish_508_v16.pdf, portada con fecha de versión 29 de agosto de 2023 (F05). Sus limitaciones de validación deben acompañar la documentación. El campo libre de evento se sustituirá por la referencia al evento codificado ya asignado, sin alterar las veinte preguntas.
- PSS-10: selección exacta de traducción española y evidencia de condiciones de uso pendientes. No se confundirá una adaptación de 13 o 14 ítems con PSS-10.
- La estructura, puntuación y pruebas con datos sintéticos pueden prepararse sin reproducir preguntas protegidas. Contenido provisional no permite declarar terminado el formulario.

## 3 Contrato de evaluación

Una oportunidad identifica una inscripción, instrumento/versión, momento, ventana y aplicabilidad. Para PCL-5 también identifica el evento índice; este debe pertenecer al estudiante. No se solicitarán narraciones personales.

También conserva la fecha prevista de cumplimiento. Esta fecha determina la elegibilidad KPI-04 y no se sustituye por la fecha de apertura. Los cambios de programación y aplicabilidad deben versionarse para reconstruir lo conocido al corte.

La aplicabilidad se establece por el rol Evaluación con motivo registrado. No se deduce automáticamente del puntaje PSS-10. Los criterios de este caso académico se gestionan como datos sintéticos, sin presentarlos como valoración clínica.

### Flujo propuesto

1. El estudiante autenticado consulta sus oportunidades asignadas.
2. Abre las instrucciones y el cuestionario de la versión asignada.
3. Guarda respuestas en borrador y puede continuarlas.
4. Revisa las respuestas y confirma el envío definitivo.
5. El servidor valida identidad, asignación, aplicabilidad, versión, ítems y opciones.
6. Calcula la puntuación y almacena respuestas y total atómicamente.
7. Registra actor y fecha de envío del servidor en America/Lima, conservando el instante con zona horaria.

No habrá respuestas preseleccionadas ni imputación de omisiones como cero. Se exige exactamente una respuesta válida para cada ítem. Los borradores no tienen resultado definitivo y no alimentan KPI.

El total enviado por el navegador no es autoritativo. Un estudiante no puede editar el total. El endpoint actual de totales deberá adaptarse para impedir que se eluda la captura completa.

### Correcciones

El estudiante no sobrescribe un envío definitivo. El rol Evaluación gestiona una corrección con motivo y actor, creando una nueva versión completa de respuestas y total. Solo una versión es vigente por oportunidad. La versión anterior permanece consultable por usuarios autorizados.

Corregir una respuesta recalcula el total. Corregir fecha de realización o aplicabilidad también deja historial. La fecha de corrección no sustituye automáticamente la fecha original de realización. Los envíos concurrentes deben conservar unicidad y no dejar resultados parciales.

### Estados de oportunidad propuestos

| Situación al corte | Estado de control | Cuenta como completada |
|---|---|---|
| No aplicable | NO_APLICABLE | No; fuera del denominador |
| Ventana aún no iniciada | FUTURA | No; fuera del denominador |
| Sin resultado definitivo y ventana vigente | PENDIENTE_EN_VENTANA | No |
| Sin resultado definitivo y ventana finalizada | VENCIDA | No |
| Resultado válido dentro de ventana | COMPLETADA_EN_VENTANA | Sí, si la oportunidad es elegible |
| Resultado válido después del fin | COMPLETADA_TARDIA | Sí, si la oportunidad es elegible |

Enviar después de la ventana se permite con marca tardía; no forma par de efectividad. Envíos anteriores al inicio se bloquean en el flujo normal. Un registro excepcional anterior requiere revisión y no se etiqueta automáticamente como tardío.

El estado operacional y la elegibilidad son atributos independientes: RO-02 muestra avances dentro del plazo, incluso evaluaciones ya enviadas, sin incluirlos en el KPI antes de su fecha prevista. Desde esa fecha, una oportunidad aplicable entra al denominador aunque no esté completada. Una completada anticipadamente entra en el numerador solo cuando la oportunidad se vuelve elegible.

## 4 Comparabilidad

Un par debe tener la misma inscripción, estudiante, programa e instrumento, con un resultado inicial y uno final completos, válidos y en sus ventanas. La final debe ser posterior a la inicial. PCL-5 exige idéntico evento índice.

Para la primera entrega se propone exigir la misma versión exacta del instrumento en ambos momentos. No habrá equivalencias automáticas entre traducciones o versiones. El corte limita las fechas y versiones utilizables según D03.

Cada par se atribuye a la práctica principal del programa una sola vez. MIXTO es una clasificación del programa, no una técnica individual de sesión. Modalidad, conducción, duración y frecuencia no se mezclarán con el catálogo de técnicas.

## 5 Continuidad y asistencia

### Base confirmada

- El inicio de participación es la primera asistencia registrada como ASISTIO en una sesión realizada.
- Se cuentan sesiones del mismo programa realizadas hasta el corte, desde esa primera asistencia, incluida esa sesión.
- Es evaluable para continuidad cuando acumula al menos tres sesiones exigibles. No se requieren tres asistencias.
- Sesiones futuras, canceladas y no realizadas no generan faltas.
- El grano es inscripción por programa y corte; la misma persona puede tener otra inscripción independiente.

### Clasificación propuesta

| Condición | Estado | Tratamiento KPI-03 |
|---|---|---|
| Retiro formal antes de tres exigibles, incluso sin inicio | RETIRADO, Evaluable: No | Fuera de ambos conteos; visible en RO-01 |
| Sin primera asistencia y sin retiro | NO_EVALUABLE, motivo SIN_INICIO | Fuera de ambos conteos; visible en gestión |
| Menos de tres exigibles y sin retiro | NO_EVALUABLE | Fuera de ambos conteos |
| Retiro formal con al menos tres exigibles antes del retiro | RETIRADO, Evaluable: Sí | Denominador, no numerador |
| Evaluable, sin retiro y asistió a la última exigible | ACTIVO | Denominador y numerador |
| Evaluable, faltó a la última y asistió a alguna de las dos anteriores | EN_RIESGO | Denominador y numerador |
| Evaluable, tres últimas INASISTENCIA explícitas | ABANDONO | Solo denominador |
| Falta información necesaria para decidir | Incidencia PENDIENTE_VALIDACION | Fuera de ambos conteos hasta resolver |

PENDIENTE_VALIDACION es una condición de calidad, no un sexto estado de continuidad. Una clasificación demostrable (por ejemplo, última asistencia confirmada) no se invalida por una omisión irrelevante para decidir el estado; los conteos incompletos sí se identifican como tales.

La inscripción define la pertenencia a las sesiones del programa; el retiro efectivo termina la exigibilidad. Se conserva en el denominador a quien ya era evaluable al retirarse. El retiro tiene precedencia para el estado visible y la evaluabilidad se calcula por separado. Las sesiones posteriores al retiro no convierten a un retirado no evaluable en evaluable. La consulta parte de las inscripciones y no puede excluir al retirado sin inicio mediante un JOIN obligatorio a primera asistencia.

El cierre de asistencia debe resolver cada participante como asistió, inasistencia o retiro; no convierte silenciosamente un campo vacío en falta. Las modificaciones posteriores conservan historial.

Al consolidar programas, los conteos suman participaciones evaluables, no personas únicas. El rótulo del total debe explicitarlo; no se usará DISTINCT para combinar estados contradictorios de una misma persona.

## 6 Indicadores y reportes

| KPI | Medidas base y fórmula | Bueno | Regular | Malo | Reporte |
|---|---|---|---|---|---|
| KPI-01 | (SumaInicial - SumaFinal) / ParesValidos PSS-10 | >= 4 pts | >= 0 y < 4 | < 0 | RG-01 |
| KPI-02 | (SumaInicial - SumaFinal) / ParesValidos PCL-5 | >= 10 pts | >= 0 y < 10 | < 0 | RG-01 |
| KPI-03 | Continuan / Evaluables * 100 | >= 80 % | >= 60 y < 80 | < 60 | RO-01 |
| KPI-04 | ElegiblesCompletadas / Elegibles * 100 | >= 90 % | >= 70 y < 90 | < 70 | RO-02 |
| KPI-05 | PracticasEvaluablesQueCumplen / PracticasEvaluables * 100 | >= 80 % | >= 60 y < 80 | < 60 | RG-02 |

Pares y puntajes se separan por instrumento y versión. Promedios y tasas se recalculan desde las medidas base, no promediando promedios. Se comparan umbrales antes de redondear. Los umbrales son metas operativas, sin diagnóstico ni validación clínica automática del promedio grupal.

KPI-03: Continuan = ACTIVO + EN_RIESGO evaluables. El retirado con menos de tres exigibles no integra ninguno de los conteos.

KPI-04: Elegible = aplicable y fecha_prevista <= corte, usando la programación conocida al cierre. ElegiblesCompletadas exige además un resultado definitivo válido conocido y realizado hasta ese corte; incluye tardías y excluye borradores. RO-02 distingue total de oportunidades mostradas, avance todavía no exigible, elegibles y elegibles completadas. No se usa el total del listado como denominador. Fecha prevista igual al corte ya es elegible; fecha posterior aún no lo es. Si la ventana sigue vigente pero se alcanza una fecha prevista anterior a su fin, manda la fecha prevista confirmada, sin cambiarla automáticamente al fin de ventana.

KPI-05: una práctica es evaluable con al menos cinco pares válidos del instrumento/versión. Cumple si su reducción promedio alcanza 4 puntos PSS-10 o 10 PCL-5. El denominador es el número de prácticas evaluables, no siempre cinco. Dos prácticas de dos evaluables representan 100 %, y se muestra también cobertura 2/5 del catálogo inicial. El detalle por programa no redefine este KPI como porcentaje de programas.

| Reporte | Propósito y detalle |
|---|---|
| RO-01 | Seguimiento de continuidad y abandono por estudiante y programa |
| RO-02 | Control de oportunidades, pendientes y completadas |
| RG-01 | Evolución pareada por instrumento y agrupación |
| RG-02 | Comparación por práctica, cumplimiento de metas y ranking |

Los filtros por estado y paginación afectan al listado, no al denominador global del KPI. Los demás filtros de población, programa, periodo e instrumento se aplican coherentemente al numerador y denominador. El ranking muestra tamaño de muestra y no ordena valores suprimidos por su reducción oculta.

Denominador cero: SIN_DATOS y valor nulo. Para agregados psicométricos con 1 a 4 pares: SUPRIMIDO, sin promedios, reducción ni semáforo de magnitud. Para tasas con 1 a 4 unidades de base: supresión de tasa. Revisar subtotales y diferencias que permitan reconstruir un dato oculto. Esta protección no impide el detalle individual a un rol autorizado. KPI-05 aplica el mínimo a los pares de cada práctica, no exige cinco prácticas evaluables.

## 7 Contratos de datos y cargas

| Unidad | Identidad y trazabilidad mínima |
|---|---|
| Definición | Instrumento, versión, idioma, ítems, opciones, regla y fuente |
| Oportunidad | Inscripción, versión, momento, ventana, aplicabilidad, evento |
| Envío | Oportunidad, número de versión, respuestas, total calculado, realización, registro, actor |
| Corrección | Envío anterior, motivo, actor y nueva versión completa |
| Ejecución ETL | Corte, versión de reglas, versión de datos, estado, conteos e incidencias |

Estos son contratos conceptuales, no nombres de tablas ya implementadas.

Las respuestas permanecen en OLTP. El ETL comprueba integridad y recalcula el total; una discrepancia excluye el resultado y genera incidencia. El DM conserva la referencia al envío versionado para rastrear el cálculo.

| Estructura prevista | Grano |
|---|---|
| HechoContinuidad | Una inscripción por corte y revisión publicada |
| HechoCumplimientoEvaluaciones | Una oportunidad por corte y revisión publicada |
| HechoResultadosEvaluacion | Un par compatible por inscripción, instrumento/versión, evento y corte/revisión |
| HechoEfectividadPractica | Vista derivada por práctica, instrumento/versión y corte/revisión |

No sumar cortes ni revisiones entre sí. Una ejecución repetida con los mismos datos y reglas no duplica filas. Publicar solo una carga completa y reconciliada; los errores conservan la última publicación correcta.

Los cortes originales usan solo información conocida y registrada hasta el cierre del día consultado en America/Lima. Se conservan fecha efectiva y fecha de registro: un dato cargado mañana con fecha efectiva de ayer no pertenece al corte original de ayer. La selección temporal aplica a resultados, respuestas versionadas, asistencias, retiros, estados, programación y aplicabilidad; no basta con filtrar fecha_realizacion ni es_vigente actual.

Una revisión histórica se solicita explícitamente, con motivo, actor, instante de conocimiento utilizado y referencia al corte original. Puede incorporar correcciones posteriores aplicadas al contexto histórico, conserva la publicación original y se identifica como REVISIÓN en API, reportes e interpretación IA. Una recarga rutinaria no convierte silenciosamente el corte original en revisión. El usuario puede distinguir y seleccionar ambas publicaciones; no se agregan entre sí.

### Aplicación de D01 a D03 en todas las capas

| Capa | D01 Fecha prevista | D02 Retiro temprano | D03 Histórico y revisiones |
|---|---|---|---|
| OLTP y scripts | Fecha prevista y cambios auditados | Retiro, inicio y asistencias conservados | Historial de fecha efectiva y registro, sin sobrescritura de evidencia |
| ETL | Separar avance de elegibilidad; contar solo elegibles completadas | Calcular estado y evaluabilidad independientes; conservar fila no evaluable | Seleccionar versiones conocidas al cierre o conocimiento explícito de revisión |
| Data Mart | Marcas elegible y completada elegible; conteos distintos | Fila RETIRADO con evaluable=0 y continua=0 | Identidad de publicación/corte/revisión y referencias a versiones de origen |
| Reportes | RO-02 muestra avance separado y KPI con su denominador | RO-01 muestra retirado y Evaluable: No | Mostrar original o revisión, corte y fecha de conocimiento |
| Pruebas automatizadas futuras | Límites antes/en/después de fecha prevista; envío anticipado | Cero, dos y tres exigibles al retiro; no aumentar después | Corrección tardía, reprogramación, repetición y revisión explícita |

## 8 Roles propuestos

| Rol | Permisos principales |
|---|---|
| Estudiante | Sus oportunidades, borradores y envío de respuestas; sin edición de total ni evaluaciones ajenas |
| Coordinación | Estudiantes, programas, inscripciones, sesiones y asistencia; seguimiento operativo sin puntajes individuales por defecto |
| Evaluación | Aplicabilidad, evento codificado, programación, detalle de respuestas y correcciones justificadas |
| Dirección | Agregados autorizados y ranking; sin respuestas individuales |
| Administración | Usuarios, roles, ETL y metadatos de incidencias; sin acceso automático a respuestas psicológicas |

Los permisos se verifican en backend y por objeto. Las credenciales no se registran en scripts de datos ni documentación. El acceso a resultados propios por el estudiante queda limitado inicialmente al comprobante de envío; no se muestran categorías clínicas.

IA: entrada de agregados autorizados, filtros, corte, versión de carga, muestra y limitaciones. Sin respuestas individuales, narraciones ni credenciales. Debe distinguir observación e interpretación y conservar referencia del contexto usado.

## 9 Scripts SQL y base local

Cada cambio futuro de datos debe mantener el script canónico y la base local alineados. El archivo de conexión database.service.ts no sustituye el esquema SQL; las consultas analíticas también requieren revisión cuando cambien reglas.

| Archivo en sql_server | Responsabilidad prevista |
|---|---|
| 01_crear_bd_oltp_sqlserver.sql | Esquema OLTP completo y documentado |
| 02_poblar_datos_10k_sqlserver.sql | Semilla y escenarios; respuestas sintéticas y totales calculados |
| 03_crear_bd_datamart_sqlserver.sql | Dimensiones, hechos y vistas |
| 04_etl_sqlserver.sql | Procedimientos ETL y auditoría |
| 05_verificar_integridad_sqlserver.sql | Comprobaciones de esquema, integridad y conciliación |

Los tres últimos archivos son entregables futuros. Si se necesita un script de actualización que conserve datos, será complementario y se actualizará también el esquema canónico. Los scripts de reconstrucción destructiva se identificarán explícitamente y no se ejecutarán como actualización rutinaria. Antes de aplicar cambios destructivos se preparará respaldo y se confirmará el alcance.

El generador partirá de respuestas, no inventará ítems para justificar los totales antiguos. Conservará semilla, versión y fecha simulada, con casos favorables, desfavorables e incompletos. Los registros sintéticos históricos deben tener fechas de registro coherentes con el escenario, identificadas como simuladas.

## 10 Casos de aceptación para las fases siguientes

| Caso | Entrada o condición | Resultado esperado |
|---|---|---|
| A01 | PSS: directos 0 e inversos 4 | Total 0 |
| A02 | PSS: directos 4 e inversos 0 | Total 40 |
| A03 | PSS: diez respuestas 0 / diez respuestas 4 / diez respuestas 2 | Totales 16 / 24 / 20 |
| A04 | PCL: veinte respuestas 0 / 4 / 2 | Totales 0 / 80 / 40 |
| A05 | Falta un ítem, ítem duplicado, ajeno o valor fuera de rango | Rechazar envío definitivo; no completar con cero |
| A06 | Borrador completo sin envío | Sin resultado definitivo ni aporte al KPI |
| A07 | Navegador envía total adulterado | Ignorar/rechazar total cliente; calcular desde respuestas |
| A08 | PCL no aplicable o evento ajeno | Impedir envío y registrar error controlado |
| A09 | Versiones distintas o evento índice distinto en inicial/final | No formar par |
| A10 | Resultado tardío completo | Cumplimiento si elegible; sin par de reducción |
| A11 | Dos envíos concurrentes | Como máximo un resultado válido vigente |
| A12 | Corrección | Nueva versión con historial de respuestas y cálculo |
| A13 | Una asistencia y dos inasistencias posteriores realizadas | Evaluable con tres sesiones; estado EN_RIESGO |
| A14 | Tres últimas inasistencias explícitas tras haber iniciado | ABANDONO si evaluable |
| A15 | Tres registros faltantes de asistencia | No inferir abandono; incidencia de calidad |
| A16 | Cancelación o sesión futura | No genera falta ni exigibilidad |
| A17 | Filtrar solo abandonos o pendientes | Cambia listado; no redefine KPI global del contexto |
| A18 | Cuatro pares / cinco pares | Suprimir promedio / permitir cálculo |
| A19 | PSS: 5 pares con sumas 100 y 80 | Reducción 4; BUENO |
| A20 | PCL: 5 pares con sumas 200 y 150 | Reducción 10; BUENO |
| A21 | Dos prácticas de dos evaluables cumplen, catálogo de cinco | KPI-05 100 %, cobertura 2/5 |
| A22 | Estudiante intenta consultar oportunidad ajena | Acceso denegado en backend |
| A23 | Repetir ETL idéntico o fallar a mitad | Sin duplicados o publicación parcial |
| A24 | Corrección posterior a un corte | Resultado conforme a D03, sin sobrescritura silenciosa |
| A25 | Ventana abierta, fecha prevista posterior al corte, sin envío | Visible como avance RO-02; elegible=0, completada elegible=0 |
| A26 | Envío válido antes de fecha prevista | Visible completada en RO-02; fuera de ambos conteos KPI-04 hasta fecha prevista |
| A27 | Fecha prevista igual al corte, sin resultado | Elegible=1, completada elegible=0; sin confundir elegibilidad con vencimiento |
| A28 | Resultado anticipado válido y fecha prevista ya alcanzada | Elegible=1, completada elegible=1 si conocido al corte |
| A29 | Retiro con cero o dos exigibles | Visible RETIRADO en RO-01, evaluable=0, continua=0, fuera de ambos conteos KPI-03 |
| A30 | Retiro con tres exigibles | RETIRADO, evaluable=1, continua=0; solo denominador |
| A31 | Sesiones posteriores a retiro temprano | No transforman al retirado no evaluable en evaluable |
| A32 | Resultado v1 conocido antes del corte; v2 corregido después | Corte original selecciona v1; revisión explícita puede usar v2; ambas publicaciones conservadas |
| A33 | Asistencia o retiro registrado después con fecha efectiva anterior | No aparece en corte original; solo en revisión identificada |
| A34 | Cambio posterior de fecha prevista o aplicabilidad | Corte original usa programación anterior; revisión usa versión de conocimiento seleccionada |
| A35 | Recarga ordinaria del corte tras una corrección | Conserva significado original; no publica revisión implícita |

Son casos especificados, no pruebas ejecutadas en fase 0.

## 11 Decisiones pendientes y cierre de fase

| ID | Decisión | Regla vigente o tarea pendiente | Estado |
|---|---|---|---|
| D01 | Inicio de elegibilidad KPI-04 | Desde fecha prevista de cumplimiento; avance anterior separado en RO-02 | Confirmada por el usuario |
| D02 | Retiro antes de tres exigibles | RETIRADO, Evaluable: No, visible RO-01 y fuera de ambos conteos KPI-03 | Confirmada por el usuario |
| D03 | Significado histórico | Lo conocido al cierre; correcciones posteriores solo mediante revisión explícita auditable | Confirmada por el usuario |
| D04 | Versión lingüística y condiciones PSS-10 | Seleccionar traducción española identificada y documentar autorización aplicable | Pendiente documental |
| D05 | Edición exacta PCL-5 | Español estándar mensual oficial PCL-5_spanish_508_v16.pdf; portada 29 de agosto de 2023 | Identificada y documentada, fuente F05 |

Las decisiones D01 a D03 están cerradas y son obligatorias en las fases siguientes. La fase 0 entrega reglas, contratos, fuentes y 35 casos de aceptación; permanece D04 como pendiente documental. No se inventará aprobación de uso. La selección lingüística y condiciones de uso deben resolverse antes de activar el formulario PSS-10. El trabajo independiente de contenido autorizado puede continuar en una fase posterior si el usuario lo indica.

## 12 Orden y esfuerzo de las fases

| Fase | Entregable | Horas persona |
|---|---|---|
| 0 | Reglas, contratos y decisiones | 6 a 8 |
| 1 | OLTP, scripts, historial y base de acceso | 16 a 22 |
| 2 | Acceso y gestión operacional | 18 a 24 |
| 3 | Cuestionarios completos y puntuación | 24 a 34 |
| 4 | Generador sintético desde respuestas | 8 a 12 |
| 5 | Data Mart y ETL | 14 a 18 |
| 6 | Cinco KPI y cuatro reportes | 12 a 16 |
| 7 | Interpretación IA | 6 a 10 |
| 8 | Verificación integral y despliegue | 14 a 20 |
| 9 | Documentación y demostración | 8 a 10 |

Total estimado del plan: 126 a 174 horas persona; no es tiempo ya ejecutado. La fecha académica es 3 de diciembre de 2026. Cada fase informa entregable, scripts afectados y verificación. La autorización actual corresponde a la fase 0.

## 13 Fuentes oficiales consultadas

- F01 [CMU PSS puntuación y referencia temporal](https://www.cmu.edu/common-cold-project/measures-by-study/psychological-and-social-constructs/stress-measures/perceived-stress.html).
- F02 [CMU condiciones de uso y traducciones](https://www.cmu.edu/dietrich/psychology/stress-immunity-disease-lab/scales/index.html).
- F03 [National Center for PTSD guía PCL-5](https://www.ptsd.va.gov/professional/assessment/documents/using-PCL5.pdf).
- F04 [National Center for PTSD instrumento y versión española](https://ptsd.va.gov/professional/assessment/adult-sr/ptsd-checklist.asp).
- F05 [PCL-5 español estándar mensual edición identificada](https://www.ptsd.va.gov/professional/assessment/documents/PCL-5_spanish_508_v16.pdf).

Para D04 se localizó el [PSS español de diez ítems enlazado por CMU](https://www.cmu.edu/dietrich/psychology/stress-immunity-disease-lab/scales/pdf/spanishpss10.pdf). Su disponibilidad pública no acredita por sí sola autorización de reproducción. Falta identificar y documentar atribución, opciones legibles y condiciones de la traducción elegida antes de activarla.

Consulta: 24 de noviembre de 2026. Las fuentes fundamentan puntuación y condiciones de uso; no validan los umbrales operativos del proyecto para esta población.
