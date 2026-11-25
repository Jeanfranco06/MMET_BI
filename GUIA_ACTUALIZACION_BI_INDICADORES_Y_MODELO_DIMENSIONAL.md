# GUÍA DE CONTINUIDAD TÉCNICA Y METODOLÓGICA DE INTELIGENCIA DE NEGOCIOS (BI)
## MMET_BI — Universidad Nacional de Trujillo (Periodo 2026-II)

> **Continuidad de implementación:** consultar [Fase 0 Reglas y contratos](FASE_0_REGLAS_Y_CONTRATOS.md), que incorpora la captura obligatoria de cuestionarios completos y registra decisiones pendientes. Esta guía conserva antecedentes metodológicos; los conflictos se resolverán conforme a las decisiones expresas del usuario y a la especificación confirmada de fase 0.

> **Decisiones D01 a D03 confirmadas:** elegibilidad KPI-04 desde fecha prevista de cumplimiento, con avance previo separado en RO-02; retiro antes de tres exigibles visible en RO-01 como Retirado y Evaluable: No, fuera de ambos conteos KPI-03; históricos con información conocida al cierre y revisiones posteriores explícitas, identificadas y auditables. Estas reglas prevalecen sobre cualquier definición anterior de elegibilidad o reconstrucción temporal de esta guía.

> **Propósito de este documento:**  
> Servir como especificación directiva para que el equipo o agente continúe la actualización formal de la documentación académica/técnica (incluyendo el documento base Word/PDF) a partir de la definición de los **indicadores de gestión (KPIs)** y culmine con el **Análisis Dimensional Inicial** (identificación a partir de documentos fuente, marcas rojas/amarillas, matriz bus de hechos y dimensiones, y diseño lógico de tablas de hechos y dimensiones).

---

## 1. ESTADO ACTUAL Y PUNTO DE PARTIDA

1. **Estado previo:**  
   En la interfaz web ([Next.js + NestJS + SQL Server]) ya se implementaron los **4 reportes tabulares homologados** (con la misma estructura estricta del Reporte 3 de Continuidad: filtros superiores, tabla analítica responsive `mwg-table`, totales en `<tfoot>`, paginación y leyendas metodológicas al pie, sin gráficos distractores). Las imágenes/capturas de estos reportes ya están actualizadas.
2. **Lo que falta actualizar:**  
   Falta sincronizar la documentación formal del proyecto a partir de la **Hoja de Gestión de Indicadores**, la incorporación formal del **KPI-05**, la matriz de trazabilidad estratégica y el **Análisis Dimensional Inicial** completo (marcado de dimensiones en rojo y medidas en amarillo sobre los documentos fuente).

---

## 2. REGLAS METODOLÓGICAS NO NEGOCIABLES DEL NEGOCIO

Antes de redactar o calcular cualquier indicador, se deben respetar tres principios rectores:

1. **Separación estricta de escalas psicométricas (Regla de Oro):**
   * **PSS-10** (Escala de Estrés Percibido, 10 ítems, rango `0 a 40 puntos`).
   * **PCL-5** (Lista de Chequeo de TEPT para DSM-5, 20 ítems, rango `0 a 80 puntos`).
   * **Bajo ninguna circunstancia se suman, promedian o combinan puntajes de PSS-10 con PCL-5.** Miden constructos psicológicos distintos y tienen métricas independientes.
2. **Criterio de Par Válido en Ventana:**
   * Un par evaluativo es válido para medir reducción si y solo si:
     $$\text{en\_ventana} = 1 \quad \land \quad \text{estado\_validez} = \text{'VALIDO'} \quad \land \quad \text{es\_vigente} = 1 \quad \land \quad \text{fecha\_realizacion} \le \text{fecha\_corte}$$
   * En **PCL-5**, la evaluación inicial y final deben estar asociadas estrictamente al **mismo evento índice** (`id_evento_indice`).
   * Las evaluaciones completadas fuera de ventana (`en_ventana = 0`) computan para cumplimiento operativo (**KPI-04**), pero quedan **excluidas** de los pares de efectividad (**KPI-01**, **KPI-02**, **KPI-05**).
3. **Regla de Privacidad y Supresión Estadística:**
   * Si en cualquier cruce dimensional el número de casos o pares válidos es menor a 5 ($n < 5$), el valor se marca como **`SUPRIMIDO`** para preservar el anonimato estudiantil y evitar sesgos por muestras insuficientes.

