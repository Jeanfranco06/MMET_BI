# Migración completa a PostgreSQL — 25/11/2026

## Arquitectura entregada

Dos bases reales independientes (`mmet_bi_oltp`, `mmet_bi_dm`), no dos esquemas de una sola base. Cada una puede residir en un servidor diferente. Los esquemas internos conservan los nombres `dbo` y `dm` para facilitar el estudio del modelo; eso no convierte ambas bases en una sola.

`DatabaseService` usa dos pools `pg`. `EtlService` lee el OLTP en una transacción REPEATABLE READ READ ONLY, entrega una instantánea JSON con lista explícita de columnas y llama a `dm.ejecutar_etl` en una transacción independiente del destino. La función usa staging temporal que desaparece al terminar la transacción. No se copian nombres, apellidos, correos, hashes, narraciones clínicas ni respuestas individuales al Data Mart.

La carga se serializa con advisory lock, conserva las claves dimensionales y sustituye solo el corte solicitado. Un fallo de transformación revierte el reemplazo de hechos y registra ERROR; las incidencias generadas dentro del bloque revertido no se conservan individualmente. El origen queda disponible aunque la carga de destino falle.

## Cambios de implementación

- Controlador `pg`; eliminados `mssql`, `msnodesqlv8` y `@types/mssql` del backend activo.
- Consultas nativas PostgreSQL, parámetros preparados, tipos numéricos normalizados y fechas calendario conservadas como AAAA-MM-DD.
- Operaciones con RETURNING, CTE y ON CONFLICT; transacciones y bloqueo de oportunidad al enviar/corregir un cuestionario.
- Contratos HTTP conservados para Next.js. Etiquetas de motor actualizadas.
- Scripts SQL canónicos completos, seed reproducible y scripts de exportación/importación de los datos anteriores.
- Docker Compose con dos bases PostgreSQL 17 y servicio de inicialización.
- D01 corregida: elegibilidad KPI-04 desde `fecha_prevista`, no desde el fin de ventana. Los resultados pueden diferir del motor anterior en cortes intermedios precisamente por esta corrección.

## Verificación y alcance

Se importaron las tablas del OLTP existente conservando IDs, cuentas, hashes y resultados históricos. No se fabricaron respuestas individuales para resultados antiguos. Los datos sintéticos nuevos del seed sí incluyen respuestas completas y puntuaciones que se calculan con esas mismas respuestas.

Verificaciones realizadas sobre PostgreSQL 16 y repetidas en PostgreSQL **17.7**: instalación desde cero, carga de los cortes 2026-10-15, 2026-11-05 y 2026-11-23; consultas de filtros, resumen y cuatro reportes; login HTTP con las cinco cuentas existentes; envío y corrección de cuestionarios, asistencia e historial. Las pruebas se guardan en `backend/test/postgres.integration.cjs`; los datos privados de importación están ignorados por Git en `.local/`.

Las bases originales de SQL Server se conservan como respaldo. La instalación local de verificación no implica que los recursos estén desplegados en OCI. La configuración de host/puerto/CA/hostname permite conectar por Bastion cuando se proporcionen los endpoints y la sesión.

## Límites anteriores que no deben confundirse con la migración

La reconstrucción bitemporal completa D03, las revisiones históricas publicadas y la supresión complementaria de todos los conteos pequeños no estaban completas en el ETL anterior. Esta migración no acredita su cumplimiento. El ETL sigue reconstruyendo cortes desde los estados actuales del origen y versiones vigentes. Mantener las publicaciones históricas de forma inmutable requiere trabajo funcional específico.

La versión del contenido y condiciones de uso de los instrumentos se conserva tal como existe en el repositorio actual; esta migración técnica no constituye una nueva autorización de uso.

## Operación y recuperación

- Abrir los túneles antes del backend y mantenerlos activos durante la carga y la presentación.
- El backend exige conexión a ambas bases al iniciar. Si falta el túnel del DM, el arranque falla con un error de conexión.
- Para respaldar, usar `pg_dump -Fc` por separado para OLTP y DM. Restaurar con `pg_restore` en bases nuevas.
- No ejecutar scripts de reconstrucción SQL Server contra PostgreSQL. Los SQL activos están en `sql_postgres/`.
- Los secretos pertenecen a `.env`, certificados y exportaciones locales ignorados. No incluir `.local/` en Git ni en imágenes Docker.

## Conciliación de los datos conservados

Los seis grupos corte/instrumento del Data Mart original y del migrado coinciden exactamente en número de pares, suma inicial, suma final y reducción. Al corte 2026-11-23: PSS-10 = 613 pares, inicial 12521, final 9454; PCL-5 = 251 pares, inicial 9512, final 7028. Las cinco cuentas conservan sus contraseñas y pasan el login HTTP.

## Operación en OCI

