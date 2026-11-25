# MMET BI — Sistema de Inteligencia de Negocios y Gestión OLTP (2026-II)

> **Reglas del sistema:** [Fase 0 Reglas y contratos](FASE_0_REGLAS_Y_CONTRATOS.md). Documenta las reglas confirmadas para los KPI, reportes, cuestionarios y cortes históricos. Las secciones históricas de este README se mantienen por contexto; para el comportamiento actual de captura, consulte la sección de fases implementadas abajo.

> **Reglas confirmadas D01 a D03 (implementadas de punta a punta):** KPI-04 cuenta desde la fecha prevista de cumplimiento (`fecha_ventana_fin <= @fecha_corte`); RO-02 muestra el avance previo por separado. El retiro antes de tres sesiones se clasifica en RO-01 y el ETL como `Retirado` y `Evaluable: No`, excluido de KPI-03. Las correcciones de respuestas de cuestionario crean versiones (`v2+`) y conservan su historial completo. Todas las reglas D01–D03 operan de forma integral en el OLTP (`dbo.*`), el ETL idempotente (`dm.usp_ejecutar_etl`), el Data Mart (`dm.*`) y los 4 reportes BI.

### Estado de implementación (OLTP, Cuestionarios y Data Mart en SQL Server)

El detalle histórico de fases 1 a 3 está en [Implementación de fases 1 a 3](FASES_1_A_3_IMPLEMENTACION.md).

- **Motor oficial:** Microsoft SQL Server (`sql_server/`), con **dos bases de datos físicas separadas** en la misma instancia: **`MMET_BI_OLTP`** (transaccional, esquema `dbo.*`) y **`MMET_BI_DM`** (Data Mart analítico, esquema `dm.*`). La carpeta `sql/` corresponde a scripts **legados (PostgreSQL)** y no forma parte del flujo oficial del proyecto.
- **OLTP (`MMET_BI_OLTP`, esquema `dbo.*`):** Contiene tablas versionadas para formularios, ítems, opciones, borradores, respuestas por ítem, cuentas, sesiones autenticadas y **trazabilidad temporal de asistencias** (`actualizado_en`, `dbo.historial_asistencias` y trigger `dbo.trg_auditar_asistencias` que evita sobrescrituras silenciosas).
- **PCL-5 español (`VA-2023-08-29`):** Publicado (20 ítems, escala 0–4, total 0–80, corrección versionada). La fuente señala que esta traducción no ha sido validada en investigación publicada.
- **PSS-10 español (`PSS10-ES-2026`):** Habilitado y publicado (10 ítems, escala 0–4, inversión automática en ítems 4, 5, 7 y 8, puntaje total 0–40), operando de punta a punta igual que PCL-5.
- **Data Mart (`MMET_BI_DM`, esquema `dm.*`) y ETL idempotente (`[MMET_BI_DM].dm.usp_ejecutar_etl`):** Base de datos analítica independiente con esquema en constelación (dimensiones conformadas y específicas, 3 tablas de hechos con restricciones `UNIQUE` de grano, vista agregada `dm.vw_HechoEfectividadPractica` para KPI-05, control de ejecuciones e incidencias de calidad). Extrae desde `[MMET_BI_OLTP].dbo.*` aplicando las reglas D01, D02 y exclusión de tardías/anomalías.
- Las evaluaciones históricas que solo contienen totales permanecen intactas y sin respuestas reconstruidas.

Sistema full-stack conectado a **Microsoft SQL Server (`MMET_BI_OLTP` + `MMET_BI_DM`)** para la gestión operacional y el análisis de cambios en el estrés percibido (**PSS-10**) y los síntomas postraumáticos (**PCL-5**) asociados a programas universitarios de meditación y mindfulness (`P-01` a `P-04` y `MIXTO`).

---

## 1. Contexto del Negocio y BI

### Propósito del Proyecto
Solución de Inteligencia de Negocios y soporte transaccional OLTP diseñada para el caso universitario **UNT Trujillo (periodo `2026-II`)**. Permite evaluar la evolución del estrés percibido y síntomas postraumáticos en estudiantes participantes en programas de meditación y mindfulness, así como monitorear la continuidad de asistencia y el cumplimiento de evaluaciones psicológicas para respaldar decisiones de gestión académica y bienestar universitario.