---

## 3. ESPECIFICACIÓN DETALLADA DE LOS 5 INDICADORES CLAVE (KPIs)

### Matriz de Alineación Estratégica
* **OBJ-1 (Disminuir estrés y síntomas postraumáticos):** Apoyado por `E-3` $\rightarrow$ **KPI-01** y **KPI-02**.
* **OBJ-2 (Incrementar participación continua):** Apoyado por `E-1`, `E-2` $\rightarrow$ **KPI-03**.
* **OBJ-3 (Identificar prácticas con mayor reducción):** Apoyado por `E-4` $\rightarrow$ **KPI-05**.
* **Soporte Transversal / Calidad de Datos:** Apoyado por `E-3` $\rightarrow$ **KPI-04**.

---

### KPI-01: Reducción promedio del estrés percibido (PSS-10)
* **Propósito:** Medir el cambio promedio en el estrés percibido entre el inicio y el cierre del programa universitario en estudiantes con pares válidos.
* **Fórmula:**
  $$\text{ReduccionPSS} = \frac{\sum (\text{InicialPSS} - \text{FinalPSS})}{\text{ParesValidosPSS}}$$
* **Semáforo y Umbrales:**
  * **Bueno:** $\ge 4.0\text{ puntos}$ (Meta operativa de gestión).
  * **Regular:** $\ge 0.0\text{ y } < 4.0\text{ puntos}$.
  * **Malo:** $< 0.0\text{ puntos}$ (Incremento del estrés percibido).
* **Filtros y Granularidad:** Calculado sobre pares con `codigo_instrumento = 'PSS-10'`.

---

### KPI-02: Reducción promedio de síntomas postraumáticos (PCL-5)
* **Propósito:** Medir la disminución de síntomas de TEPT en estudiantes expuestos a eventos potencialmente traumáticos codificados.
* **Fórmula:**
  $$\text{ReduccionPCL} = \frac{\sum (\text{InicialPCL} - \text{FinalPCL})}{\text{ParesValidosPCL}}$$
* **Semáforo y Umbrales:**
  * **Bueno:** $\ge 10.0\text{ puntos}$ (Referencia de cambio clínicamente significativo sugerida por el *National Center for PTSD*).
  * **Regular:** $\ge 0.0\text{ y } < 10.0\text{ puntos}$.
  * **Malo:** $< 0.0\text{ puntos}$.
* **Filtros y Granularidad:** Exige par con idéntico `id_evento_indice`.

---

### KPI-03: Tasa de continuidad estudiantil
* **Propósito:** Medir la proporción de estudiantes evaluables que sostienen su participación activa en las prácticas de meditación y mindfulness al corte.
* **Criterio de Población Evaluable:** Estudiante que registró al menos una asistencia y para quien transcurrieron, desde su primera asistencia hasta la fecha de corte, **al menos 3 sesiones realizadas** (`estado_sesion = 'REALIZADA'`) a las que debía asistir.
* **Fórmula:**
  $$\text{TasaContinuidad (\%)} = \left( \frac{\text{EstudiantesContinuan}}{\text{EstudiantesEvaluables}} \right) \times 100$$
  *Donde $\text{EstudiantesContinuan} = \text{Activos} + \text{En\_Riesgo}$.*
* **Semáforo y Umbrales:**
  * **Bueno:** $\ge 80.0\%$
  * **Regular:** $\ge 60.0\%\text{ y } < 80.0\%$
  * **Malo:** $< 60.0\%$

---

### KPI-04: Tasa de cumplimiento de evaluaciones psicológicas
* **Propósito:** Controlar la proporción de evaluaciones exigibles (iniciales y finales) que fueron efectivamente completadas a la fecha de corte, como garantía de cobertura y control del sesgo de atrición.
* **Fórmula:**
  $$\text{TasaCumplimiento (\%)} = \left( \frac{\text{EvaluacionesElegiblesCompletadas}}{\text{EvaluacionesElegibles}} \right) \times 100$$
  *Completadas incluye tanto evaluaciones en ventana como tardías con resultado válido vigente.*
* **Semáforo y Umbrales:**
  * **Bueno:** $\ge 90.0\%$
  * **Regular:** $\ge 70.0\%\text{ y } < 90.0\%$
  * **Malo:** $< 70.0\%$

---

