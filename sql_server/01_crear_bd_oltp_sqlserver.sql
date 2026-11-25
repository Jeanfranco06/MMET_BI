/* ============================================================================
   ARCHIVO:  01_crear_bd_oltp_sqlserver.sql
   PROYECTO: Sistema de Inteligencia de Negocios para el Análisis de los Cambios
             en el Estrés (PSS-10) y los Síntomas Postraumáticos (PCL-5)
             asociados a la Meditación y el Mindfulness en Estudiantes Universitarios
   ÁMBITO:   Caso Universitario (Trujillo, Perú — Semestre 2026-II)
   MOTOR:    Microsoft SQL Server 2019 / 2022 (T-SQL)
   ============================================================================
   Uso sugerido en SSMS o sqlcmd:
     sqlcmd -S localhost -E -i "01_crear_bd_oltp_sqlserver.sql"
   ============================================================================ */

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_ID(N'MMET_BI_OLTP') IS NULL
BEGIN
    CREATE DATABASE MMET_BI_OLTP;
END
GO

USE MMET_BI_OLTP;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ============================================================================
-- 0. LIMPIEZA PREVIA DE ESQUEMA (permite reconstrucción limpia sin conflictos)
-- ============================================================================

DROP TABLE IF EXISTS dbo.mediciones_complementarias;
DROP TABLE IF EXISTS dbo.respuestas_evaluacion;
DROP TABLE IF EXISTS dbo.respuestas_borrador;
DROP TABLE IF EXISTS dbo.sesiones_autenticacion;
DROP TABLE IF EXISTS dbo.historial_asistencias;
DROP TABLE IF EXISTS dbo.historial_estados_asignacion;
DROP TABLE IF EXISTS dbo.historial_estados_sesion;
DROP TABLE IF EXISTS dbo.resultados_evaluacion;
DROP TABLE IF EXISTS dbo.oportunidades_evaluacion;
DROP TABLE IF EXISTS dbo.usuarios_sistema;
DROP TABLE IF EXISTS dbo.instrumento_opciones_respuesta;
DROP TABLE IF EXISTS dbo.instrumento_items;
DROP TABLE IF EXISTS dbo.instrumento_versiones;
DROP TABLE IF EXISTS dbo.eventos_indice;
DROP TABLE IF EXISTS dbo.asistencias;
DROP TABLE IF EXISTS dbo.asignaciones;
DROP TABLE IF EXISTS dbo.sesiones;
DROP TABLE IF EXISTS dbo.programas;
DROP TABLE IF EXISTS dbo.estudiantes;
DROP TABLE IF EXISTS dbo.cat_variables_complementarias;
DROP TABLE IF EXISTS dbo.cat_categorias_evento_indice;
DROP TABLE IF EXISTS dbo.cat_instrumentos;
DROP TABLE IF EXISTS dbo.cat_practicas;
DROP TABLE IF EXISTS dbo.fuentes_datos; -- Elimina tabla anterior si existía
GO

-- ============================================================================
-- 1. CATÁLOGOS DEL DOMINIO
-- ============================================================================

CREATE TABLE dbo.cat_practicas (
    id_practica         SMALLINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    codigo_practica     NVARCHAR(20)   NOT NULL,
    nombre_practica     NVARCHAR(100)  NOT NULL,
    descripcion         NVARCHAR(200)  NOT NULL,
    es_mixto            BIT            NOT NULL CONSTRAINT df_pract_mixto DEFAULT (0),
    activo              BIT            NOT NULL CONSTRAINT df_pract_activo DEFAULT (1),

    CONSTRAINT uq_cat_practicas_codigo UNIQUE (codigo_practica)
);
GO

CREATE TABLE dbo.cat_instrumentos (
    id_instrumento          SMALLINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    codigo_instrumento      NVARCHAR(15)   NOT NULL,
    version_instrumento     NVARCHAR(30)   NOT NULL,
    nombre_instrumento      NVARCHAR(120)  NOT NULL,
    puntaje_minimo          SMALLINT       NOT NULL,
    puntaje_maximo          SMALLINT       NOT NULL,
    requiere_evento_indice  BIT            NOT NULL,
    activo                  BIT            NOT NULL CONSTRAINT df_instr_activo DEFAULT (1),

    CONSTRAINT uq_cat_instr_codigo_ver UNIQUE (codigo_instrumento, version_instrumento),
    CONSTRAINT uq_cat_instr_id_codigo UNIQUE (id_instrumento, codigo_instrumento),
    CONSTRAINT chk_cat_instr_codigo CHECK (codigo_instrumento IN (N'PSS-10', N'PCL-5')),
    CONSTRAINT chk_cat_instr_rango CHECK (
        (codigo_instrumento = N'PSS-10' AND puntaje_minimo = 0 AND puntaje_maximo = 40 AND requiere_evento_indice = 0)
        OR
        (codigo_instrumento = N'PCL-5'  AND puntaje_minimo = 0 AND puntaje_maximo = 80 AND requiere_evento_indice = 1)
    )
);
GO