> **Principio metodológico clave:** Las escalas **PSS-10** (0–40 pts) y **PCL-5** (0–80 pts) miden constructos distintos y **nunca se suman** entre sí.

### Objetivos del Negocio

| Código | Objetivo |
| :--- | :--- |
| **`OBJ-1`** | Disminuir los niveles de estrés percibido y síntomas postraumáticos en estudiantes universitarios. |
| **`OBJ-2`** | Incrementar la participación continua de los estudiantes universitarios en prácticas de meditación y mindfulness. |
| **`OBJ-3`** | Identificar las prácticas de meditación y mindfulness asociadas con mayores reducciones del estrés y los síntomas postraumáticos. |

### Estrategias del Negocio

| Código | Estrategia | Objetivos que apoya |
| :--- | :--- | :--- |
| **`E-1`** | Organizar y programar sesiones de meditación y mindfulness considerando diferentes técnicas (`P-01`..`P-04`, `MIXTO`), modalidades, horarios y duraciones. | `OBJ-1`, `OBJ-2` |
| **`E-2`** | Controlar la asistencia y continuidad de los estudiantes, identificando las sesiones realizadas, las ausencias y los casos de abandono. | `OBJ-2` |
| **`E-3`** | Aplicar evaluaciones psicológicas estandarizadas (`PSS-10` y, cuando corresponda, `PCL-5`), registrando resultados iniciales y finales. | `OBJ-1`, `OBJ-3` |
| **`E-4`** | Comparar los cambios en el estrés percibido y los síntomas postraumáticos según el tipo de práctica para orientar decisiones sobre los programas. | `OBJ-3` |

### Indicadores Clave (KPIs) y Semáforos de Gestión

| KPI | Descripción | Bueno | Regular | Malo | Notas de interpretación |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **`KPI-01`** | Reducción promedio en **PSS-10** (pares válidos en ventana) | `>= 4 pts` | `0 a < 4 pts` | `< 0 pts` | Meta operativa inicial de gestión. |
| **`KPI-02`** | Reducción promedio en **PCL-5** (pares válidos con mismo evento índice y en ventana) | `>= 10 pts` | `0 a < 10 pts` | `< 0 pts` | Referencia de cambio clínicamente significativo (*National Center for PTSD*). |
| **`KPI-03`** | Tasa de continuidad en estudiantes evaluables | `>= 80%` | `60% a < 80%` | `< 60%` | Calculado sobre evaluables (≥ 3 sesiones realizadas desde su primera asistencia). |
| **`KPI-04`** | Tasa de cumplimiento de evaluaciones elegibles | `>= 90%` | `70% a < 90%` | `< 70%` | Mide cumplimiento (incluye tardías válidas), no reducción de síntomas. |
| **`KPI-05`** | Porcentaje de prácticas evaluables (`n >= 5`) que cumplen meta operativa | `>= 80%` | `60% a < 80%` | `< 60%` | Evalúa por separado PSS-10 (`>= 4 pts`) y PCL-5 (`>= 10 pts`). |

### Reportes del Sistema

* **`RO-01` (Operacional):** Seguimiento de continuidad y abandono por estudiante (`KPI-03`).
* **`RO-02` (Operacional):** Control de evaluaciones psicológicas pendientes y completadas (`KPI-04`).
* **`RG-01` (Gestión):** Evolución general del estrés percibido (`PSS-10`) y síntomas postraumáticos (`PCL-5`) (`KPI-01`, `KPI-02`).
* **`RG-02` (Gestión):** Comparativo de efectividad y cumplimiento de meta por tipo de práctica (`P-01` a `P-04` y `MIXTO`) (`KPI-05`).

---

## 2. Arquitectura y Estructura del Proyecto