### KPI-05: Porcentaje de prácticas que cumplen la meta operativa (DETALLE ESPECÍFICO)
* **Código del Indicador:** `KPI-05`
* **Nombre Formal:** *Porcentaje de prácticas de meditación y mindfulness que cumplen la meta operativa de reducción sintomática.*
* **Objetivo de Negocio que Resuelve:** `OBJ-3` (*"Identificar las prácticas de meditación y mindfulness asociadas con mayores reducciones del estrés y los síntomas postraumáticos"*).
* **Estrategia Vinculada:** `E-4` (*"Comparar los cambios en el estrés percibido y los síntomas postraumáticos según el tipo de práctica, para identificar las asociadas con mayores reducciones y orientar decisiones sobre los programas"*).
* **Definición de Conceptos Clave:**
  1. **Práctica Evaluable:** Toda técnica de intervención (`P-01`, `P-02`, `P-03`, `P-04`, `MIXTO`) que cuenta con un tamaño de muestra suficiente al corte:
     $$\text{ParesValidos}_{\text{practica, instrumento}} \ge 5$$
  2. **Práctica que Cumple Meta Operativa:** Aquella práctica evaluable cuya reducción promedio alcanza el estándar *Bueno* del instrumento evaluado:
     * Para **PSS-10**: $\text{ReduccionPromedio} \ge 4.0\text{ puntos}$.
     * Para **PCL-5**: $\text{ReduccionPromedio} \ge 10.0\text{ puntos}$.
* **Fórmula Matemática:**
  $$\text{CumplimientoMetaPracticas}_{\text{instrumento}} (\%) = \left( \frac{\text{PracticasQueCumplenMeta}_{\text{instrumento}}}{\text{PracticasEvaluables}_{\text{instrumento}}} \right) \times 100$$
* **Semáforo y Estados de Gestión (sobre las 5 prácticas del catálogo):**
  * **Bueno (Verde):** $\ge 80.0\%$ (4 o 5 de las 5 prácticas alcanzan la meta operativa).
  * **Regular (Ámbar):** $\ge 60.0\%\text{ y } < 80.0\%$ (3 de las 5 prácticas alcanzan la meta; se requiere monitoreo de facilitadores).
  * **Malo (Rojo):** $< 60.0\%$ (Menos de 3 prácticas logran el impacto esperado; se requiere intervención curricular urgente).
* **Ventaja Metodológica en BI:**  
  Evita el error conceptual de crear una "reducción promedio combinada" que mezcle PSS-10 con PCL-5. El KPI-05 es una métrica porcentual de gestión que evalúa cuántas prácticas logran el estándar clínico/operativo de cada escala.

---

## 4. ANÁLISIS DIMENSIONAL INICIAL A PARTIR DE LOS DOCUMENTOS FUENTE

El método de diseño dimensional (Kimball / Hefesto) exige partir de los **documentos de salida (reportes)** para identificar los requisitos de información:
* **Marcas en ROJO:** Atributos descriptivos, filtros, agrupadores y jerarquías $\rightarrow$ **Dimensiones**.
* **Resaltados en AMARILLO:** Valores numéricos, conteos, sumatorias, promedios y porcentajes $\rightarrow$ **Medidas**.

Los 4 reportes implementados en la aplicación constituyen los documentos fuente definitivos:

### DOCUMENTOS FUENTE DEL SISTEMA (Reportes Tabulares)

```
+--------------------------------------------------------------------------------------------------+
| DOCUMENTOS FUENTE DEL SISTEMA (Reportes Tabulares)                                               |
+------------------------------------+-------------------------------------------------------------+
| RO-01 (Reporte 3): Continuidad     | Sustenta KPI-03          (HechoContinuidad)                  |
| RO-02 (Reporte 4): Evaluaciones    | Sustenta KPI-04          (HechoCumplimientoEvaluaciones)     |
| RG-01 (Reporte 1): Evolución       | Sustenta KPI-01 y KPI-02 (HechoResultadosEvaluacion)         |
| RG-02 (Reporte 2): Efectividad     | Sustenta KPI-05          (HechoResultadosEvaluacion)         |
+------------------------------------+-------------------------------------------------------------+
```

#### Tabla 8: Dimensiones y medidas identificadas en los reportes

