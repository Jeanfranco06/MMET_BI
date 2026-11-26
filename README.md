# MMET_BI — PostgreSQL

Sistema universitario con Next.js, NestJS y **dos bases PostgreSQL independientes**:

- `mmet_bi_oltp`: usuarios, sesiones, estudiantes, programas, asistencias, oportunidades y cuestionarios completos.
- `mmet_bi_dm`: dimensiones, tres tablas de hechos, vista de efectividad y auditoría ETL.

NestJS mantiene dos pools. El ETL obtiene una instantánea consistente del OLTP, extrae solo las columnas analíticas permitidas y publica el corte en una transacción del Data Mart. No usa consultas entre bases, servidores vinculados, FDW ni Prisma.

## Instalación local ya migrada en esta laptop

Las bases conservadas están en PostgreSQL **17.7**, puerto **55434**; `backend/.env` ya tiene sus dos conexiones. No ejecutar seed ni volver a importar. Si reinicia Windows, primero iniciar la instancia local:

```powershell
pwsh -File backend/scripts/Start-LocalPostgres.ps1
```

Después ejecutar `npm.cmd run start:dev` en backend y `npm.cmd run dev` en frontend. El perfil y binarios locales están en `.local/` (no versionados). Para otra computadora seguir la instalación reproducible de abajo.

## Inicio local

Requiere Node.js 22 y PostgreSQL 17 accesible (también se verificó compatibilidad con PostgreSQL 16). Instalar dependencias y copiar la configuración:

```powershell
cd backend
npm.cmd ci
Copy-Item .env.example .env
```

Editar `.env`: completar **por separado** `OLTP_PG_*` y `DM_PG_*`, más el usuario/contraseña ADMIN inicial. Si `.env` ya existe, editarlo conservando sus credenciales, no reemplazarlo.

```powershell
npm.cmd run db:create
npm.cmd run db:init
npm.cmd run db:seed
npm.cmd run db:etl -- 2026-11-23
npm.cmd run db:verify
npm.cmd run start:dev
```

`db:create` necesita permiso para crear bases; si las bases ya fueron creadas por un administrador, se puede omitir. `db:seed` es para una instalación DEMO vacía; nunca ejecutarlo para sustituir los datos importados.

En otra terminal:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Frontend: http://localhost:3000. Backend: http://localhost:4000/api. Las cuentas se almacenan en el OLTP; el bootstrap solo crea el administrador si no existe y no cambia su clave. Las cuentas importadas conservan sus claves originales. El ADMIN puede crear cuentas de estudiantes desde la aplicación.

#### Usuarios y credenciales de prueba preconfigurados

| Rol | Usuario | Contraseña | Alcance y vistas disponibles |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | `admin-local` | `CambiarPorClaveDeAlMenos14Caracteres!` | Acceso total: Tableros BI, Gestión Operativa (Padrón, Pase de Lista por Sesión, Sesiones, Correcciones, Eventos Índice), Control ETL y Cuentas de Estudiantes. |
| **`COORDINACION`** | `coordinacion-test` | `Coordinacion2026*!` | Reportes BI, Padrón de Estudiantes e Inscripciones, Pase de Lista por Sesión y Programación de Sesiones. |
| **`EVALUACION`** | `evaluacion-test` | `Evaluacion2026*!` | Reportes BI, Corrección Versionada de Evaluaciones, Registro de Eventos Índice y consulta de sesiones. |
| **`DIRECCION`** | `direccion-test` | `Direccion2026*!` | Reportes BI estratégicos y operacionales (`Tablero Visual`, `RO-01`, `RO-02`, `RG-01`, `RG-02`). |
| **`ESTUDIANTE`** | `estudiante-test` | `Estudiante2026*!` | Portal del Estudiante (vinculado a `UNT26-EST-0001` · Mariana Isabel Torres Lozano) para responder cuestionarios `PSS-10` / `PCL-5`. |