CREATE TABLE dbo.cat_categorias_evento_indice (
    id_categoria_evento SMALLINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    codigo_categoria    NVARCHAR(40)   NOT NULL,
    nombre_categoria    NVARCHAR(120)  NOT NULL,
    activo              BIT            NOT NULL CONSTRAINT df_catevt_activo DEFAULT (1),

    CONSTRAINT uq_cat_evento_codigo UNIQUE (codigo_categoria)
);
GO

-- ============================================================================
-- 2. ESTUDIANTES, PROGRAMAS, SESIONES, ASIGNACIONES Y ASISTENCIAS
--    (RQ-BI-06, RQ-BI-07, E-1, E-2, RO-03, KPI-03, RG-03)
-- ============================================================================

CREATE TABLE dbo.estudiantes (
    id_estudiante        BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    codigo_estudiante    NVARCHAR(50)   NOT NULL,
    nombres              NVARCHAR(100)  NOT NULL,
    apellidos            NVARCHAR(100)  NOT NULL,
    correo_institucional NVARCHAR(150)  NOT NULL,
    edad_anios           SMALLINT       NOT NULL,
    sexo_codificado      NVARCHAR(20)   NOT NULL,
    facultad_o_area      NVARCHAR(80)   NOT NULL,
    carrera              NVARCHAR(120)  NOT NULL,
    ciclo_academico      SMALLINT       NOT NULL,
    creado_en            DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_est_creado DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT uq_est_codigo UNIQUE (codigo_estudiante),
    CONSTRAINT uq_est_correo UNIQUE (correo_institucional),
    CONSTRAINT chk_est_edad_adulto CHECK (edad_anios BETWEEN 18 AND 99),
    CONSTRAINT chk_est_ciclo CHECK (ciclo_academico BETWEEN 1 AND 14)
);
GO

CREATE TABLE dbo.programas (
    id_programa             BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    codigo_programa         NVARCHAR(40)   NOT NULL,
    nombre_programa         NVARCHAR(150)  NOT NULL,
    periodo_academico       NVARCHAR(20)   NOT NULL,
    id_practica_principal   SMALLINT       NOT NULL,
    fecha_inicio            DATE           NOT NULL,
    fecha_cierre            DATE           NOT NULL,
    dias_ventana_inicial    SMALLINT       NOT NULL CONSTRAINT df_prog_dvi DEFAULT (14),
    dias_ventana_final      SMALLINT       NOT NULL CONSTRAINT df_prog_dvf DEFAULT (14),
    ventana_inicial_inicio  DATE           NOT NULL,
    ventana_inicial_fin     DATE           NOT NULL,
    ventana_final_inicio    DATE           NOT NULL,
    ventana_final_fin       DATE           NOT NULL,
    estado_programa         NVARCHAR(20)   NOT NULL CONSTRAINT df_prog_estado DEFAULT (N'PLANIFICADO'),
    creado_en               DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_prog_creado DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT fk_prog_practica
        FOREIGN KEY (id_practica_principal)
        REFERENCES dbo.cat_practicas (id_practica),
    CONSTRAINT uq_prog_codigo UNIQUE (codigo_programa),
    CONSTRAINT chk_prog_fechas CHECK (fecha_cierre >= fecha_inicio),
    CONSTRAINT chk_prog_dias_ventana CHECK (dias_ventana_inicial >= 0 AND dias_ventana_final >= 0),
    CONSTRAINT chk_prog_ventanas CHECK (
        ventana_inicial_inicio <= ventana_inicial_fin
        AND ventana_final_inicio <= ventana_final_fin
        AND ventana_final_inicio >= ventana_inicial_fin
    ),
    CONSTRAINT chk_prog_estado CHECK (
        estado_programa IN (N'PLANIFICADO', N'ACTIVO', N'FINALIZADO', N'CANCELADO')
    )
);
GO