| Reporte | Filas | Columnas | Filtros | Medidas |
| :--- | :--- | :--- | :--- | :--- |
| **RO-01** | Estudiante (código) | Estado de continuidad (atributos: programa, última asistencia, condición de evaluable) | Tiempo (semestre, fecha de corte); Programa; Práctica principal; Estado de continuidad; Estudiante | EstudiantesEvaluables (n); EstudiantesContinuan (n); TasaContinuidad (%); EstudiantesEvaluables por estado de continuidad (activo, en riesgo, abandono, retirado); SesionesExigibles (n); Asistencias (n); Inasistencias (n); PorcentajeAsistencia (%) |
| **RO-02** | Oportunidad de evaluación (Estudiante › Instrumento) | Momento de evaluación; Estado de evaluación (atributos: ventana prevista, fecha realizada, par válido) | Tiempo (semestre, fecha de corte); Programa; Instrumento; Estado de evaluación; Evento índice (PCL-5) | EvaluacionesElegibles (n); EvaluacionesElegiblesCompletadas (n); TasaCumplimiento (%); EvaluacionesElegibles por estado (completada en ventana, tardía, pendiente, vencida); ParesValidos (n) |
| **RG-01** | Instrumento y versión › Agrupación seleccionada (Programa, Facultad o Grupo etario) | Clasificación del cambio y estado del semáforo | Tiempo (semestre, fecha de corte); Instrumento; Criterio de agrupación; Programa; Práctica principal; Facultad o área; Grupo etario; Sexo; Evento índice (PCL-5) | ParesValidos (n); PromedioInicial; PromedioFinal; Reduccion (puntos) · KPI-01 y KPI-02; pares por clasificación del cambio (disminuyeron, sin cambio, aumentaron) |
| **RG-02** | Práctica principal (o Programa) › Instrumento | Condición de cumplimiento de meta (atributos: meta operativa, semáforo) | Tiempo (semestre, fecha de corte); Instrumento (PSS-10, PCL-5); Facultad o área; Nivel de detalle (práctica o programa) | ParesValidos (n); PromedioInicial; PromedioFinal; Reduccion (puntos); PracticasEvaluables (n); PracticasQueCumplenMeta (n); TasaCumplimientoMetaPracticas (%) · KPI-05 |

---

### DOCUMENTO FUENTE 1 (Reporte 1) — RG-01
**Nombre:** *Evolución del Estrés Percibido (PSS-10) y Síntomas Postraumáticos (PCL-5)*  
**Grano del Documento:** Instrumento $\times$ Dimensión Agrupadora (Programa / Facultad / Grupo Etario).

#### 🔴 Elementos a marcar en ROJO (Dimensiones y Atributos)
* `Tiempo` (Semestre Académico, Fecha de Corte).
* `Instrumento Psicológico` (Código: PSS-10, PCL-5; Versión, Rango de escala).
* `Programa` (Código de Programa, Nombre de Cohorte, Estado del Programa).
* `Práctica Principal` (Código P-01..P-04, MIXTO; Nombre).
* `Estudiante - Atributos Demográficos` (Facultad/Área, Grupo Etario [18-20, 21-23, 24-26, 27+], Sexo [F, M]).
* `Evento Índice` (Código y Categoría de trauma codificado — exclusivo para filas PCL-5).
* `Semáforo de Estado` (Bueno, Regular, Malo, Suprimido).

#### 🟡 Elementos a resaltar en AMARILLO (Medidas)
* `ParesValidos (n)`
* `PromedioInicial`
* `PromedioFinal`
* `ReduccionPromedio (pts)` [Inicial - Final]
* `EstudiantesDisminuyeron (n)`
* `EstudiantesSinCambio (n)`
* `EstudiantesAumentaron (n)`
* Totales independientes al pie: `TotalParesPSS`, `ReduccionPromedioPSS`, `TotalParesPCL`, `ReduccionPromedioPCL`.

---

### DOCUMENTO FUENTE 2 (Reporte 2)
**Nombre:** *Comparativo de Efectividad y Cumplimiento de Meta por Práctica (KPI-05)*  
**Grano del Documento:** Práctica Principal (o Programa Cohorte) $\times$ Instrumento Psicológico al Corte.

#### 🔴 Elementos a marcar en ROJO (Dimensiones y Atributos)
* `Práctica Principal` (Código de Práctica, Nombre de Práctica, Tipo: Unicomponente vs Mixto).
* `Programa / Cohorte` (Código Programa).
* `Instrumento` (PSS-10, PCL-5).
* `Tiempo` (Fecha de Corte, Semestre).
* `Facultad / Área` (Filtro institucional).
* `Condición de Cumplimiento de Meta` (Cumple meta [Sí], No cumple [No], No evaluable [n < 5]).
* `Estado Semáforo` (Bueno, Regular, Malo).