Desde `backend`, copia `.env.oci.example` a `.env.oci.local` si el perfil todavía no existe. Ábrelo en un editor local y completa las contraseñas. Usa comillas si la contraseña incluye `#`, espacios u otros caracteres que requieren delimitación. Git y Docker excluyen el perfil. `.env` conserva la configuración local y los ajustes comunes.

1. Activa el reenvío de Bastion desde `127.0.0.1:5433` hacia `10.0.2.196:5432`. Mantén la terminal SSH abierta.
2. En **OCI → PostgreSQL → DB Systems → Connection details**, descarga la CA y copia el FQDN. Usa la ruta absoluta de la CA en ambos campos `*_PG_CA_FILE` y el FQDN en ambos `*_PG_SERVERNAME`. Usa `*_PG_SSL=true` y `*_PG_SSL_MODE=verify-full` para validar el certificado y el nombre del servidor. El host TCP sigue siendo `127.0.0.1`. Para la prueba inicial por Bastion, `require` cifra TLS sin verificar el certificado de PostgreSQL.
3. Para repetir una conciliación completa, copia el perfil OCI a `.env.oci-audit.local` y configura allí las credenciales del propietario de la restauración. Esa cuenta puede leer el estado de las secuencias y todas las tablas. Ejecuta desde `backend`:

   ```powershell
   npm.cmd run build
   node scripts/compare-oci.cjs .env.oci-audit.local
   ```

   La comparación abre transacciones de solo lectura. Verifica catálogos, conteos, huellas SHA-256 de filas y vistas, estado de secuencias y resultados de KPI y reportes en los cortes disponibles. Devuelve código 2 si detecta diferencias. Los permisos y propietarios se evalúan aparte porque la restauración los excluyó. Conviene pausar escrituras durante la comparación para evitar diferencias por cambios concurrentes.
4. Como propietario de la restauración, aplica `09_permisos_oci_oltp.sql` y `10_permisos_oci_dm.sql` en sus bases correspondientes. Crea usuarios exclusivos desde `psql` con `CREATE ROLE mmet_oltp_runtime LOGIN` y `CREATE ROLE mmet_dm_runtime LOGIN`. Usa `\password mmet_oltp_runtime` y `\password mmet_dm_runtime` en `psql` para asignar sus contraseñas de forma interactiva. Otorga las membresías `GRANT mmet_oltp_app TO mmet_oltp_runtime` y `GRANT mmet_dm_app TO mmet_dm_runtime`. Sustituye las credenciales de administración del perfil OCI por esos dos usuarios. El rol DM puede leer reportes y ejecutar la carga que usa el backend.
5. Desde una terminal nueva, sin otras variables `OLTP_PG_*` o `DM_PG_*` exportadas, inicia NestJS con el perfil OCI. El frontend sigue apuntando al mismo backend.

   ```powershell
   npm.cmd run build
   node --env-file=.env.oci.local dist/main.js
   ```

   En otra terminal, ejecuta el ETL solo para el corte que quieras publicar. Una carga sustituye los hechos de ese corte en el Data Mart OCI.

   ```powershell
   node --env-file=.env.oci.local scripts/db.cjs etl 2026-11-23
   ```

   Para volver a local, detén ese proceso e inicia `npm.cmd run start:dev` sin cargar el perfil OCI. En bases restauradas, omite `db:create`, `db:init` y `db:seed`.

Si Bastion vence, crea una sesión de reenvío nueva al mismo destino desde la consola de OCI. Copia el comando SSH de esa sesión, indica tu llave privada y vuelve a usar el puerto local `5433`. Una vez establecido el túnel, reinicia NestJS si quedó detenido y confirma el acceso a ambas bases antes de ejecutar otro ETL.

### Verificación OCI del 26/11/2026

PostgreSQL 17.7 local y PostgreSQL 17.6 OCI Optimized coincidieron antes de las pruebas en las 24 tablas OLTP y 15 del Data Mart, incluidas sus tablas de migraciones, y en los catálogos, vistas, secuencias, funciones, restricciones y resultados analíticos. Se compararon los cinco KPI y cuatro reportes para los cortes 2026-10-15, 2026-11-05 y 2026-11-23.

NestJS inició con `mmet_oltp_runtime` y `mmet_dm_runtime`. Los servicios verificaron las cinco cuentas, inicio y cierre de sesión, borradores, envíos y correcciones en ambos instrumentos. El ETL de prueba del 2026-11-23 reprodujo los resultados publicados. Las escrituras de prueba se revirtieron. Las secuencias de PostgreSQL pueden avanzar al revertir una transacción, por lo que es esperable que sus posiciones difieran de la línea base.

La sesión de integración usó `require` a través de Bastion. Para pasar a `verify-full`, completa los campos de CA y FQDN del paso 2 en el perfil de ejecución.

Referencias: [conexión a PostgreSQL en OCI](https://docs.oracle.com/en-us/iaas/Content/postgresql/connect-to-db.htm) y [sesiones de reenvío de Bastion](https://docs.oracle.com/en-us/iaas/Content/Bastion/Tasks/connect-port-forwarding.htm).