* **Base de Datos OLTP y Data Mart (`sql_server/` — motor oficial):** Microsoft SQL Server 2019 / 2022 (`T-SQL`).
  * `sql_server/01_crear_bd_oltp_sqlserver.sql`: esquema canónico completo OLTP (`dbo.*`, incluyendo `dbo.historial_asistencias` y `dbo.trg_auditar_asistencias`). **Destructivo:** elimina y vuelve a crear las tablas; usar solo para reconstruir una base vacía/de prueba.
  * `sql_server/02_poblar_datos_10k_sqlserver.sql`: datos sintéticos de demostración. **Destructivo:** limpia el dataset antes de poblarlo; no usar como actualización.
  * `sql_server/03_actualizar_cuestionarios_y_acceso_sqlserver.sql`: actualización incremental idempotente, no destructiva (cuestionarios, acceso y trazabilidad temporal de asistencias).
  * `sql_server/04_configurar_versiones_cuestionarios_sqlserver.sql`: carga idempotente y publicación de versiones activas en español de **PCL-5** (20 ítems) y **PSS-10** (10 ítems, inversión automática en 4, 5, 7 y 8).
  * `sql_server/05_verificar_cuestionarios_sqlserver.sql`: valida estructura, publicación de PCL-5 y PSS-10, puntuación por ítem y trazabilidad de asistencias.
  * `sql_server/06_crear_datamart_sqlserver.sql`: crea la base de datos física **`MMET_BI_DM`** (si no existe) y el modelo físico del Data Mart en su esquema `dm` (esquema en constelación: 9 dimensiones, 3 tablas de hechos con grano garantizado, vista `dm.vw_HechoEfectividadPractica` y tablas de control ETL).
  * `sql_server/07_etl_cargar_datamart_sqlserver.sql`: crea en **`MMET_BI_DM`** el procedimiento idempotente `dm.usp_ejecutar_etl @fecha_corte` (extrae de `[MMET_BI_OLTP].dbo.*`, aplica reglas D01, D02 y control de calidad) y ejecuta la carga inicial de cortes clave 2026-II (incluyendo `2026-11-23`).
  * `sql_server/08_verificar_datamart_sqlserver.sql`: verifica sobre **`MMET_BI_DM`** conteos, ausencia de duplicados de grano, idempotencia, incidencias de calidad y cálculo oficial de `KPI-01` a `KPI-05` al corte `2026-11-23`.
* **Carpeta `sql/` (legado):** Scripts históricos de PostgreSQL conservados solo como referencia; **no usar** en el despliegue ni en el flujo oficial del proyecto.
* **Backend (`backend/`):** NestJS 10 + TypeScript (`mssql` / `msnodesqlv8`), expuesto en el puerto `4000` bajo el prefijo global `/api`. La cookie de sesión es HttpOnly, tiene vencimiento y se almacena en SQL como hash del token.
  * `src/database/`: Dos pools de conexión a SQL Server vía **Windows Auth** (`msnodesqlv8`) o **SQL Auth** (`mssql` / Tedious): pool principal sobre **`MMET_BI_OLTP`** (`query`) y pool analítico sobre **`MMET_BI_DM`** (`queryDm`).
  * `src/analytics/`: Consultas analíticas exclusivamente sobre el Data Mart **`MMET_BI_DM`** (`queryDm` -> `dm.*`) para `KPI-01` a `KPI-05` y reportes (`RO-01`, `RO-02`, `RG-01`, `RG-02`).
  * `src/ai/`: Interpretación asistida por IA generativa (`RQ-BI-15`) vía API compatible con OpenAI (Alibaba Cloud Model Studio / Qwen por defecto), con supresión `n < 5` y disclaimer no clínico.
  * `src/auth/`: Inicio/cierre de sesión, gestión de cuentas por ADMIN y autorización por rol.
  * `src/cuestionarios/`: Oportunidades del estudiante, borrador, envío completo, puntuación en servidor y correcciones con versiones.
  * `src/operacion/`: Gestión operacional de asistencias. El endpoint antiguo de puntaje manual está deshabilitado.
* **Frontend (`frontend/`):** Next.js 15 + React 19 + Tailwind CSS + Apache ECharts (`echarts`), expuesto en el puerto `3000`.
  * `src/components/`: Dashboard analítico (`DashboardApp.tsx`), reporte de continuidad (`ContinuidadReport.tsx`), vista operacional (`OperacionView.tsx`), gráficos (`EChartBox.tsx`), tablas responsivas (`ResponsiveTable.tsx`) y semáforos (`SemaforoBadge.tsx`).
  * `src/lib/api.ts`: Cliente HTTP hacia el backend (`NEXT_PUBLIC_API_URL`).
  * `StudentEvaluations.tsx`: Portal de estudiante para completar formularios, guardar borradores y enviarlos.