#### 🟡 Elementos a resaltar en AMARILLO (Medidas)
* `ParesValidos (n)`
* `PromedioInicial`
* `PromedioFinal`
* `ReduccionPromedio (pts)`
* `MetaOperativa (pts)` ($\ge 4.0$ en PSS-10; $\ge 10.0$ en PCL-5)
* `PracticasEvaluables (n)`
* `PracticasQueCumplenMeta (n)`
* `TasaCumplimientoMetaPracticas (%)` (**KPI-05**)

---

### DOCUMENTO FUENTE 3 (Reporte 3)
**Nombre:** *Seguimiento de Continuidad y Abandono por Estudiante (KPI-03)*  
**Grano del Documento:** Estudiante Asignado $\times$ Programa a la Fecha de Corte.

#### 🔴 Elementos a marcar en ROJO (Dimensiones y Atributos)
* `Estudiante` (Código Anonimizado UNT26-EST-XXXX, Facultad/Área, Ciclo Académico).
* `Programa` (Código Programa, Cohorte).
* `Práctica Principal` (Código y Nombre).
* `Tiempo` (Fecha de Corte, Fecha de Primera Asistencia, Fecha de Última Asistencia).
* `Estado de Continuidad` (ACTIVO, EN_RIESGO, ABANDONO, RETIRADO, NO_EVALUABLE).
* `Condición de Evaluable` (Flag Sí/No $\ge 3$ sesiones realizadas).

#### 🟡 Elementos a resaltar en AMARILLO (Medidas)
* `SesionesExigibles (n)` (Solo sesiones realizadas $\le$ fecha de corte desde su primera asistencia).
* `Asistencias (n)`
* `Inasistencias (n)`
* `PorcentajeAsistencia (%)` [(Asistencias / SesionesExigibles) $\times$ 100]
* `EstudiantesEvaluables (n)`
* `EstudiantesContinuan (n)` (Activos + En riesgo)
* `TasaContinuidad (%)` (**KPI-03**)

---

### DOCUMENTO FUENTE 4 (Reporte 4)
**Nombre:** *Control de Evaluaciones Psicológicas Pendientes y Completadas (KPI-04)*  
**Grano del Documento:** Oportunidad de Evaluación (Estudiante $\times$ Programa $\times$ Instrumento $\times$ Momento).

#### 🔴 Elementos a marcar en ROJO (Dimensiones y Atributos)
* `Instrumento Psicológico` (Código PSS-10, PCL-5).
* `Evento Índice` (Código Evento Local, Categoría Evento Índice — para PCL-5; "No aplica" para PSS-10).
* `Estudiante` (Código Anonimizado, Facultad/Área).
* `Programa` (Código Programa, Semestre).
* `Momento de Evaluación` (INICIAL, FINAL).
* `Tiempo` (Fecha Ventana Inicio, Fecha Ventana Fin, Fecha Realización, Fecha Corte).
* `Estado de Evaluación` (COMPLETADA_EN_VENTANA, COMPLETADA_TARDIA, PENDIENTE_EN_VENTANA, VENCIDA).
* `Condición de Par Válido` (Flag booleano: si forma parte de un par inicial-final vigente en ventana).

#### 🟡 Elementos a resaltar en AMARILLO (Medidas)
* `PuntajeTotal` (0 a 40 para PSS-10; 0 a 80 para PCL-5).
* `NumeroVersion` (v1 original, v2+ correcciones auditadas).
* `EvaluacionesElegibles (n)`
* `CompletadasEnVentana (n)`
* `CompletadasTardias (n)`
* `TotalCompletadas (n)`
* `PendientesEnVentana (n)`
* `Vencidas (n)`
* `EnParValido (n)`
* `TasaCumplimiento (%)` (**KPI-04**)

---

## 5. MATRIZ BUS DE HECHOS Y DIMENSIONES (ARQUITECTURA KIMBALL)

Para evitar redundancias y errores conceptuales, **no todas las dimensiones participan en todos los hechos**. Se definen tres procesos de negocio (Tablas de Hechos) y un conjunto de **Dimensiones Conformadas**:

