# Implementación de las fases 1 a 3

Fecha de avance: 24 de noviembre de 2026.

## Orden ejecutado

Se trabajó en orden Fase 1 → Fase 2 → Fase 3. La Fase 4 (generación de datos sintéticos por ítem) no se inició.

## Fase 1 — OLTP y versiones de formularios

**Implementado:** tablas versionadas para versiones, ítems, opciones, borradores, respuestas por ítem, cuentas y sesiones; vínculo opcional de versión en cada oportunidad; actor de registro/corrección; triggers que impiden modificar contenido publicado; scripts incremental y verificador; script canónico `01` actualizado.

**Aplicado a `MMET_BI_OLTP`:** la actualización `03` se ejecutó y volvió a ejecutar sin duplicar esquema. La población y los resultados históricos se conservaron. El `04` cargó la versión PCL-5 y se repitió sin duplicar contenido.

**Límite de contenido:** PSS-10 conserva sus diez posiciones e ítems inversos 4, 5, 7 y 8, pero la versión española está `BLOQUEADO`; falta evidencia de autorización. No se incorporó texto provisional ni se inventaron respuestas históricas.

**Pendiente de cierre:** completar el modelo de auditoría bitemporal para todos los cambios de asistencias, sesiones, retiros, programación y aplicabilidad exigido por D03.

## Fase 2 — Acceso y operación por roles

**Implementado:** autenticación con scrypt, sesión HttpOnly con token aleatorio cuyo hash se guarda en SQL Server, expiración/revocación, protección CSRF por cookie y cabecera, autorización por rol; bootstrap de `admin-local` solo desde entorno; panel ADMIN para crear cuentas estudiantiles ligadas a alumnos con formularios PCL-5 disponibles; acceso de reportes y operación limitado por rol. El endpoint anterior de puntaje manual responde con prohibición.

**Pendiente de cierre:** pantallas y operaciones CRUD completas para estudiantes, programas, inscripciones, prácticas, sesiones, cierre de asistencia, aplicabilidad y programación. También falta convertir los cambios de asistencia actuales en historial auditable; `registrarAsistencia` aún actualiza el registro.

## Fase 3 — Formularios de estudiante

**Implementado para PCL-5 español:** portal autenticado; 20 preguntas y cinco opciones; período de referencia del último mes; borrador reanudable; envío obligatorio completo; cálculo en backend; validación de propiedad y versión; resultado y 20 respuestas atómicos; corrección de Evaluación con motivo y nueva versión, conservando la anterior. Se muestra la limitación de validación de la traducción indicada por NCPTSD en el metadato.

**Pendiente de cierre:** habilitar captura PSS-10 cuando exista autorización documentada; experiencia para el rol Evaluación que asigne nuevas oportunidades/versiones y gestione correcciones; confirmación de condiciones clínicas e institucionales del uso. Los cuestionarios PSS-10 bloqueados no aparecen al estudiante.

## Verificación ejecutada

- `npm.cmd test` en `backend`: cinco pruebas pasan para suma PCL-5, inversión PSS-10 y límites de respuesta.
- `npm.cmd run build` en backend y frontend: ambas compilaciones pasan.
- Prueba HTTP contra SQL Server local: CSRF requerido, rol estudiante sin permiso para corregir, formulario PCL-5 20/5, borrador, envío total 0 y corrección v2 total 20 conservando v1. Se retiraron después las dos oportunidades y cuentas temporales asociadas; permanecen los 1,000 estudiantes originales, cero cuentas de prueba y cero respuestas de prueba.
- `04_configurar_versiones_cuestionarios_sqlserver.sql`: repetido sin duplicados.
- `05_verificar_cuestionarios_sqlserver.sql`: pasa; confirma 20 ítems/5 opciones PCL-5 y PSS-10 bloqueado.
- SQL Server rechazó pruebas de actualización sobre versión, ítems y opciones PCL-5 publicados mediante los triggers de inmutabilidad.
- Backend y frontend compilan. Next advierte de tres lockfiles y eligió `C:\Users\Anthony Garcia\package-lock.json` como raíz de tracing; la compilación termina correctamente.

## Orden SQL

- Base existente: `03_actualizar_cuestionarios_y_acceso_sqlserver.sql` → `04_configurar_versiones_cuestionarios_sqlserver.sql` → `05_verificar_cuestionarios_sqlserver.sql`.
- Reconstrucción intencional de una base descartable: `01_crear_bd_oltp_sqlserver.sql` → `02_poblar_datos_10k_sqlserver.sql` → `04` → `05`. Los scripts `01` y `02` eliminan y regeneran datos; no son actualizaciones incrementales.

## Credenciales locales

La cuenta `admin-local` se aprovisiona al arrancar el backend si hay credenciales `BOOTSTRAP_ADMIN_*` en `backend/.env`. Su contraseña generada se conserva en `backend/.local-admin-credentials.txt`, ignorado por Git. No se copia al repositorio.
