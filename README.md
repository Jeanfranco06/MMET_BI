# MMET BI — Sistema de Inteligencia de Negocios y Gestión OLTP (2026-II)

Sistema full-stack conectado a **Microsoft SQL Server (`MMET_BI_OLTP`)** para la gestión operacional y el análisis de cambios en el estrés percibido (**PSS-10**) y los síntomas postraumáticos (**PCL-5**) asociados a programas universitarios de meditación y mindfulness (`P-01` a `P-04` y `MIXTO`).

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
| **`KPI-04`** | Tasa de cumplimiento de evaluaciones aplicables | `>= 90%` | `70% a < 90%` | `< 70%` | Mide cumplimiento (incluye tardías válidas), no reducción de síntomas. |

### Reportes del Sistema

* **`RO-03` (Operacional):** Seguimiento de continuidad y abandono por estudiante (`KPI-03`).
* **`RO-04` (Operacional):** Control de evaluaciones psicológicas pendientes y completadas (`KPI-04`).
* **`RG-01` (Gestión):** Evolución general del estrés percibido (`PSS-10`) y síntomas postraumáticos (`PCL-5`).
* **`RG-03` (Gestión):** Comparativo de reducciones del estrés y síntomas postraumáticos por tipo de práctica (`P-01` a `P-04` y `MIXTO`).

---

## 2. Arquitectura y Estructura del Proyecto

* **Base de Datos OLTP (`sql_server/`):** Microsoft SQL Server 2019 / 2022 (`T-SQL`).
  * `sql_server/01_crear_bd_oltp_sqlserver.sql`: Creación de la base `MMET_BI_OLTP`, tablas de dominio, índices, restricciones `CHECK` y triggers de reglas operativas.
  * `sql_server/02_poblar_datos_10k_sqlserver.sql`: Poblamiento determinístico idempotente (~20,000 registros totales, ~10,500+ asistencias) calibrado estadísticamente para el periodo `2026-II`.
* **Backend (`backend/`):** NestJS 10 + TypeScript (`mssql` / `msnodesqlv8`), expuesto en el puerto `4000` bajo el prefijo global `/api`.
  * `src/database/`: Conexión a SQL Server vía **Windows Auth** (`msnodesqlv8`) o **SQL Auth** (`mssql` / Tedious).
  * `src/analytics/`: Consultas analíticas para KPIs (`KPI-01` a `KPI-04`) y reportes (`RO-03`, `RO-04`, `RG-01`, `RG-03`).
  * `src/operacion/`: Registro transaccional de asistencias y resultados de evaluación con versionado.
* **Frontend (`frontend/`):** Next.js 15 + React 19 + Tailwind CSS + Apache ECharts (`echarts`), expuesto en el puerto `3000`.
  * `src/components/`: Dashboard analítico (`DashboardApp.tsx`), reporte de continuidad (`ContinuidadReport.tsx`), vista operacional (`OperacionView.tsx`), gráficos (`EChartBox.tsx`), tablas responsivas (`ResponsiveTable.tsx`) y semáforos (`SemaforoBadge.tsx`).
  * `src/lib/api.ts`: Cliente HTTP hacia el backend (`NEXT_PUBLIC_API_URL`).

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
3. **Continuidad y evaluabilidad (`RO-03` / `KPI-03`):**
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
* `GET /api/analytics/continuidad` — Reporte operacional `RO-03` / `KPI-03` paginado (`corte`, `semestre`, `id_programa`, `id_practica`, `estado`, `buscar`, `page`, `pageSize`).
* `GET /api/analytics/cumplimiento` — Control de evaluaciones `RO-04` / `KPI-04` (`corte`, `id_programa`, `instrumento`).

### Operación (`/api/operacion`)
* `GET /api/operacion/sesiones` — Listado de sesiones con conteo de asistencias e inasistencias (`id_programa`).
* `GET /api/operacion/oportunidades-abiertas` — Oportunidades de evaluación aplicables y su resultado vigente (`id_programa`).
* `POST /api/operacion/asistencias` — Registra o actualiza asistencia (`MERGE`) validando que la sesión esté `REALIZADA`.
* `POST /api/operacion/resultados` — Registra resultado v1 o versiona una corrección (`motivo_correccion` obligatorio si ya existe resultado vigente).

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
DB_ODBC_DRIVER=ODBC Driver 17 for SQL Server

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

1. **Crear y poblar la base de datos (SQL Server):**
   ```powershell
   sqlcmd -S localhost -E -i "sql_server\01_crear_bd_oltp_sqlserver.sql"
   sqlcmd -S localhost -E -i "sql_server\02_poblar_datos_10k_sqlserver.sql"
   ```

2. **Iniciar el Backend (NestJS — puerto `4000`):**
   ```powershell
   cd backend
   npm install
   npm run start:dev
   ```

3. **Iniciar el Frontend (Next.js — puerto `3000`):**
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

4. **Abrir en el navegador:** `http://localhost:3000`