---

## 3. Modelo de Datos OLTP (`MMET_BI_OLTP`)

### Tablas principales

| Grupo | Tablas |
| :--- | :--- |
| **Catálogos** | `dbo.cat_practicas`, `dbo.cat_instrumentos`, `dbo.cat_categorias_evento_indice`, `dbo.cat_variables_complementarias` |
| **Núcleo operativo** | `dbo.estudiantes`, `dbo.programas`, `dbo.sesiones`, `dbo.asignaciones`, `dbo.asistencias` |
| **Evaluación y clínica** | `dbo.eventos_indice`, `dbo.oportunidades_evaluacion`, `dbo.resultados_evaluacion`, `dbo.mediciones_complementarias` |
| **Auditoría de estados** | `dbo.historial_estados_sesion`, `dbo.historial_estados_asignacion` |

### Reglas de negocio e integridad (SQL Server)

1. **Prácticas (`P-01` a `P-04` y `MIXTO`):**
   * Un programa puede tener `MIXTO` como práctica principal, pero cada sesión individual debe ejecutarse con una técnica concreta (`P-01` a `P-04`). El trigger `dbo.trg_validar_sesion_practica` impide asignar `es_mixto = 1` en `dbo.sesiones`.
2. **Ciclo de vida de sesiones (`dbo.sesiones`):**
   * Estados permitidos: `PROGRAMADA` (por defecto), `REALIZADA`, `CANCELADA`, `NO_REALIZADA`.
   * **Condición de sesión realizada:** Una sesión es `REALIZADA` cuando fue efectivamente ejecutada en su fecha/hora programada (`EJECUCION_NORMAL`). No existe transición automática por reloj ni trigger temporal; la transición se realiza explícitamente mediante actualización operativa (`UPDATE` de `estado_sesion` + `fecha_cambio_estado`) y registro en `dbo.historial_estados_sesion`.
   * **`fecha_hora_inicio` vs `fecha_cambio_estado`:** `fecha_hora_inicio` almacena el inicio programado de la sesión; `fecha_cambio_estado` es una marca de auditoría de cuándo se modificó `estado_sesion` por última vez.
   * **Regla de no perjuicio:** El trigger `dbo.trg_validar_asistencia_sesion` (y el servicio `OperacionService`) prohíbe registrar `ASISTIO` o `INASISTENCIA` sobre sesiones que no estén en estado `REALIZADA`. Las sesiones `CANCELADA`, `NO_REALIZADA` o `PROGRAMADA` (futuras) no generan faltas.
3. **Continuidad y evaluabilidad (`RO-01` / `KPI-03`):**
   * Para una fecha de corte dada (`@corte`), solo se computan como **sesiones exigibles** aquellas con `estado_sesion = 'REALIZADA'` y `fecha_sesion <= @corte` ocurridas desde la primera asistencia del estudiante.
   * Un estudiante es **evaluable** si acumula **al menos 3 sesiones realizadas** desde su primera asistencia hasta la fecha de corte; de lo contrario figura como `NO_EVALUABLE`.
   * Clasificación de evaluables:
     * `ACTIVO`: asistió a la última sesión exigible.
     * `EN_RIESGO`: faltó a la última, pero asistió al menos a una de las 3 últimas.
     * `ABANDONO`: faltó a las 3 últimas sesiones exigibles.
     * `RETIRADO`: registra retiro formal en `asignaciones` / `RETIRO_BAJA`.
4. **Evaluaciones (`PSS-10` y `PCL-5`) y versionado:**
   * `PSS-10` (0–40 pts) aplica a todas las asignaciones (`INICIAL` y `FINAL`).
   * `PCL-5` (0–80 pts) requiere un evento índice (`dbo.eventos_indice`); los pares `INICIAL` y `FINAL` se vinculan al mismo `id_evento_indice`. Los casos sin evento índice pueden quedar registrados como `aplicable = 0` (`SIN_EVENTO_INDICE`).
   * **Ventana reglamentaria:** Un resultado registrado fuera de `[fecha_ventana_inicio, fecha_ventana_fin]` se marca con `en_ventana = 0` (válido para cumplimiento `KPI-04`, pero excluido de comparativos pareados `KPI-01` / `KPI-02`).
   * **Versionado de correcciones:** Cada oportunidad mantiene un único resultado vigente (`es_vigente = 1`, `estado_validez = 'VALIDO'`). Las correcciones marcan la versión anterior como `REEMPLAZADO` (`es_vigente = 0`) e insertan una nueva versión enlazada por `id_resultado_reemplazado` con su `motivo_correccion`.