CREATE TABLE dbo.sesiones (
    id_sesion               BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_programa             BIGINT         NOT NULL,
    numero_sesion           SMALLINT       NOT NULL,
    id_practica_tecnica     SMALLINT       NOT NULL,
    modalidad               NVARCHAR(15)   NOT NULL,
    duracion_programada_min SMALLINT       NOT NULL,
    fecha_sesion            DATE           NOT NULL,
    fecha_hora_inicio       DATETIMEOFFSET(0) NOT NULL,
    estado_sesion           NVARCHAR(20)   NOT NULL CONSTRAINT df_ses_estado DEFAULT (N'PROGRAMADA'),
    fecha_cambio_estado     DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_ses_fcambio DEFAULT (SYSDATETIMEOFFSET()),
    motivo_estado_codigo    NVARCHAR(40)   NULL,

    CONSTRAINT fk_ses_programa
        FOREIGN KEY (id_programa)
        REFERENCES dbo.programas (id_programa),
    CONSTRAINT fk_ses_practica
        FOREIGN KEY (id_practica_tecnica)
        REFERENCES dbo.cat_practicas (id_practica),
    CONSTRAINT uq_ses_prog_numero UNIQUE (id_programa, numero_sesion),
    CONSTRAINT uq_ses_prog_id UNIQUE (id_programa, id_sesion),
    CONSTRAINT chk_ses_numero CHECK (numero_sesion > 0),
    CONSTRAINT chk_ses_modalidad CHECK (modalidad IN (N'PRESENCIAL', N'VIRTUAL', N'HIBRIDA')),
    CONSTRAINT chk_ses_duracion CHECK (duracion_programada_min BETWEEN 5 AND 480),
    CONSTRAINT chk_ses_estado CHECK (
        estado_sesion IN (N'PROGRAMADA', N'REALIZADA', N'CANCELADA', N'NO_REALIZADA')
    )
);
GO

CREATE TABLE dbo.asignaciones (
    id_asignacion         BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_estudiante         BIGINT         NOT NULL,
    id_programa           BIGINT         NOT NULL,
    fecha_inscripcion     DATE           NOT NULL,
    estado_asignacion     NVARCHAR(20)   NOT NULL CONSTRAINT df_asig_estado DEFAULT (N'INSCRITO'),
    fecha_retiro          DATE           NULL,
    motivo_retiro_codigo  NVARCHAR(40)   NULL,
    actualizado_en        DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_asig_act DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT fk_asig_estudiante
        FOREIGN KEY (id_estudiante)
        REFERENCES dbo.estudiantes (id_estudiante),
    CONSTRAINT fk_asig_programa
        FOREIGN KEY (id_programa)
        REFERENCES dbo.programas (id_programa),
    CONSTRAINT uq_asig_est_prog UNIQUE (id_estudiante, id_programa),
    CONSTRAINT uq_asig_prog_id UNIQUE (id_programa, id_asignacion),
    CONSTRAINT uq_asig_est_prog_id UNIQUE (id_estudiante, id_programa, id_asignacion),
    CONSTRAINT chk_asig_estado CHECK (
        estado_asignacion IN (N'INSCRITO', N'ACTIVO', N'RETIRADO', N'COMPLETADO')
    ),
    CONSTRAINT chk_asig_retiro_coherente CHECK (
        (estado_asignacion = N'RETIRADO' AND fecha_retiro IS NOT NULL AND fecha_retiro >= fecha_inscripcion)
        OR
        (estado_asignacion <> N'RETIRADO' AND fecha_retiro IS NULL)
    )
);
GO

CREATE TABLE dbo.asistencias (
    id_asistencia       BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_programa         BIGINT         NOT NULL,
    id_asignacion       BIGINT         NOT NULL,
    id_sesion           BIGINT         NOT NULL,
    estado_asistencia   NVARCHAR(20)   NOT NULL,
    minutos_asistidos   SMALLINT       NULL,
    registrado_en       DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_asis_reg DEFAULT (SYSDATETIMEOFFSET()),
    actualizado_en      DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_asis_act DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT fk_asis_asignacion
        FOREIGN KEY (id_programa, id_asignacion)
        REFERENCES dbo.asignaciones (id_programa, id_asignacion),
    CONSTRAINT fk_asis_sesion
        FOREIGN KEY (id_programa, id_sesion)
        REFERENCES dbo.sesiones (id_programa, id_sesion),
    CONSTRAINT uq_asis_asig_sesion UNIQUE (id_asignacion, id_sesion),
    CONSTRAINT chk_asis_estado CHECK (
        estado_asistencia IN (N'ASISTIO', N'INASISTENCIA', N'RETIRO_BAJA')
    ),
    CONSTRAINT chk_asis_minutos CHECK (
        minutos_asistidos IS NULL
        OR (estado_asistencia = N'ASISTIO' AND minutos_asistidos > 0 AND minutos_asistidos <= 480)
        OR (estado_asistencia <> N'ASISTIO' AND minutos_asistidos = 0)
    )
);
GO

