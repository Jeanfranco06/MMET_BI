# MMET BI — Sistema de Inteligencia de Negocios y Gestión OLTP (2026-II)

Sistema full-stack conectado a **SQL Server (`MMET_BI_OLTP`)** para el análisis de cambios en el estrés percibido (**PSS-10**) y los síntomas postraumáticos (**PCL-5**) asociados a programas universitarios de meditación y mindfulness (`P-01` a `P-04` y `MIXTO`).

## Arquitectura

- **Base de Datos OLTP:** Microsoft SQL Server (`sql_server/01_crear_bd_oltp_sqlserver.sql` y `sql_server/02_poblar_datos_10k_sqlserver.sql`)
- **Backend:** NestJS + TypeScript (`backend/`, puerto `4000`, `/api`) conectado a `MMET_BI_OLTP` vía Windows Auth (local) o SQL Auth (Alibaba Cloud / Docker)
- **Frontend:** Next.js 15 + React 19 + Tailwind CSS + Apache ECharts (`frontend/`, puerto `3000`)

## Ejecución local

1. **Base de datos (SQL Server):**
   ```powershell
   sqlcmd -S localhost -E -i "sql_server\01_crear_bd_oltp_sqlserver.sql"
   sqlcmd -S localhost -E -i "sql_server\02_poblar_datos_10k_sqlserver.sql"
   ```

2. **Backend (NestJS — puerto 4000):**
   ```powershell
   cd backend
   npm install
   npm run start:dev
   ```

3. **Frontend (Next.js — puerto 3000):**
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

Abrir en el navegador: `http://localhost:3000`