---

## 4. Poblamiento de Datos (`02_poblar_datos_10k_sqlserver.sql`)

* **Volumen generado:** 1,000 estudiantes, 15 programas (`12 FINALIZADO`, `3 ACTIVO`), 150 sesiones (10 por programa), ~1,330 asignaciones (incluye ~33% con segunda inscripción), ~10,500+ asistencias, eventos índice (~40% de estudiantes), oportunidades de evaluación, resultados con casos tardíos y correcciones `v1 -> v2`, y mediciones complementarias (`HRV_RMSSD`, `HORAS_SUENO`, `AFECTO_POSITIVO`).
* **Características técnicas:**
  * **Idempotente y atómico:** Ejecuta limpieza en orden inverso de FKs, `RESEED` dinámico de identidades y `SET XACT_ABORT ON` dentro de una transacción.
  * **Determinístico:** Emplea `HASHBYTES('SHA2_256', ...)` para reproducibilidad exacta y aproximación normal (Irwin-Hall) calibrada para los puntajes basales y reducciones por práctica.
* **Consideraciones conocidas del dataset sintético:**
  * En los 3 programas `ACTIVO`, las sesiones 9 y 10 quedan `PROGRAMADA`, pero sesiones intermedias hasta la 8 (por ejemplo, inicios de octubre extendiéndose a inicios de diciembre) pueden quedar como `REALIZADA`; las consultas analíticas filtran correctamente con `fecha_sesion <= @corte`.
  * En programas finalizados, un pequeño porcentaje (~14%) de perfiles `RETIRADO` o `SIN_INICIO` recibe resultado `FINAL` para validar el funcionamiento de los filtros de evaluabilidad.

---

## 5. Endpoints de la API (`http://localhost:4000/api`)

### Analítica (`/api/analytics`)
* `GET /api/analytics/filtros` — Catálogos de prácticas, programas, facultades y periodos.
* `GET /api/analytics/resumen` — KPIs globales y resúmenes por corte (`corte`, `id_programa`, `id_practica`, `facultad`).
* `GET /api/analytics/impacto-practicas` — Comparativo pareado de mejora por práctica (`instrumento`: `PSS-10` | `PCL-5`, `corte`, `facultad`).
* `GET /api/analytics/continuidad` — Reporte operacional `RO-01` / `KPI-03` paginado (`corte`, `semestre`, `id_programa`, `id_practica`, `estado`, `buscar`, `page`, `pageSize`).
* `GET /api/analytics/cumplimiento` — Control de evaluaciones `RO-02` / `KPI-04` (`corte`, `id_programa`, `instrumento`).
* `GET /api/analytics/evolucion` — Reporte gerencial `RG-01` / `KPI-01` y `KPI-02`.
* `GET /api/analytics/impacto-practicas` — Reporte gerencial `RG-02` / `KPI-05` por práctica principal y facultad.

### Operación (`/api/operacion`)
* `GET /api/operacion/sesiones` — Listado de sesiones con conteo de asistencias e inasistencias (`id_programa`).
* `POST /api/operacion/sesiones` — Programa una nueva sesión dentro de un programa existente (`ADMIN`, `COORDINACION`).
* `GET /api/operacion/oportunidades-abiertas` — Oportunidades de evaluación aplicables y su resultado vigente (`id_programa`).
* `POST /api/operacion/asistencias` — Registra o actualiza asistencia (`MERGE`) validando que la sesión esté `REALIZADA` y registrando auditoría temporal.
* `POST /api/operacion/etl/ejecutar` — Ejecuta `EXEC [MMET_BI_DM].dm.usp_ejecutar_etl @fecha_corte` y devuelve el log de carga e incidencias desde `MMET_BI_DM` (`ADMIN`).

