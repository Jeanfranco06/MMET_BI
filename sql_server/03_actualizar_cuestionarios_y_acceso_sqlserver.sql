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
 CONSTRAINT chk_usuario_rol CHECK(rol IN(N'ESTUDIANTE',N'COORDINACION',N'EVALUACION',N'DIRECCION',N'ADMIN'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_usuario_estudiante' AND object_id = OBJECT_ID(N'dbo.usuarios_sistema'))
CREATE UNIQUE NONCLUSTERED INDEX uq_usuario_estudiante ON dbo.usuarios_sistema(id_estudiante) WHERE id_estudiante IS NOT NULL;
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

-- Trazabilidad temporal de asistencias (evita sobrescritura sin historial)
IF COL_LENGTH(N'dbo.asistencias', N'actualizado_en') IS NULL
BEGIN
 ALTER TABLE dbo.asistencias
  ADD actualizado_en DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_asis_act DEFAULT (SYSDATETIMEOFFSET());
 EXEC sp_executesql N'UPDATE dbo.asistencias SET actualizado_en = registrado_en;';
END;
GO

IF OBJECT_ID(N'dbo.historial_asistencias', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.historial_asistencias (
  id_historial_asistencia BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  id_asistencia           BIGINT         NULL,
  id_programa             BIGINT         NOT NULL,
  id_asignacion           BIGINT         NOT NULL,
  id_sesion               BIGINT         NOT NULL,
  tipo_operacion          NVARCHAR(10)   NOT NULL,
  estado_anterior         NVARCHAR(20)   NULL,
  estado_nuevo            NVARCHAR(20)   NULL,
  minutos_anteriores      SMALLINT       NULL,
  minutos_nuevos          SMALLINT       NULL,
  fecha_registro_original DATETIMEOFFSET(0) NULL,
  fecha_cambio            DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_hasis_fcambio DEFAULT (SYSDATETIMEOFFSET()),
  usuario_db              NVARCHAR(128)  NOT NULL CONSTRAINT df_hasis_usr DEFAULT (ORIGINAL_LOGIN()),
  CONSTRAINT fk_hasis_asignacion FOREIGN KEY (id_programa, id_asignacion)
   REFERENCES dbo.asignaciones (id_programa, id_asignacion),
  CONSTRAINT fk_hasis_sesion FOREIGN KEY (id_programa, id_sesion)
   REFERENCES dbo.sesiones (id_programa, id_sesion),
  CONSTRAINT chk_hasis_operacion CHECK (tipo_operacion IN (N'INSERT', N'UPDATE', N'DELETE')),
  CONSTRAINT chk_hasis_est_ant CHECK (estado_anterior IS NULL OR estado_anterior IN (N'ASISTIO', N'INASISTENCIA', N'RETIRO_BAJA')),
  CONSTRAINT chk_hasis_est_nvo CHECK (estado_nuevo IS NULL OR estado_nuevo IN (N'ASISTIO', N'INASISTENCIA', N'RETIRO_BAJA'))
 );
 CREATE INDEX ix_hasis_asig_sesion_fecha
  ON dbo.historial_asistencias (id_asignacion, id_sesion, fecha_cambio);
END;
GO

-- Poblar línea base histórica para asistencias existentes si aún no tienen evento inicial
IF NOT EXISTS (SELECT 1 FROM dbo.historial_asistencias)
BEGIN
 INSERT INTO dbo.historial_asistencias (
  id_asistencia, id_programa, id_asignacion, id_sesion,
  tipo_operacion, estado_anterior, estado_nuevo,
  minutos_anteriores, minutos_nuevos,
  fecha_registro_original, fecha_cambio
 )
 SELECT
  a.id_asistencia, a.id_programa, a.id_asignacion, a.id_sesion,
  N'INSERT', NULL, a.estado_asistencia,
  NULL, a.minutos_asistidos,
  a.registrado_en, a.registrado_en
 FROM dbo.asistencias a;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_auditar_asistencias
ON dbo.asistencias
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
 SET NOCOUNT ON;

 IF TRIGGER_NESTLEVEL() > 1
  RETURN;

 DECLARE @ahora DATETIMEOFFSET(0) = SYSDATETIMEOFFSET();

 IF EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted)
 BEGIN
  UPDATE a
     SET a.registrado_en  = d.registrado_en,
         a.actualizado_en = @ahora
    FROM dbo.asistencias a
    JOIN deleted d ON d.id_asistencia = a.id_asistencia;

  INSERT INTO dbo.historial_asistencias (
   id_asistencia, id_programa, id_asignacion, id_sesion,
   tipo_operacion, estado_anterior, estado_nuevo,
   minutos_anteriores, minutos_nuevos,
   fecha_registro_original, fecha_cambio
  )
  SELECT
   i.id_asistencia, i.id_programa, i.id_asignacion, i.id_sesion,
   N'UPDATE', d.estado_asistencia, i.estado_asistencia,
   d.minutos_asistidos, i.minutos_asistidos,
   d.registrado_en, @ahora
  FROM inserted i
  JOIN deleted d ON d.id_asistencia = i.id_asistencia;
  RETURN;
 END

 IF EXISTS (SELECT 1 FROM inserted)
 BEGIN
  INSERT INTO dbo.historial_asistencias (
   id_asistencia, id_programa, id_asignacion, id_sesion,
   tipo_operacion, estado_anterior, estado_nuevo,
   minutos_anteriores, minutos_nuevos,
   fecha_registro_original, fecha_cambio
  )
  SELECT
   i.id_asistencia, i.id_programa, i.id_asignacion, i.id_sesion,
   N'INSERT', NULL, i.estado_asistencia,
   NULL, i.minutos_asistidos,
   i.registrado_en, i.registrado_en
  FROM inserted i;
  RETURN;
 END

 IF EXISTS (SELECT 1 FROM deleted)
 BEGIN
  INSERT INTO dbo.historial_asistencias (
   id_asistencia, id_programa, id_asignacion, id_sesion,
   tipo_operacion, estado_anterior, estado_nuevo,
   minutos_anteriores, minutos_nuevos,
   fecha_registro_original, fecha_cambio
  )
  SELECT
   d.id_asistencia, d.id_programa, d.id_asignacion, d.id_sesion,
   N'DELETE', d.estado_asistencia, NULL,
   d.minutos_asistidos, NULL,
   d.registrado_en, @ahora
  FROM deleted d;
 END
END;
GO
PRINT N'Actualización no destructiva de cuestionarios, acceso y trazabilidad de asistencias aplicada.';