| Dimensión | Tipo de Dimensión | `HechoResultadosEvaluacion`<br>*(KPI-01, KPI-02, KPI-05)* | `HechoContinuidad`<br>*(KPI-03)* | `HechoCumplimientoEvaluaciones`<br>*(KPI-04)* |
| :--- | :---: | :---: | :---: | :---: |
| **`DimTiempo`** | Conformada | **X** | **X** | **X** |
| **`DimEstudiante`** | Conformada | **X** | **X** | **X** |
| **`DimPrograma`** | Conformada | **X** | **X** | **X** |
| **`DimPractica`** | Conformada | **X** | **X** | **X** |
| **`DimInstrumento`** | Específica clínica | **X** | — *(No aplica a sesiones)* | **X** |
| **`DimEventoIndice`** | Específica clínica | **X** *(Solo PCL-5; "N/A" en PSS)* | — | **X** *(Solo PCL-5; "N/A" en PSS)* |
| **`DimEstadoContinuidad`** | Específica operativa | — | **X** *(Activo, Riesgo, Abandono)* | — |
| **`DimMomento`** | Específica evaluativa | — *(Grano es el par completo)* | — | **X** *(INICIAL / FINAL)* |
| **`DimEstadoEvaluacion`** | Específica evaluativa | — | — | **X** *(En ventana, Tardía, etc.)* |

---

## 6. ESPECIFICACIÓN DE TABLAS DE HECHOS

### Tabla de Hechos 1: `HechoResultadosEvaluacion`
* **Proceso de Negocio:** Medición del impacto psicológico antes y después de la intervención de meditación y mindfulness.
* **Granularidad:** Un par de evaluaciones válidas (Inicial y Final) por estudiante asignado a un programa, para un instrumento específico al corte.
* **Llaves Foráneas (FK):**
  * `SK_Tiempo_Corte` $\rightarrow$ `DimTiempo`
  * `SK_Estudiante` $\rightarrow$ `DimEstudiante`
  * `SK_Programa` $\rightarrow$ `DimPrograma`
  * `SK_Practica` $\rightarrow$ `DimPractica`
  * `SK_Instrumento` $\rightarrow$ `DimInstrumento`
  * `SK_EventoIndice` $\rightarrow$ `DimEventoIndice` (ID para PCL-5; registro predeterminado `-1: No aplica` para PSS-10).
* **Métricas y Hechos Numéricos:**
  * `PuntajeInicial` (Entero)
  * `PuntajeFinal` (Entero)
  * `PuntosReduccion` (`PuntajeInicial - PuntajeFinal`)
  * `EsReduccion` (1 si `PuntosReduccion > 0`, sino 0)
  * `EsSinCambio` (1 si `PuntosReduccion = 0`, sino 0)
  * `EsIncremento` (1 si `PuntosReduccion < 0`, sino 0)
  * `CumpleMetaOperativa` (1 si `PuntosReduccion >= MetaInstrumento`, sino 0)
  * `CantidadPares` (Constante 1)

---

### Tabla de Hechos 2: `HechoContinuidad`
* **Proceso de Negocio:** Monitoreo periódico de asistencia, riesgo de deserción y abandono operativo.
* **Granularidad:** Una instantánea de continuidad acumulada por estudiante y programa a la fecha de corte.
* **Llaves Foráneas (FK):**
  * `SK_Tiempo_Corte` $\rightarrow$ `DimTiempo`
  * `SK_Estudiante` $\rightarrow$ `DimEstudiante`
  * `SK_Programa` $\rightarrow$ `DimPrograma`
  * `SK_PracticaPrincipal` $\rightarrow$ `DimPractica`
  * `SK_EstadoContinuidad` $\rightarrow$ `DimEstadoContinuidad`
* **Métricas y Hechos Numéricos:**
  * `SesionesExigibles` (Conteo de sesiones `REALIZADA` desde la 1ª asistencia hasta el corte)
  * `SesionesAsistidas` (Conteo de registros `ASISTIO`)
  * `SesionesInasistidas` (Conteo de registros `INASISTENCIA`)
  * `MinutosTotalesAsistidos` (Sumatoria de `minutos_asistidos`)
  * `EsEvaluable` (1 si `SesionesExigibles >= 3`, sino 0)
  * `Continua` (1 si `Estado IN ('ACTIVO', 'EN_RIESGO')` y `EsEvaluable = 1`, sino 0)
  * `CantidadAsignaciones` (Constante 1)