## Conservar datos actuales de SQL Server

SQL Server es solo el origen de esta importación opcional; el backend PostgreSQL no lo necesita.

1. Exportar a un archivo **local privado**, ignorado por Git:

```powershell
pwsh -File backend/scripts/Export-SqlServer.ps1
```

El script requiere PowerShell 7 (usar `pwsh` si Windows PowerShell 5 es el predeterminado). Ejemplo recomendado:

```powershell
pwsh -File backend/scripts/Export-SqlServer.ps1
cd backend
npm.cmd run db:create
npm.cmd run db:init -- --import ../.local/oltp-export.json
npm.cmd run db:etl -- 2026-10-15
npm.cmd run db:etl -- 2026-11-05
npm.cmd run db:etl -- 2026-11-23
```

La importación exige un OLTP PostgreSQL vacío y se ejecuta antes de activar los triggers. Conserva IDs, cuentas, hashes y versiones; recalibra las secuencias. No elimina ni actualiza el origen SQL Server. No ejecutar `db:seed` después de importar.

## SQL canónico

Todos los scripts activos y estudiables están en `sql_postgres/`:

| Archivo | Destino | Contenido |
|---|---|---|
| `01_oltp.sql` | OLTP | Tablas, claves, restricciones, índices y flags 0/1 |
| `02_reglas.sql` | OLTP | Validaciones, auditoría e inmutabilidad de instrumentos publicados |
| `03_datamart.sql` | DM | Dimensiones, hechos, calendario y vista de efectividad |
| `04_etl.sql` | DM | Función `dm.ejecutar_etl(fecha, snapshot_json)` |
| `05_catalogos_y_formularios.sql` | OLTP demo | Catálogos y formularios existentes del proyecto |
| `06_datos_demo.sql` | OLTP demo | 1.000 estudiantes sintéticos y respuestas/puntuaciones consistentes |
| `07_verificar_datamart.sql` | DM | Verificaciones analíticas de solo lectura |
| `08_verificar_oltp.sql` | OLTP | Verificaciones de puntuación y conteos |

`db:init` registra el checksum de cada script aplicado. Un script ya aplicado no se modifica silenciosamente en la base: los cambios futuros requieren un nuevo `.sql` incremental, además de mantener el esquema canónico actualizado. `sql_server/` y `sql/` son referencias históricas; no son el motor activo.

## Docker (instalación demo independiente)

```powershell
Copy-Item .env.example .env
# Reemplazar las contraseñas de ejemplo en .env.
docker compose up -d --build
```

Compose crea dos contenedores PostgreSQL 17, dos volúmenes persistentes y un servicio de inicialización. No importa automáticamente la base local del usuario. Puertos locales de BD: 5433 OLTP y 5434 DM. La demo usa HTTP local (`COOKIE_SECURE=false`); para HTTPS debe establecerse `COOKIE_SECURE=true`.

## Oracle Cloud y Bastion

Las dos bases restauradas en OCI se alcanzan por el mismo túnel `127.0.0.1:5433`, con conexiones independientes por nombre de base y usuario. El perfil local sigue en `backend/.env` y utiliza el puerto `55434`. Sigue la [guía de operación OCI](MIGRACION_POSTGRESQL.md#operación-en-oci) para configurar credenciales, comparar las bases e iniciar NestJS.

## Comprobaciones

```powershell
cd backend
npm.cmd test
# Integración: usar exclusivamente bases cuyos nombres contengan test.
$env:RUN_POSTGRES_INTEGRATION='1'
$env:OLTP_PG_DATABASE='mmet_test_oltp'
$env:DM_PG_DATABASE='mmet_test_dm'
npm.cmd run test:postgres
```

Las pruebas de integración esperan la instalación demo en esas bases. Prueban dos conexiones, filtros/reportes, idempotencia y reversión ETL, operaciones, login, borradores y correcciones. No son pruebas destructivas sobre las bases del usuario.