-- ============================================================================
-- 3. EVENTOS ÍNDICE Y EVALUACIONES PSICOLÓGICAS (PSS-10 / PCL-5)
--    (RQ-BI-03, RQ-BI-04, RQ-BI-05, KPI-01, KPI-02, KPI-04, RO-04, RG-01)
-- ============================================================================

CREATE TABLE dbo.eventos_indice (
    id_evento_indice            BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_estudiante               BIGINT         NOT NULL,
    id_categoria_evento         SMALLINT       NOT NULL,
    codigo_evento_local         NVARCHAR(30)   NOT NULL,
    anio_ocurrencia_aprox       SMALLINT       NULL,
    descripcion_evento          NVARCHAR(500)  NULL, -- Uso interno OLTP (excluido del Data Mart)
    antecedente_clinico_externo BIT            NOT NULL CONSTRAINT df_evt_ant_ext DEFAULT (0),
    requiere_derivacion         BIT            NOT NULL CONSTRAINT df_evt_deriv   DEFAULT (0),
    vigente                     BIT            NOT NULL CONSTRAINT df_evt_vig DEFAULT (1),
    creado_en                   DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_evt_creado DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT fk_evt_estudiante
        FOREIGN KEY (id_estudiante)
        REFERENCES dbo.estudiantes (id_estudiante),
    CONSTRAINT fk_evt_categoria
        FOREIGN KEY (id_categoria_evento)
        REFERENCES dbo.cat_categorias_evento_indice (id_categoria_evento),
    CONSTRAINT uq_evt_est_codigo UNIQUE (id_estudiante, codigo_evento_local),
    CONSTRAINT uq_evt_est_id UNIQUE (id_estudiante, id_evento_indice),
    CONSTRAINT chk_evt_anio CHECK (
        anio_ocurrencia_aprox IS NULL OR (anio_ocurrencia_aprox BETWEEN 1950 AND 2030)
    )
);
GO

CREATE TABLE dbo.oportunidades_evaluacion (
    id_oportunidad       BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_asignacion        BIGINT         NOT NULL,
    id_estudiante        BIGINT         NOT NULL,
    id_programa          BIGINT         NOT NULL,
    id_instrumento       SMALLINT       NOT NULL,
    codigo_instrumento   NVARCHAR(15)   NOT NULL,
    id_evento_indice     BIGINT         NULL,
    momento              NVARCHAR(10)   NOT NULL,
    fecha_ventana_inicio DATE           NOT NULL,
    fecha_ventana_fin    DATE           NOT NULL,
    fecha_prevista       DATE           NOT NULL,
    aplicable            BIT            NOT NULL CONSTRAINT df_op_apl DEFAULT (1),
    motivo_no_aplicable  NVARCHAR(60)   NULL,
    creado_en            DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_op_creado DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT fk_op_asignacion
        FOREIGN KEY (id_estudiante, id_programa, id_asignacion)
        REFERENCES dbo.asignaciones (id_estudiante, id_programa, id_asignacion),
    CONSTRAINT fk_op_instrumento
        FOREIGN KEY (id_instrumento, codigo_instrumento)
        REFERENCES dbo.cat_instrumentos (id_instrumento, codigo_instrumento),
    CONSTRAINT fk_op_evento_indice
        FOREIGN KEY (id_estudiante, id_evento_indice)
        REFERENCES dbo.eventos_indice (id_estudiante, id_evento_indice),
    CONSTRAINT uq_op_id_instr UNIQUE (id_oportunidad, codigo_instrumento),
    CONSTRAINT chk_op_momento CHECK (momento IN (N'INICIAL', N'FINAL')),
    CONSTRAINT chk_op_fechas CHECK (
        fecha_ventana_inicio <= fecha_ventana_fin
        AND fecha_prevista BETWEEN fecha_ventana_inicio AND fecha_ventana_fin
    ),
    CONSTRAINT chk_op_aplicabilidad CHECK (
        (aplicable = 1 AND motivo_no_aplicable IS NULL)
        OR
        (aplicable = 0 AND motivo_no_aplicable IS NOT NULL)
    ),
    CONSTRAINT chk_op_evento_segun_instrumento CHECK (
        (codigo_instrumento = N'PSS-10' AND id_evento_indice IS NULL)
        OR
        (codigo_instrumento = N'PCL-5'  AND (aplicable = 0 OR id_evento_indice IS NOT NULL))
    )
);
GO