---

### Tabla de Hechos 3: `HechoCumplimientoEvaluaciones`
* **Proceso de Negocio:** Control de convocatorias y aplicación oportuna de baterías psicométricas.
* **Granularidad:** Una oportunidad de evaluación programada por estudiante, programa, instrumento y momento evaluativo.
* **Llaves Foráneas (FK):**
  * `SK_Tiempo_Corte` $\rightarrow$ `DimTiempo`
  * `SK_Tiempo_Previsto` $\rightarrow$ `DimTiempo`
  * `SK_Tiempo_Realizacion` $\rightarrow$ `DimTiempo` (o `-1: Pendiente/No realizada`)
  * `SK_Estudiante` $\rightarrow$ `DimEstudiante`
  * `SK_Programa` $\rightarrow$ `DimPrograma`
  * `SK_PracticaPrincipal` $\rightarrow$ `DimPractica`
  * `SK_Instrumento` $\rightarrow$ `DimInstrumento`
  * `SK_EventoIndice` $\rightarrow$ `DimEventoIndice`
  * `SK_Momento` $\rightarrow$ `DimMomento` (`INICIAL`, `FINAL`)
  * `SK_EstadoEvaluacion` $\rightarrow$ `DimEstadoEvaluacion`
* **Métricas y Hechos Numéricos:**
  * `PuntajeObtenido` (Puntaje válido vigente o `NULL`)
  * `NumeroVersion` (Versión del resultado registrado)
  * `EsElegible` (1 si `aplicable = 1` y ventana inició $\le$ corte, sino 0)
  * `EsCompletadaEnVentana` (1 si se realizó en ventana reglamentaria, sino 0)
  * `EsCompletadaTardia` (1 si se realizó fuera de ventana pero $\le$ corte, sino 0)
  * `EsPendiente` (1 si ventana fin $\ge$ corte y no tiene resultado, sino 0)
  * `EsVencida` (1 si ventana fin $<$ corte y no tiene resultado, sino 0)
  * `EsParValido` (1 si forma parte de un par completo vigente, sino 0)
  * `CantidadOportunidades` (Constante 1)

---

## 7. CHECKLIST PARA LA ACTUALIZACIÓN DE DOCUMENTOS FORMALES

Al abrir el documento académico (`.docx` / informe final), ejecutar las siguientes acciones en este orden:

- [ ] **Sección de Objetivos y Estrategias:** Confirmar que `OBJ-3` y `E-4` hacen referencia explícita a la evaluación comparativa mediante **KPI-05**.
- [ ] **Tabla 9 (Hoja de Gestión de Indicadores):**
  - Añadir la fila de **KPI-05** con su fórmula porcentual, umbrales ($\ge 80\%$, $60\text{ a } <80\%$, $<60\%$) y condición de práctica evaluable ($\ge 5\text{ pares}$).
  - Aclarar que KPI-01 y KPI-02 son indicadores clínicos/psicométricos de magnitud, KPI-03 y KPI-04 son tasas operativas, y KPI-05 es un indicador gerencial de efectividad metodológica.
- [ ] **Tabla 10 (Fichas Técnicas de los Indicadores):**
  - Incorporar la ficha técnica completa de **KPI-05** detallada en el apartado 3 de esta guía.
- [ ] **Sección de Análisis Dimensional (Documentos Fuente):**
  - Sustituir las descripciones anteriores por los **4 Documentos Fuente Tabulares** homologados (Reportes 1 a 4).
  - Incluir el marcado explícito: listar bajo cada reporte qué columnas van en **ROJO** (dimensiones/atributos) y cuáles van en **AMARILLO** (medidas/hechos numéricos).
- [ ] **Matriz Bus y Tablas de Hechos:**
  - Actualizar la matriz bus con las 3 tablas de hechos (`HechoResultadosEvaluacion`, `HechoContinuidad`, `HechoCumplimientoEvaluaciones`).
  - Justificar por qué no todas las dimensiones están en todos los hechos (ej. `DimMomento` en cumplimiento pero no en resultados pareados; ausencia de `DimInstrumento` en continuidad).
- [ ] **Reglas de Integridad:**
  - Dejar asentado que la sesión se considera `REALIZADA` solo mediante ejecución efectiva, que las sesiones canceladas o futuras no generan inasistencia, y que PSS-10 y PCL-5 jamás se suman.
