/*
  Actualización incremental no destructiva de cuestionarios y acceso.
  La definición equivalente forma parte del script canónico
  01_crear_bd_oltp_sqlserver.sql. No reconstruye tablas ni elimina datos.
  Ejecutar desde SSMS/sqlcmd con USE MMET_BI_OLTP.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
USE MMET_BI_OLTP;
GO

IF OBJECT_ID(N'dbo.instrumento_versiones',N'U') IS NULL
CREATE TABLE dbo.instrumento_versiones (
 id_version_instrumento BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
 id_instrumento SMALLINT NOT NULL,
 numero_version NVARCHAR(30) NOT NULL,
 idioma NVARCHAR(10) NOT NULL,
 periodo_referencia NVARCHAR(80) NOT NULL,
 instrucciones NVARCHAR(MAX) NULL,
 texto_periodo NVARCHAR(500) NULL,
 fuente NVARCHAR(500) NOT NULL,
 estado_contenido NVARCHAR(20) NOT NULL,
 condiciones_uso NVARCHAR(500) NOT NULL,
 creado_en DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_instver_creado DEFAULT(SYSDATETIMEOFFSET()),
 CONSTRAINT fk_instver_instrumento FOREIGN KEY(id_instrumento) REFERENCES dbo.cat_instrumentos(id_instrumento),
 CONSTRAINT uq_instver UNIQUE(id_instrumento,numero_version,idioma),
 CONSTRAINT uq_instver_id_instr UNIQUE(id_version_instrumento,id_instrumento),
 CONSTRAINT chk_instver_estado CHECK(estado_contenido IN(N'BORRADOR',N'PUBLICADO',N'BLOQUEADO'))
);
GO
IF OBJECT_ID(N'dbo.instrumento_items',N'U') IS NULL
CREATE TABLE dbo.instrumento_items (
 id_item BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
 id_version_instrumento BIGINT NOT NULL,
 numero_item SMALLINT NOT NULL,
 texto_item NVARCHAR(2000) NULL,
 puntuacion_inversa BIT NOT NULL CONSTRAINT df_item_inversa DEFAULT(0),
 obligatorio BIT NOT NULL CONSTRAINT df_item_obligatorio DEFAULT(1),
 CONSTRAINT fk_item_version FOREIGN KEY(id_version_instrumento) REFERENCES dbo.instrumento_versiones(id_version_instrumento),
 CONSTRAINT uq_item_num UNIQUE(id_version_instrumento,numero_item),
 CONSTRAINT uq_item_version_id UNIQUE(id_version_instrumento,id_item),
 CONSTRAINT chk_item_num CHECK(numero_item>0)
);
GO
IF OBJECT_ID(N'dbo.instrumento_opciones_respuesta',N'U') IS NULL
CREATE TABLE dbo.instrumento_opciones_respuesta (
 id_version_instrumento BIGINT NOT NULL,
 valor SMALLINT NOT NULL,
 etiqueta NVARCHAR(250) NOT NULL,
 PRIMARY KEY(id_version_instrumento,valor),
 CONSTRAINT fk_opcion_version FOREIGN KEY(id_version_instrumento) REFERENCES dbo.instrumento_versiones(id_version_instrumento),
 CONSTRAINT chk_opcion_valor CHECK(valor BETWEEN 0 AND 4)
);
GO
IF OBJECT_ID(N'dbo.usuarios_sistema',N'U') IS NULL
CREATE TABLE dbo.usuarios_sistema (
 id_usuario BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
 id_estudiante BIGINT NULL,
 nombre_usuario NVARCHAR(100) NOT NULL,
 hash_credencial VARBINARY(64) NOT NULL,
 sal_credencial VARBINARY(32) NOT NULL,
 rol NVARCHAR(20) NOT NULL,
 activo BIT NOT NULL CONSTRAINT df_usuario_activo DEFAULT(1),
 creado_en DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_usuario_creado DEFAULT(SYSDATETIMEOFFSET()),
 CONSTRAINT fk_usuario_estudiante FOREIGN KEY(id_estudiante) REFERENCES dbo.estudiantes(id_estudiante),
 CONSTRAINT uq_usuario_nombre UNIQUE(nombre_usuario),
 CONSTRAINT uq_usuario_estudiante UNIQUE(id_estudiante),
 CONSTRAINT chk_usuario_rol CHECK(rol IN(N'ESTUDIANTE',N'COORDINACION',N'EVALUACION',N'DIRECCION',N'ADMIN'))
);
GO
IF OBJECT_ID(N'dbo.sesiones_autenticacion',N'U') IS NULL
CREATE TABLE dbo.sesiones_autenticacion (
 id_sesion UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
 id_usuario BIGINT NOT NULL,
 hash_token VARBINARY(32) NOT NULL,
 creado_en DATETIMEOFFSET(0) NOT NULL,
 expira_en DATETIMEOFFSET(0) NOT NULL,
 revocado_en DATETIMEOFFSET(0) NULL,
 CONSTRAINT fk_auth_usuario FOREIGN KEY(id_usuario) REFERENCES dbo.usuarios_sistema(id_usuario),
 CONSTRAINT uq_auth_hash UNIQUE(hash_token),
 CONSTRAINT chk_auth_fechas CHECK(expira_en>creado_en)
);
GO
IF OBJECT_ID(N'dbo.respuestas_borrador',N'U') IS NULL
CREATE TABLE dbo.respuestas_borrador (
 id_oportunidad BIGINT NOT NULL PRIMARY KEY,
 id_estudiante BIGINT NOT NULL,
 id_version_instrumento BIGINT NOT NULL,
 respuestas_json NVARCHAR(MAX) NOT NULL,
 actualizado_en DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_borrador_actualizado DEFAULT(SYSDATETIMEOFFSET()),
 CONSTRAINT fk_borrador_oportunidad FOREIGN KEY(id_oportunidad) REFERENCES dbo.oportunidades_evaluacion(id_oportunidad),
 CONSTRAINT fk_borrador_estudiante FOREIGN KEY(id_estudiante) REFERENCES dbo.estudiantes(id_estudiante),
 CONSTRAINT fk_borrador_version FOREIGN KEY(id_version_instrumento) REFERENCES dbo.instrumento_versiones(id_version_instrumento),
 CONSTRAINT chk_borrador_json CHECK(ISJSON(respuestas_json)=1)
);
GO
IF COL_LENGTH(N'dbo.oportunidades_evaluacion',N'id_version_instrumento') IS NULL
 ALTER TABLE dbo.oportunidades_evaluacion ADD id_version_instrumento BIGINT NULL;
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'fk_op_version_instr')
 ALTER TABLE dbo.oportunidades_evaluacion ADD CONSTRAINT fk_op_version_instr FOREIGN KEY(id_version_instrumento,id_instrumento) REFERENCES dbo.instrumento_versiones(id_version_instrumento,id_instrumento);
IF COL_LENGTH(N'dbo.resultados_evaluacion',N'id_usuario_registro') IS NULL
 ALTER TABLE dbo.resultados_evaluacion ADD id_usuario_registro BIGINT NULL;
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'fk_resultado_usuario')
 ALTER TABLE dbo.resultados_evaluacion ADD CONSTRAINT fk_resultado_usuario FOREIGN KEY(id_usuario_registro) REFERENCES dbo.usuarios_sistema(id_usuario);
IF COL_LENGTH(N'dbo.resultados_evaluacion',N'id_usuario_correccion') IS NULL
 ALTER TABLE dbo.resultados_evaluacion ADD id_usuario_correccion BIGINT NULL;
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'fk_resultado_usuario_corr')
 ALTER TABLE dbo.resultados_evaluacion ADD CONSTRAINT fk_resultado_usuario_corr FOREIGN KEY(id_usuario_correccion) REFERENCES dbo.usuarios_sistema(id_usuario);
GO
IF OBJECT_ID(N'dbo.respuestas_evaluacion',N'U') IS NULL
CREATE TABLE dbo.respuestas_evaluacion (
 id_resultado BIGINT NOT NULL,
 id_version_instrumento BIGINT NOT NULL,
 id_item BIGINT NOT NULL,
 valor_respuesta SMALLINT NOT NULL,
 valor_puntuado SMALLINT NOT NULL,
 PRIMARY KEY(id_resultado,id_item),
 CONSTRAINT fk_respuesta_resultado FOREIGN KEY(id_resultado) REFERENCES dbo.resultados_evaluacion(id_resultado),
 CONSTRAINT fk_respuesta_item FOREIGN KEY(id_version_instrumento,id_item) REFERENCES dbo.instrumento_items(id_version_instrumento,id_item),
 CONSTRAINT chk_respuesta_valor CHECK(valor_respuesta BETWEEN 0 AND 4 AND valor_puntuado BETWEEN 0 AND 4)
);
GO
CREATE OR ALTER TRIGGER dbo.trg_instrumento_version_inmutable
ON dbo.instrumento_versiones AFTER UPDATE, DELETE
AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted WHERE estado_contenido=N'PUBLICADO')
  THROW 50020,N'Una versión publicada de instrumento es inmutable; cree una versión nueva.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.trg_instrumento_items_publicados
ON dbo.instrumento_items AFTER INSERT, UPDATE, DELETE
AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.instrumento_versiones v ON v.id_version_instrumento=i.id_version_instrumento WHERE v.estado_contenido=N'PUBLICADO')
  OR EXISTS(SELECT 1 FROM deleted d JOIN dbo.instrumento_versiones v ON v.id_version_instrumento=d.id_version_instrumento WHERE v.estado_contenido=N'PUBLICADO')
  THROW 50021,N'No se pueden agregar o modificar ítems de una versión publicada.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.trg_instrumento_opciones_publicadas
ON dbo.instrumento_opciones_respuesta AFTER INSERT, UPDATE, DELETE
AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.instrumento_versiones v ON v.id_version_instrumento=i.id_version_instrumento WHERE v.estado_contenido=N'PUBLICADO')
  OR EXISTS(SELECT 1 FROM deleted d JOIN dbo.instrumento_versiones v ON v.id_version_instrumento=d.id_version_instrumento WHERE v.estado_contenido=N'PUBLICADO')
  THROW 50022,N'No se pueden agregar o modificar opciones de una versión publicada.',1;
END;
GO
PRINT N'Actualización no destructiva de cuestionarios y acceso aplicada.';