CREATE UNIQUE INDEX uq_op_pss10_unica
    ON dbo.oportunidades_evaluacion (id_asignacion, id_instrumento, momento)
    WHERE codigo_instrumento = N'PSS-10';
GO

CREATE UNIQUE INDEX uq_op_pcl5_unica_con_evento
    ON dbo.oportunidades_evaluacion (id_asignacion, id_instrumento, momento, id_evento_indice)
    WHERE codigo_instrumento = N'PCL-5' AND id_evento_indice IS NOT NULL;
GO

CREATE UNIQUE INDEX uq_op_pcl5_no_aplicable_unica
    ON dbo.oportunidades_evaluacion (id_asignacion, id_instrumento, momento)
    WHERE codigo_instrumento = N'PCL-5' AND id_evento_indice IS NULL;
GO

CREATE TABLE dbo.resultados_evaluacion (
    id_resultado             BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_oportunidad           BIGINT         NOT NULL,
    codigo_instrumento       NVARCHAR(15)   NOT NULL,
    numero_version           SMALLINT       NOT NULL CONSTRAINT df_res_ver DEFAULT (1),
    puntaje_total            SMALLINT       NOT NULL,
    fecha_realizacion        DATE           NOT NULL,
    en_ventana               BIT            NOT NULL,
    estado_validez           NVARCHAR(15)   NOT NULL CONSTRAINT df_res_est DEFAULT (N'VALIDO'),
    es_vigente               BIT            NOT NULL CONSTRAINT df_res_vig DEFAULT (1),
    id_resultado_reemplazado BIGINT         NULL,
    motivo_correccion        NVARCHAR(150)  NULL,
    vigente_desde            DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_res_vdesde DEFAULT (SYSDATETIMEOFFSET()),
    vigente_hasta            DATETIMEOFFSET(0) NULL,

    CONSTRAINT fk_res_oportunidad
        FOREIGN KEY (id_oportunidad, codigo_instrumento)
        REFERENCES dbo.oportunidades_evaluacion (id_oportunidad, codigo_instrumento),
    CONSTRAINT fk_res_reemplazado
        FOREIGN KEY (id_resultado_reemplazado)
        REFERENCES dbo.resultados_evaluacion (id_resultado),
    CONSTRAINT uq_res_op_version UNIQUE (id_oportunidad, numero_version),
    CONSTRAINT chk_res_version CHECK (numero_version >= 1),
    CONSTRAINT chk_res_puntaje_rango CHECK (
        (codigo_instrumento = N'PSS-10' AND puntaje_total BETWEEN 0 AND 40)
        OR
        (codigo_instrumento = N'PCL-5'  AND puntaje_total BETWEEN 0 AND 80)
    ),
    CONSTRAINT chk_res_estado CHECK (estado_validez IN (N'VALIDO', N'REEMPLAZADO', N'ANULADO')),
    CONSTRAINT chk_res_vigencia_coherente CHECK (
        (es_vigente = 1 AND estado_validez = N'VALIDO' AND vigente_hasta IS NULL)
        OR
        (es_vigente = 0 AND estado_validez IN (N'REEMPLAZADO', N'ANULADO') AND vigente_hasta IS NOT NULL)
    ),
    CONSTRAINT chk_res_correccion CHECK (
        (numero_version = 1 AND id_resultado_reemplazado IS NULL)
        OR
        (numero_version > 1 AND id_resultado_reemplazado IS NOT NULL AND motivo_correccion IS NOT NULL)
    ),
    CONSTRAINT chk_res_fechas_vigencia CHECK (
        vigente_hasta IS NULL OR vigente_hasta >= vigente_desde
    )
);
GO

-- ============================================================================
-- 5.1 CUESTIONARIOS COMPLETOS, IDENTIDAD Y TRAZABILIDAD
-- ============================================================================
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
    CONSTRAINT fk_instver_instrumento FOREIGN KEY (id_instrumento) REFERENCES dbo.cat_instrumentos(id_instrumento),
    CONSTRAINT uq_instver UNIQUE(id_instrumento, numero_version, idioma),
    CONSTRAINT uq_instver_id_instr UNIQUE(id_version_instrumento, id_instrumento),
    CONSTRAINT chk_instver_estado CHECK (estado_contenido IN (N'BORRADOR',N'PUBLICADO',N'BLOQUEADO'))
);
GO