### IA Generativa (`/api/ai` — RQ-BI-15)
* `POST /api/ai/interpretar-evaluacion` — Interpretación preliminar anónima de un resultado PSS-10 o PCL-5 con disclaimer explícito no clínico.
* `POST /api/ai/interpretar-reporte` — Resumen ejecutivo de `RO-01`, `RO-02`, `RG-01` o `RG-02` (rechaza grupos con `n < 5`; separa hechos, semáforos y recomendaciones sin inferir causalidad).

### Acceso y cuestionarios
* `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` — Sesiones mediante cookie HttpOnly.
* `POST /api/auth/users` — Crear cuentas; solo rol `ADMIN`. Contraseñas de al menos 14 caracteres.
* El panel admin incluye **Cuentas de estudiantes** para elegir estudiantes con PCL-5 pendientes; genera una contraseña temporal aleatoria que se muestra al crear la cuenta.
* `GET /api/estudiante/evaluaciones` — Oportunidades completas asignadas a la cuenta.
* `GET /api/estudiante/evaluaciones/:id` — Versión, instrucciones, ítems, opciones y respuestas guardadas.
* `PUT /api/estudiante/evaluaciones/:id/borrador` — Guardar/continuar un borrador parcial.
* `POST /api/estudiante/evaluaciones/:id/enviar` — Validar todos los ítems y calcular el total en el servidor.
* `POST /api/evaluacion/admin/:id/corregir` — Crear una versión corregida con motivo; conserva respuestas y resultado previos.
* `POST /api/operacion/resultados` — **Deshabilitado**; no acepta puntajes totales ingresados manualmente.

---

## 6. Variables de Entorno

### Backend (`backend/.env`)

```env
PORT=4000
CORS_ORIGIN=http://localhost:3000

# Modo de autenticación: "windows" (local) o "sql" (Docker / nube)
DB_AUTH_MODE=windows
DB_SERVER=localhost
DB_DATABASE=MMET_BI_OLTP
DB_DM_NAME=MMET_BI_DM
DB_ODBC_DRIVER=ODBC Driver 17 for SQL Server

# Cuenta inicial local (generada para este entorno; no publicar estos valores)
BOOTSTRAP_ADMIN_USERNAME=admin-local
# La clave real es local: backend/.env y backend/.local-admin-credentials.txt.
# No reemplazar ni copiarla al repositorio.

# Solo requerido cuando DB_AUTH_MODE=sql
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=TuPasswordSeguro
DB_ENCRYPT=true
DB_TRUST_SERVER_CERT=true
```

### Frontend (`frontend/.env.local`, opcional)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

---

## 7. Ejecución Local

1. **En una base local ya poblada, actualizar OLTP y cargar Data Mart sin borrar datos:**
   ```powershell
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\03_actualizar_cuestionarios_y_acceso_sqlserver.sql"
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\04_configurar_versiones_cuestionarios_sqlserver.sql"
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\05_verificar_cuestionarios_sqlserver.sql"
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\06_crear_datamart_sqlserver.sql"
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\07_etl_cargar_datamart_sqlserver.sql"
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\08_verificar_datamart_sqlserver.sql"
   ```

   Para reconstruir una base descartable desde cero, usar explícitamente:
   ```powershell
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\01_crear_bd_oltp_sqlserver.sql"
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\02_poblar_datos_10k_sqlserver.sql"
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\04_configurar_versiones_cuestionarios_sqlserver.sql"
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\05_verificar_cuestionarios_sqlserver.sql"
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\06_crear_datamart_sqlserver.sql"
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\07_etl_cargar_datamart_sqlserver.sql"
   sqlcmd -S localhost -E -C -b -f 65001 -i "sql_server\08_verificar_datamart_sqlserver.sql"
   ```
   Los archivos `01` y `02` recrean esquema y datos. La cuenta local `admin-local` se crea al arrancar el backend; sus credenciales están en `backend/.local-admin-credentials.txt` (archivo ignorado por Git). El administrador debe crear las cuentas de estudiantes desde `POST /api/auth/users`.

2. **Iniciar el Backend (NestJS — puerto `4000`):**
   ```powershell
   cd backend
   npm ci
   npm run start:dev
   ```

3. **Iniciar el Frontend (Next.js — puerto `3000`):**
   ```powershell
   cd frontend
   npm ci
   npm run dev
   ```

4. **Abrir en el navegador:** `http://localhost:3000`