CREATE TABLE dbo.instrumento_items (
    id_item BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_version_instrumento BIGINT NOT NULL,
    numero_item SMALLINT NOT NULL,
    texto_item NVARCHAR(2000) NULL,
    puntuacion_inversa BIT NOT NULL CONSTRAINT df_item_inversa DEFAULT(0),
    obligatorio BIT NOT NULL CONSTRAINT df_item_obligatorio DEFAULT(1),
    CONSTRAINT fk_item_version FOREIGN KEY (id_version_instrumento) REFERENCES dbo.instrumento_versiones(id_version_instrumento),
    CONSTRAINT uq_item_num UNIQUE(id_version_instrumento, numero_item),
    CONSTRAINT uq_item_version_id UNIQUE(id_version_instrumento, id_item),
    CONSTRAINT chk_item_num CHECK(numero_item > 0)
);
GO

CREATE TABLE dbo.instrumento_opciones_respuesta (
    id_version_instrumento BIGINT NOT NULL,
    valor SMALLINT NOT NULL,
    etiqueta NVARCHAR(250) NOT NULL,
    PRIMARY KEY(id_version_instrumento, valor),
    CONSTRAINT fk_opcion_version FOREIGN KEY(id_version_instrumento) REFERENCES dbo.instrumento_versiones(id_version_instrumento),
    CONSTRAINT chk_opcion_valor CHECK(valor BETWEEN 0 AND 4)
);
GO

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
CREATE UNIQUE NONCLUSTERED INDEX uq_usuario_estudiante ON dbo.usuarios_sistema(id_estudiante) WHERE id_estudiante IS NOT NULL;
GO

CREATE TABLE dbo.sesiones_autenticacion (
    id_sesion UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    id_usuario BIGINT NOT NULL,
    hash_token VARBINARY(32) NOT NULL,
    creado_en DATETIMEOFFSET(0) NOT NULL,
    expira_en DATETIMEOFFSET(0) NOT NULL,
    revocado_en DATETIMEOFFSET(0) NULL,
    CONSTRAINT fk_auth_usuario FOREIGN KEY(id_usuario) REFERENCES dbo.usuarios_sistema(id_usuario),
    CONSTRAINT uq_auth_hash UNIQUE(hash_token),
    CONSTRAINT chk_auth_fechas CHECK(expira_en > creado_en)
);
GO

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

ALTER TABLE dbo.oportunidades_evaluacion ADD id_version_instrumento BIGINT NULL;
ALTER TABLE dbo.oportunidades_evaluacion ADD CONSTRAINT fk_op_version_instr FOREIGN KEY(id_version_instrumento,id_instrumento) REFERENCES dbo.instrumento_versiones(id_version_instrumento,id_instrumento);
ALTER TABLE dbo.resultados_evaluacion ADD id_usuario_registro BIGINT NULL;
ALTER TABLE dbo.resultados_evaluacion ADD CONSTRAINT fk_resultado_usuario FOREIGN KEY(id_usuario_registro) REFERENCES dbo.usuarios_sistema(id_usuario);
ALTER TABLE dbo.resultados_evaluacion ADD id_usuario_correccion BIGINT NULL;
ALTER TABLE dbo.resultados_evaluacion ADD CONSTRAINT fk_resultado_usuario_corr FOREIGN KEY(id_usuario_correccion) REFERENCES dbo.usuarios_sistema(id_usuario);
GO

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
    IF EXISTS (SELECT 1 FROM deleted WHERE estado_contenido=N'PUBLICADO')
        THROW 50020,N'Una versión publicada de instrumento es inmutable; cree una versión nueva.',1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_instrumento_items_publicados
ON dbo.instrumento_items AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted i JOIN dbo.instrumento_versiones v ON v.id_version_instrumento=i.id_version_instrumento WHERE v.estado_contenido=N'PUBLICADO')
       OR EXISTS (SELECT 1 FROM deleted d JOIN dbo.instrumento_versiones v ON v.id_version_instrumento=d.id_version_instrumento WHERE v.estado_contenido=N'PUBLICADO')
        THROW 50021,N'No se pueden agregar o modificar ítems de una versión publicada.',1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_instrumento_opciones_publicadas
ON dbo.instrumento_opciones_respuesta AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted i JOIN dbo.instrumento_versiones v ON v.id_version_instrumento=i.id_version_instrumento WHERE v.estado_contenido=N'PUBLICADO')
       OR EXISTS (SELECT 1 FROM deleted d JOIN dbo.instrumento_versiones v ON v.id_version_instrumento=d.id_version_instrumento WHERE v.estado_contenido=N'PUBLICADO')
        THROW 50022,N'No se pueden agregar o modificar opciones de una versión publicada.',1;
END;
GO

-- REGLA CRÍTICA: Como máximo UN resultado válido vigente por oportunidad
CREATE UNIQUE INDEX uq_resultado_vigente_por_oportunidad
    ON dbo.resultados_evaluacion (id_oportunidad)
    WHERE es_vigente = 1 AND estado_validez = N'VALIDO';
GO

-- ============================================================================
-- 4. AUDITORÍA OPERATIVA (HISTORIAL DE ESTADOS)
-- ============================================================================

CREATE TABLE dbo.historial_estados_sesion (
    id_historial_sesion BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_sesion           BIGINT         NOT NULL,
    estado_anterior     NVARCHAR(20)   NULL,
    estado_nuevo        NVARCHAR(20)   NOT NULL,
    fecha_cambio        DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_hses_fcambio DEFAULT (SYSDATETIMEOFFSET()),
    motivo_codigo       NVARCHAR(40)   NULL,

    CONSTRAINT fk_hses_sesion FOREIGN KEY (id_sesion) REFERENCES dbo.sesiones (id_sesion),
    CONSTRAINT chk_hses_estado CHECK (
        estado_nuevo IN (N'PROGRAMADA', N'REALIZADA', N'CANCELADA', N'NO_REALIZADA')
    )
);
GO

CREATE TABLE dbo.historial_estados_asignacion (
    id_historial_asignacion BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_asignacion           BIGINT         NOT NULL,
    estado_anterior         NVARCHAR(20)   NULL,
    estado_nuevo            NVARCHAR(20)   NOT NULL,
    fecha_efectiva          DATE           NOT NULL,
    fecha_registro          DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_hasig_freg DEFAULT (SYSDATETIMEOFFSET()),
    motivo_codigo           NVARCHAR(40)   NULL,

    CONSTRAINT fk_hasig_asig FOREIGN KEY (id_asignacion) REFERENCES dbo.asignaciones (id_asignacion),
    CONSTRAINT chk_hasig_estado CHECK (
        estado_nuevo IN (N'INSCRITO', N'ACTIVO', N'RETIRADO', N'COMPLETADO')
    )
);
GO

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

    CONSTRAINT fk_hasis_asignacion
        FOREIGN KEY (id_programa, id_asignacion)
        REFERENCES dbo.asignaciones (id_programa, id_asignacion),
    CONSTRAINT fk_hasis_sesion
        FOREIGN KEY (id_programa, id_sesion)
        REFERENCES dbo.sesiones (id_programa, id_sesion),
    CONSTRAINT chk_hasis_operacion CHECK (tipo_operacion IN (N'INSERT', N'UPDATE', N'DELETE')),
    CONSTRAINT chk_hasis_est_ant CHECK (
        estado_anterior IS NULL OR estado_anterior IN (N'ASISTIO', N'INASISTENCIA', N'RETIRO_BAJA')
    ),
    CONSTRAINT chk_hasis_est_nvo CHECK (
        estado_nuevo IS NULL OR estado_nuevo IN (N'ASISTIO', N'INASISTENCIA', N'RETIRO_BAJA')
    )
);
GO

-- ============================================================================
-- 5. VARIABLES COMPLEMENTARIAS OPCIONALES (RQ-BI-12, AISLADAS DEL NÚCLEO)
-- ============================================================================

CREATE TABLE dbo.cat_variables_complementarias (
    id_variable        SMALLINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    codigo_variable    NVARCHAR(35)   NOT NULL,
    nombre_variable    NVARCHAR(100)  NOT NULL,
    unidad_medida      NVARCHAR(30)   NOT NULL,
    metodo_medicion    NVARCHAR(80)   NOT NULL,
    valor_minimo       DECIMAL(10,3)  NULL,
    valor_maximo       DECIMAL(10,3)  NULL,
    activo             BIT            NOT NULL CONSTRAINT df_varc_act DEFAULT (1),

    CONSTRAINT uq_cat_var_comp_codigo UNIQUE (codigo_variable)
);
GO

CREATE TABLE dbo.mediciones_complementarias (
    id_medicion         BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_estudiante       BIGINT         NOT NULL,
    id_asignacion       BIGINT         NULL,
    id_variable         SMALLINT       NOT NULL,
    valor_numerico      DECIMAL(10,3)  NOT NULL,
    unidad_medida       NVARCHAR(30)   NOT NULL,
    metodo_medicion     NVARCHAR(80)   NOT NULL,
    fecha_hora_medicion DATETIMEOFFSET(0) NOT NULL,
    es_vigente          BIT            NOT NULL CONSTRAINT df_mcomp_vig DEFAULT (1),
    registrado_en       DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_mcomp_reg DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT fk_mcomp_estudiante
        FOREIGN KEY (id_estudiante)
        REFERENCES dbo.estudiantes (id_estudiante),
    CONSTRAINT fk_mcomp_asignacion
        FOREIGN KEY (id_asignacion)
        REFERENCES dbo.asignaciones (id_asignacion),
    CONSTRAINT fk_mcomp_variable
        FOREIGN KEY (id_variable)
        REFERENCES dbo.cat_variables_complementarias (id_variable)
);
GO

-- ============================================================================
-- 6. REGLAS OPERATIVAS ENTRE TABLAS (TRIGGERS SET-BASED)
-- ============================================================================

CREATE OR ALTER TRIGGER dbo.trg_validar_sesion_practica
ON dbo.sesiones
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
          FROM inserted i
          JOIN dbo.cat_practicas cp ON cp.id_practica = i.id_practica_tecnica
         WHERE cp.es_mixto = 1
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50000, N'Una sesión individual debe tener una técnica concreta (P-01 a P-04), no MIXTO.', 1;
    END
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_validar_asistencia_sesion
ON dbo.asistencias
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
          FROM inserted i
          JOIN dbo.sesiones s ON s.id_sesion = i.id_sesion
         WHERE s.estado_sesion <> N'REALIZADA'
           AND i.estado_asistencia IN (N'ASISTIO', N'INASISTENCIA')
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50001, N'Las sesiones canceladas, no realizadas o programadas no pueden generar asistencias ni inasistencias.', 1;
    END
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

    -- En UPDATE, conserva registrado_en original y actualiza actualizado_en
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

    -- En INSERT, registra la creación inicial en historial
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

    -- En DELETE, conserva el último estado conocido
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

CREATE OR ALTER TRIGGER dbo.trg_validar_resultado_oportunidad
ON dbo.resultados_evaluacion
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
          FROM inserted i
          JOIN dbo.oportunidades_evaluacion op ON op.id_oportunidad = i.id_oportunidad
         WHERE op.aplicable = 0
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50002, N'No se puede registrar un resultado en una oportunidad marcada como no aplicable.', 1;
    END

    IF EXISTS (
        SELECT 1
          FROM inserted i
          JOIN dbo.oportunidades_evaluacion op ON op.id_oportunidad = i.id_oportunidad
         WHERE i.en_ventana <> CASE
                                   WHEN i.fecha_realizacion BETWEEN op.fecha_ventana_inicio AND op.fecha_ventana_fin
                                   THEN 1 ELSE 0
                               END
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50003, N'Inconsistencia en el indicador en_ventana respecto al rango de fechas de la oportunidad.', 1;
    END
END;
GO

-- ============================================================================
-- 7. ÍNDICES PARA CONSULTAS POR FECHA DE CORTE (C) Y REPORTES BI
-- ============================================================================

CREATE INDEX ix_programas_periodo_practica
    ON dbo.programas (periodo_academico, id_practica_principal, estado_programa);

CREATE INDEX ix_sesiones_prog_fecha_estado
    ON dbo.sesiones (id_programa, fecha_sesion, estado_sesion);

CREATE INDEX ix_asignaciones_prog_estado_retiro
    ON dbo.asignaciones (id_programa, estado_asignacion, fecha_retiro);

CREATE INDEX ix_asistencias_asig_estado
    ON dbo.asistencias (id_asignacion, estado_asistencia, id_sesion);

CREATE INDEX ix_hasis_asig_sesion_fecha
    ON dbo.historial_asistencias (id_asignacion, id_sesion, fecha_cambio);

CREATE INDEX ix_op_eval_corte_kpi04
    ON dbo.oportunidades_evaluacion (id_programa, aplicable, fecha_ventana_inicio, fecha_ventana_fin);

CREATE INDEX ix_op_eval_pares_kpi01_02
    ON dbo.oportunidades_evaluacion (id_asignacion, id_instrumento, id_evento_indice, momento);

CREATE INDEX ix_res_eval_fecha_vigencia
    ON dbo.resultados_evaluacion (id_oportunidad, fecha_realizacion, es_vigente, en_ventana);

CREATE INDEX ix_res_eval_historial_corte
    ON dbo.resultados_evaluacion (id_oportunidad, vigente_desde, vigente_hasta);

CREATE INDEX ix_mcomp_est_fecha
    ON dbo.mediciones_complementarias (id_estudiante, id_variable, fecha_hora_medicion);
GO
