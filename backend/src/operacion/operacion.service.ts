import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  CrearAsignacionDto,
  CrearEstudianteDto,
  CrearEventoIndiceDto,
  CrearSesionDto,
  RegistrarAsistenciaDto,
  RegistrarResultadoDto,
} from './operacion.controller';

@Injectable()
export class OperacionService {
  constructor(private readonly db: DatabaseService) {}

  async getEstudiantes(f: { buscar?: string; facultad?: string; page?: number; pageSize?: number }) {
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 15;
    const offset = (page - 1) * pageSize;
    const params = {
      buscar: f.buscar ? `%${f.buscar}%` : null,
      facultad: f.facultad || null,
      offset,
      pageSize,
    };

    const whereClause = `
      WHERE (@facultad IS NULL OR e.facultad_o_area = @facultad)
        AND (
          @buscar IS NULL
          OR e.codigo_estudiante LIKE @buscar
          OR e.nombres LIKE @buscar
          OR e.apellidos LIKE @buscar
          OR e.correo_institucional LIKE @buscar
          OR e.carrera LIKE @buscar
        )
    `;

    const [countRows, rows] = await Promise.all([
      this.db.query<{ total_registros: number }>(
        `SELECT COUNT(*) AS total_registros FROM dbo.estudiantes e ${whereClause}`,
        params,
      ),
      this.db.query(
        `
        SELECT
          e.id_estudiante,
          e.codigo_estudiante,
          e.nombres,
          e.apellidos,
          e.correo_institucional,
          e.edad_anios,
          e.sexo_codificado,
          e.facultad_o_area,
          e.carrera,
          e.ciclo_academico,
          COUNT(a.id_asignacion) AS programas_inscritos,
          ISNULL(STRING_AGG(p.codigo_programa, N', '), N'') AS programas_codigos
        FROM dbo.estudiantes e
        LEFT JOIN dbo.asignaciones a ON a.id_estudiante = e.id_estudiante
        LEFT JOIN dbo.programas p ON p.id_programa = a.id_programa
        ${whereClause}
        GROUP BY
          e.id_estudiante,
          e.codigo_estudiante,
          e.nombres,
          e.apellidos,
          e.correo_institucional,
          e.edad_anios,
          e.sexo_codificado,
          e.facultad_o_area,
          e.carrera,
          e.ciclo_academico
        ORDER BY e.id_estudiante DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        `,
        params,
      ),
    ]);

    const totalRegistros = Number(countRows[0]?.total_registros || 0);
    return {
      paginacion: {
        page,
        pageSize,
        totalRegistros,
        totalPaginas: Math.max(1, Math.ceil(totalRegistros / pageSize)),
      },
      estudiantes: rows.map((r) => ({
        ...r,
        id_estudiante: Number(r.id_estudiante),
        edad_anios: Number(r.edad_anios),
        ciclo_academico: Number(r.ciclo_academico),
        programas_inscritos: Number(r.programas_inscritos || 0),
        programas_codigos: r.programas_codigos ? String(r.programas_codigos).split(', ') : [],
      })),
    };
  }

  async crearEstudiante(dto: CrearEstudianteDto) {
    const codigo = dto.codigo_estudiante.trim().toUpperCase();
    const correo = dto.correo_institucional.trim().toLowerCase();
    const nombres = dto.nombres.trim();
    const apellidos = dto.apellidos.trim();
    const facultad = dto.facultad_o_area.trim();
    const carrera = dto.carrera.trim();

    if (dto.edad_anios < 18 || dto.edad_anios > 99) {
      throw new BadRequestException('La edad del estudiante debe estar entre 18 y 99 años.');
    }
    if (dto.ciclo_academico < 1 || dto.ciclo_academico > 14) {
      throw new BadRequestException('El ciclo académico debe estar entre 1 y 14.');
    }

    const dup = await this.db.query<{ codigo_estudiante: string; correo_institucional: string }>(
      `
      SELECT TOP 1 codigo_estudiante, correo_institucional
      FROM dbo.estudiantes
      WHERE codigo_estudiante = @codigo OR LOWER(correo_institucional) = @correo
      `,
      { codigo, correo },
    );
    if (dup.length > 0) {
      if (dup[0].codigo_estudiante.toUpperCase() === codigo) {
        throw new ConflictException(`Ya existe un estudiante registrado con el código ${codigo}.`);
      }
      throw new ConflictException(`Ya existe un estudiante registrado con el correo ${correo}.`);
    }

    try {
      const inserted = await this.db.query<any>(
        `
        INSERT INTO dbo.estudiantes (
          codigo_estudiante, nombres, apellidos, correo_institucional,
          edad_anios, sexo_codificado, facultad_o_area, carrera, ciclo_academico
        )
        OUTPUT
          INSERTED.id_estudiante,
          INSERTED.codigo_estudiante,
          INSERTED.nombres,
          INSERTED.apellidos,
          INSERTED.correo_institucional,
          INSERTED.edad_anios,
          INSERTED.sexo_codificado,
          INSERTED.facultad_o_area,
          INSERTED.carrera,
          INSERTED.ciclo_academico
        VALUES (
          @codigo, @nombres, @apellidos, @correo,
          @edad, @sexo, @facultad, @carrera, @ciclo
        );
        `,
        {
          codigo,
          nombres,
          apellidos,
          correo,
          edad: dto.edad_anios,
          sexo: dto.sexo_codificado,
          facultad,
          carrera,
          ciclo: dto.ciclo_academico,
        },
      );

      return {
        ok: true,
        mensaje: `Estudiante ${codigo} (${nombres} ${apellidos}) registrado correctamente.`,
        estudiante: inserted[0],
      };
    } catch (err: any) {
      if (err?.number === 2627 || err?.number === 2601) {
        throw new ConflictException('El código de estudiante o el correo institucional ya se encuentran registrados.');
      }
      throw new BadRequestException(err?.message || 'Error al registrar el estudiante en SQL Server.');
    }
  }

  async crearAsignacion(dto: CrearAsignacionDto) {
    const [estRows, progRows, existingRows] = await Promise.all([
      this.db.query<any>(
        `SELECT id_estudiante, codigo_estudiante, nombres, apellidos FROM dbo.estudiantes WHERE id_estudiante = @id`,
        { id: dto.id_estudiante },
      ),
      this.db.query<any>(
        `
        SELECT
          id_programa,
          codigo_programa,
          nombre_programa,
          estado_programa,
          CONVERT(VARCHAR(10), ventana_inicial_inicio, 23) AS ventana_inicial_inicio,
          CONVERT(VARCHAR(10), ventana_inicial_fin, 23) AS ventana_inicial_fin,
          CONVERT(VARCHAR(10), ventana_final_inicio, 23) AS ventana_final_inicio,
          CONVERT(VARCHAR(10), ventana_final_fin, 23) AS ventana_final_fin
        FROM dbo.programas
        WHERE id_programa = @id
        `,
        { id: dto.id_programa },
      ),
      this.db.query<any>(
        `
        SELECT id_asignacion
        FROM dbo.asignaciones
        WHERE id_estudiante = @idEst AND id_programa = @idProg
        `,
        { idEst: dto.id_estudiante, idProg: dto.id_programa },
      ),
    ]);

    if (!estRows.length) {
      throw new NotFoundException(`No existe el estudiante con id ${dto.id_estudiante}.`);
    }
    if (!progRows.length) {
      throw new NotFoundException(`No existe el programa con id ${dto.id_programa}.`);
    }
    if (progRows[0].estado_programa === 'CANCELADO') {
      throw new BadRequestException(`El programa ${progRows[0].codigo_programa} está CANCELADO y no admite inscripciones.`);
    }
    if (existingRows.length > 0) {
      throw new ConflictException(
        `El estudiante ${estRows[0].codigo_estudiante} ya se encuentra inscrito en el programa ${progRows[0].codigo_programa}.`,
      );
    }

    const fechaInscripcion = dto.fecha_inscripcion
      ? String(dto.fecha_inscripcion).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const prog = progRows[0];
    const tieneVentanasActivas =
      (prog.estado_programa === 'ACTIVO' || prog.estado_programa === 'PLANIFICADO') &&
      Boolean(
        prog.ventana_inicial_inicio &&
          prog.ventana_inicial_fin &&
          prog.ventana_final_inicio &&
          prog.ventana_final_fin,
      );

    const tx = await this.db.beginTransaction();
    try {
      const reqIns = tx.request();
      reqIns.input('idEst', dto.id_estudiante);
      reqIns.input('idProg', dto.id_programa);
      reqIns.input('fecha', fechaInscripcion);
      const insRes = await reqIns.query(`
        SET NOCOUNT ON;
        DECLARE @nueva TABLE (id_asignacion BIGINT);
        INSERT INTO dbo.asignaciones (id_estudiante, id_programa, fecha_inscripcion, estado_asignacion)
        OUTPUT INSERTED.id_asignacion INTO @nueva
        VALUES (@idEst, @idProg, CAST(@fecha AS DATE), N'INSCRITO');

        DECLARE @idAsig BIGINT = (SELECT TOP 1 id_asignacion FROM @nueva);

        INSERT INTO dbo.historial_estados_asignacion (
          id_asignacion, estado_anterior, estado_nuevo, fecha_efectiva, motivo_codigo
        )
        VALUES (@idAsig, NULL, N'INSCRITO', CAST(@fecha AS DATE), N'INSCRIPCION_DIRECTA');

        SELECT
          @idAsig AS id_asignacion,
          @idEst AS id_estudiante,
          @idProg AS id_programa,
          @fecha AS fecha_inscripcion,
          N'INSCRITO' AS estado_asignacion;
      `);

      const asignacion = insRes.recordset?.[0];
      let oportunidadesGeneradas = 0;

      if (tieneVentanasActivas && asignacion?.id_asignacion) {
        const reqOps = tx.request();
        reqOps.input('idAsig', Number(asignacion.id_asignacion));
        reqOps.input('idEst', dto.id_estudiante);
        reqOps.input('idProg', dto.id_programa);
        reqOps.input('viIni', prog.ventana_inicial_inicio);
        reqOps.input('viFin', prog.ventana_inicial_fin);
        reqOps.input('vfIni', prog.ventana_final_inicio);
        reqOps.input('vfFin', prog.ventana_final_fin);

        const opsRes = await reqOps.query(`
          SET NOCOUNT ON;
          DECLARE @idInstr SMALLINT = (
            SELECT TOP 1 id_instrumento
            FROM dbo.cat_instrumentos
            WHERE codigo_instrumento = N'PSS-10' AND activo = 1
            ORDER BY id_instrumento ASC
          );
          DECLARE @idVer BIGINT = (
            SELECT TOP 1 id_version_instrumento
            FROM dbo.instrumento_versiones
            WHERE id_instrumento = @idInstr AND estado_contenido = N'PUBLICADO'
            ORDER BY id_version_instrumento DESC
          );

          IF @idInstr IS NOT NULL
          BEGIN
            INSERT INTO dbo.oportunidades_evaluacion (
              id_asignacion, id_estudiante, id_programa, id_instrumento, codigo_instrumento,
              id_evento_indice, momento, fecha_ventana_inicio, fecha_ventana_fin, fecha_prevista,
              aplicable, id_version_instrumento
            )
            VALUES
              (@idAsig, @idEst, @idProg, @idInstr, N'PSS-10', NULL, N'INICIAL',
               CAST(@viIni AS DATE), CAST(@viFin AS DATE), CAST(@viFin AS DATE), 1, @idVer),
              (@idAsig, @idEst, @idProg, @idInstr, N'PSS-10', NULL, N'FINAL',
               CAST(@vfIni AS DATE), CAST(@vfFin AS DATE), CAST(@vfIni AS DATE), 1, @idVer);
            SELECT 2 AS generadas;
          END
          ELSE
          BEGIN
            SELECT 0 AS generadas;
          END
        `);
        oportunidadesGeneradas = Number(opsRes.recordset?.[0]?.generadas || 0);
      }

      await tx.commit();

      return {
        ok: true,
        mensaje:
          oportunidadesGeneradas > 0
            ? `Estudiante ${estRows[0].codigo_estudiante} inscrito en ${prog.codigo_programa}. Se generaron automáticamente ${oportunidadesGeneradas} oportunidades PSS-10 (INICIAL y FINAL).`
            : `Estudiante ${estRows[0].codigo_estudiante} inscrito en ${prog.codigo_programa}.`,
        asignacion,
        oportunidades_generadas: oportunidadesGeneradas,
      };
    } catch (err: any) {
      await tx.rollback();
      if (err?.number === 2627 || err?.number === 2601) {
        throw new ConflictException(
          `El estudiante ${estRows[0].codigo_estudiante} ya se encuentra inscrito en ${prog.codigo_programa}.`,
        );
      }
      throw new BadRequestException(err?.message || 'Error al registrar la inscripción en SQL Server.');
    }
  }

  async getCategoriasEvento() {
    return this.db.query(
      `
      SELECT id_categoria_evento, codigo_categoria, nombre_categoria
      FROM dbo.cat_categorias_evento_indice
      WHERE activo = 1
      ORDER BY id_categoria_evento
      `,
    );
  }

  async getEventosIndice(f: { idEstudiante?: number; codigoEstudiante?: string }) {
    const rows = await this.db.query(
      `
      SELECT TOP 60
        ev.id_evento_indice,
        ev.id_estudiante,
        e.codigo_estudiante,
        e.nombres,
        e.apellidos,
        ev.id_categoria_evento,
        c.codigo_categoria,
        c.nombre_categoria,
        ev.codigo_evento_local,
        ev.anio_ocurrencia_aprox,
        ev.descripcion_evento,
        ev.antecedente_clinico_externo,
        ev.requiere_derivacion,
        ev.vigente,
        ev.creado_en
      FROM dbo.eventos_indice ev
      JOIN dbo.estudiantes e ON e.id_estudiante = ev.id_estudiante
      JOIN dbo.cat_categorias_evento_indice c ON c.id_categoria_evento = ev.id_categoria_evento
      WHERE (@idEst IS NULL OR ev.id_estudiante = @idEst)
        AND (@codEst IS NULL OR e.codigo_estudiante LIKE @codEst)
      ORDER BY ev.creado_en DESC, ev.id_evento_indice DESC
      `,
      {
        idEst: f.idEstudiante ?? null,
        codEst: f.codigoEstudiante ? `%${f.codigoEstudiante}%` : null,
      },
    );

    return rows.map((r) => ({
      ...r,
      id_evento_indice: Number(r.id_evento_indice),
      id_estudiante: Number(r.id_estudiante),
      id_categoria_evento: Number(r.id_categoria_evento),
      anio_ocurrencia_aprox: r.anio_ocurrencia_aprox != null ? Number(r.anio_ocurrencia_aprox) : null,
      antecedente_clinico_externo: Boolean(r.antecedente_clinico_externo),
      requiere_derivacion: Boolean(r.requiere_derivacion),
      vigente: Boolean(r.vigente),
    }));
  }

  async crearEventoIndice(dto: CrearEventoIndiceDto) {
    const [estRows, catRows, prevRows] = await Promise.all([
      this.db.query<any>(
        `SELECT id_estudiante, codigo_estudiante, nombres, apellidos FROM dbo.estudiantes WHERE id_estudiante = @id`,
        { id: dto.id_estudiante },
      ),
      this.db.query<any>(
        `SELECT id_categoria_evento, codigo_categoria, nombre_categoria FROM dbo.cat_categorias_evento_indice WHERE id_categoria_evento = @id AND activo = 1`,
        { id: dto.id_categoria_evento },
      ),
      this.db.query<{ codigo_evento_local: string }>(
        `SELECT codigo_evento_local FROM dbo.eventos_indice WHERE id_estudiante = @id`,
        { id: dto.id_estudiante },
      ),
    ]);

    if (!estRows.length) {
      throw new NotFoundException(`No existe el estudiante con id ${dto.id_estudiante}.`);
    }
    if (!catRows.length) {
      throw new BadRequestException(`No existe la categoría de evento índice activa con id ${dto.id_categoria_evento}.`);
    }

    // Genera un código local único por estudiante: EVT-01, EVT-02, ...
    let maxNum = 0;
    for (const row of prevRows) {
      const m = /^EVT-(\d+)$/i.exec(String(row.codigo_evento_local || '').trim());
      if (m) {
        maxNum = Math.max(maxNum, Number(m[1]));
      }
    }
    const nextNum = Math.max(maxNum + 1, prevRows.length + 1);
    const codigoEventoLocal = `EVT-${String(nextNum).padStart(2, '0')}`;

    const descripcion = dto.descripcion_evento?.trim() || '';
    const anio = dto.anio_ocurrencia_aprox ?? 0;
    const antExt = dto.antecedente_clinico_externo ? 1 : 0;
    const reqDer = dto.requiere_derivacion ? 1 : 0;

    try {
      const inserted = await this.db.query<any>(
        `
        SET NOCOUNT ON;
        DECLARE @nuevo TABLE (id_evento_indice BIGINT);
        INSERT INTO dbo.eventos_indice (
          id_estudiante, id_categoria_evento, codigo_evento_local,
          anio_ocurrencia_aprox, descripcion_evento,
          antecedente_clinico_externo, requiere_derivacion, vigente
        )
        OUTPUT INSERTED.id_evento_indice INTO @nuevo
        VALUES (
          @idEst, @idCat, @codigo,
          NULLIF(@anio, 0), NULLIF(@desc, N''),
          @antExt, @reqDer, 1
        );

        DECLARE @idNuevo BIGINT = (SELECT TOP 1 id_evento_indice FROM @nuevo);
        SELECT
          ev.id_evento_indice,
          ev.id_estudiante,
          e.codigo_estudiante,
          e.nombres,
          e.apellidos,
          ev.id_categoria_evento,
          c.codigo_categoria,
          c.nombre_categoria,
          ev.codigo_evento_local,
          ev.anio_ocurrencia_aprox,
          ev.descripcion_evento,
          ev.antecedente_clinico_externo,
          ev.requiere_derivacion,
          ev.vigente,
          ev.creado_en
        FROM dbo.eventos_indice ev
        JOIN dbo.estudiantes e ON e.id_estudiante = ev.id_estudiante
        JOIN dbo.cat_categorias_evento_indice c ON c.id_categoria_evento = ev.id_categoria_evento
        WHERE ev.id_evento_indice = @idNuevo;
        `,
        {
          idEst: dto.id_estudiante,
          idCat: dto.id_categoria_evento,
          codigo: codigoEventoLocal,
          anio,
          desc: descripcion,
          antExt,
          reqDer,
        },
      );

      return {
        ok: true,
        mensaje: `Evento índice ${codigoEventoLocal} (${catRows[0].nombre_categoria}) registrado para ${estRows[0].codigo_estudiante}.`,
        evento: inserted[0],
      };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Error al registrar el evento índice en SQL Server.');
    }
  }

  async getSesiones(idPrograma?: number) {
    return this.db.query(
      `
      SELECT TOP 200
        s.id_sesion,
        s.id_programa,
        p.codigo_programa,
        s.numero_sesion,
        cp.codigo_practica,
        cp.nombre_practica,
        s.modalidad,
        s.duracion_programada_min,
        CONVERT(VARCHAR(10), s.fecha_sesion, 23) AS fecha_sesion,
        s.estado_sesion,
        (SELECT COUNT(*) FROM dbo.asistencias a WHERE a.id_sesion = s.id_sesion AND a.estado_asistencia = N'ASISTIO') AS total_asistieron,
        (SELECT COUNT(*) FROM dbo.asistencias a WHERE a.id_sesion = s.id_sesion AND a.estado_asistencia = N'INASISTENCIA') AS total_faltaron
      FROM dbo.sesiones s
      JOIN dbo.programas p ON p.id_programa = s.id_programa
      JOIN dbo.cat_practicas cp ON cp.id_practica = s.id_practica_tecnica
      WHERE (@idPrograma IS NULL OR s.id_programa = @idPrograma)
      ORDER BY s.id_programa, s.numero_sesion
      `,
      { idPrograma: idPrograma ?? null },
    );
  }

  async getParticipantesSesion(idSesion: number) {
    const sesRows = await this.db.query<any>(
      `
      SELECT
        s.id_sesion,
        s.id_programa,
        p.codigo_programa,
        p.nombre_programa,
        s.numero_sesion,
        cp.codigo_practica,
        cp.nombre_practica,
        s.modalidad,
        s.duracion_programada_min,
        CONVERT(VARCHAR(10), s.fecha_sesion, 23) AS fecha_sesion,
        s.estado_sesion
      FROM dbo.sesiones s
      JOIN dbo.programas p ON p.id_programa = s.id_programa
      JOIN dbo.cat_practicas cp ON cp.id_practica = s.id_practica_tecnica
      WHERE s.id_sesion = @idSesion
      `,
      { idSesion },
    );

    if (!sesRows.length) {
      throw new NotFoundException(`No existe la sesión con id ${idSesion}.`);
    }

    const ses = sesRows[0];
    const rows = await this.db.query<any>(
      `
      SELECT
        asig.id_asignacion,
        e.id_estudiante,
        e.codigo_estudiante,
        e.nombres,
        e.apellidos,
        e.facultad_o_area,
        e.carrera,
        asig.estado_asignacion,
        CONVERT(VARCHAR(10), asig.fecha_retiro, 23) AS fecha_retiro,
        ISNULL(asis.estado_asistencia, N'PENDIENTE') AS estado,
        asis.minutos_asistidos
      FROM dbo.asignaciones asig
      JOIN dbo.estudiantes e ON e.id_estudiante = asig.id_estudiante
      LEFT JOIN dbo.asistencias asis
        ON asis.id_asignacion = asig.id_asignacion
       AND asis.id_sesion = @idSesion
      WHERE asig.id_programa = @idPrograma
      ORDER BY e.apellidos ASC, e.nombres ASC, e.codigo_estudiante ASC
      `,
      { idSesion, idPrograma: Number(ses.id_programa) },
    );

    return {
      sesion: {
        ...ses,
        id_sesion: Number(ses.id_sesion),
        id_programa: Number(ses.id_programa),
        numero_sesion: Number(ses.numero_sesion),
        duracion_programada_min: Number(ses.duracion_programada_min),
      },
      participantes: rows.map((r) => ({
        id_asignacion: Number(r.id_asignacion),
        id_estudiante: Number(r.id_estudiante),
        codigo_estudiante: r.codigo_estudiante,
        nombres: r.nombres,
        apellidos: r.apellidos,
        facultad_o_area: r.facultad_o_area,
        carrera: r.carrera,
        estado_asignacion: r.estado_asignacion,
        fecha_retiro: r.fecha_retiro || null,
        estado: r.estado as 'ASISTIO' | 'INASISTENCIA' | 'RETIRO_BAJA' | 'PENDIENTE',
        minutos_asistidos: r.minutos_asistidos != null ? Number(r.minutos_asistidos) : null,
      })),
    };
  }

  async getOportunidadesAbiertas(idPrograma?: number) {
    return this.db.query(
      `
      SELECT TOP 50
        op.id_oportunidad,
        op.id_asignacion,
        e.codigo_estudiante,
        e.nombres,
        e.apellidos,
        p.codigo_programa,
        op.codigo_instrumento,
        op.momento,
        CONVERT(VARCHAR(10), op.fecha_ventana_inicio, 23) AS fecha_ventana_inicio,
        CONVERT(VARCHAR(10), op.fecha_ventana_fin, 23) AS fecha_ventana_fin,
        r.id_resultado,
        r.numero_version,
        r.puntaje_total,
        CONVERT(VARCHAR(10), r.fecha_realizacion, 23) AS fecha_realizacion,
        r.en_ventana
      FROM dbo.oportunidades_evaluacion op
      JOIN dbo.estudiantes e ON e.id_estudiante = op.id_estudiante
      JOIN dbo.programas p ON p.id_programa = op.id_programa
      LEFT JOIN dbo.resultados_evaluacion r
        ON r.id_oportunidad = op.id_oportunidad
       AND r.es_vigente = 1 AND r.estado_validez = N'VALIDO'
      WHERE op.aplicable = 1
        AND (@idPrograma IS NULL OR op.id_programa = @idPrograma)
      ORDER BY CASE WHEN r.id_resultado IS NULL THEN 0 ELSE 1 END, op.fecha_ventana_fin ASC
      `,
      { idPrograma: idPrograma ?? null },
    );
  }

  async registrarAsistencia(dto: RegistrarAsistenciaDto) {
    const estado = dto.estado_asistencia ?? dto.estado;
    if (!estado) {
      throw new BadRequestException('Debe indicar el estado de asistencia (ASISTIO, INASISTENCIA o RETIRO_BAJA).');
    }

    const [sesRows, asigRows] = await Promise.all([
      this.db.query<any>(
        `
        SELECT
          id_sesion,
          id_programa,
          estado_sesion,
          duracion_programada_min,
          CONVERT(VARCHAR(10), fecha_sesion, 23) AS fecha_sesion
        FROM dbo.sesiones
        WHERE id_sesion = @id
        `,
        { id: dto.id_sesion },
      ),
      this.db.query<any>(
        `
        SELECT
          id_asignacion,
          id_programa,
          estado_asignacion,
          CONVERT(VARCHAR(10), fecha_inscripcion, 23) AS fecha_inscripcion,
          CONVERT(VARCHAR(10), fecha_retiro, 23) AS fecha_retiro
        FROM dbo.asignaciones
        WHERE id_asignacion = @idAsig
        `,
        { idAsig: dto.id_asignacion },
      ),
    ]);

    if (!sesRows.length) throw new BadRequestException('La sesión no existe.');
    if (!asigRows.length) throw new BadRequestException('La inscripción del estudiante no existe.');

    const ses = sesRows[0];
    const asig = asigRows[0];

    if (Number(ses.id_programa) !== Number(asig.id_programa)) {
      throw new BadRequestException('La inscripción seleccionada no pertenece al programa de esta sesión.');
    }

    if (ses.estado_sesion !== 'REALIZADA' && estado !== 'RETIRO_BAJA') {
      throw new BadRequestException(
        `No se puede registrar ${estado} sobre una sesión en estado ${ses.estado_sesion}.`,
      );
    }

    const minutosInput = dto.minutos_asistidos ?? dto.minutos;
    const mins = estado === 'ASISTIO' ? minutosInput ?? Number(ses.duracion_programada_min) : 0;

    const tx = await this.db.beginTransaction();
    try {
      const req = tx.request();
      req.input('idProg', Number(ses.id_programa));
      req.input('idAsig', dto.id_asignacion);
      req.input('idSes', dto.id_sesion);
      req.input('estado', estado);
      req.input('mins', mins);
      req.input('fechaSes', ses.fecha_sesion);

      const res = await req.query(`
        SET NOCOUNT ON;

        MERGE dbo.asistencias AS target
        USING (SELECT @idAsig AS id_asignacion, @idSes AS id_sesion) AS src
          ON target.id_asignacion = src.id_asignacion AND target.id_sesion = src.id_sesion
        WHEN MATCHED THEN
          UPDATE SET estado_asistencia = @estado, minutos_asistidos = @mins, actualizado_en = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (id_programa, id_asignacion, id_sesion, estado_asistencia, minutos_asistidos)
          VALUES (@idProg, @idAsig, @idSes, @estado, @mins);

        DECLARE @estadoAsigPrev NVARCHAR(20) = (
          SELECT estado_asignacion FROM dbo.asignaciones WHERE id_asignacion = @idAsig
        );
        DECLARE @fechaInsc DATE = (
          SELECT fecha_inscripcion FROM dbo.asignaciones WHERE id_asignacion = @idAsig
        );
        DECLARE @fechaEfectiva DATE = CASE
          WHEN CAST(@fechaSes AS DATE) >= @fechaInsc THEN CAST(@fechaSes AS DATE)
          ELSE @fechaInsc
        END;

        IF @estado = N'RETIRO_BAJA'
        BEGIN
          UPDATE dbo.asignaciones
             SET estado_asignacion    = N'RETIRADO',
                 fecha_retiro         = ISNULL(fecha_retiro, @fechaEfectiva),
                 motivo_retiro_codigo = ISNULL(motivo_retiro_codigo, N'RETIRO_EN_SESION'),
                 actualizado_en       = SYSDATETIMEOFFSET()
           WHERE id_asignacion = @idAsig;

          IF @estadoAsigPrev <> N'RETIRADO'
          BEGIN
            INSERT INTO dbo.historial_estados_asignacion (
              id_asignacion, estado_anterior, estado_nuevo, fecha_efectiva, motivo_codigo
            )
            VALUES (@idAsig, @estadoAsigPrev, N'RETIRADO', @fechaEfectiva, N'RETIRO_EN_SESION');
          END
        END
        ELSE IF @estadoAsigPrev = N'RETIRADO'
        BEGIN
          UPDATE dbo.asignaciones
             SET estado_asignacion    = N'ACTIVO',
                 fecha_retiro         = NULL,
                 motivo_retiro_codigo = NULL,
                 actualizado_en       = SYSDATETIMEOFFSET()
           WHERE id_asignacion = @idAsig;

          INSERT INTO dbo.historial_estados_asignacion (
            id_asignacion, estado_anterior, estado_nuevo, fecha_efectiva, motivo_codigo
          )
          VALUES (@idAsig, @estadoAsigPrev, N'ACTIVO', @fechaEfectiva, N'REACTIVACION_ASISTENCIA');
        END

        SELECT
          estado_asignacion,
          CONVERT(VARCHAR(10), fecha_retiro, 23) AS fecha_retiro
        FROM dbo.asignaciones
        WHERE id_asignacion = @idAsig;
      `);

      await tx.commit();
      const updatedAsig = res.recordset?.[0];

      return {
        ok: true,
        mensaje:
          estado === 'RETIRO_BAJA'
            ? 'Retiro registrado y fecha de baja actualizada correctamente.'
            : 'Asistencia registrada correctamente.',
        estado,
        minutos_asistidos: mins,
        estado_asignacion: updatedAsig?.estado_asignacion ?? asig.estado_asignacion,
        fecha_retiro: updatedAsig?.fecha_retiro ?? null,
      };
    } catch (err: any) {
      await tx.rollback();
      throw new BadRequestException(err?.message || 'Error al registrar asistencia en SQL Server.');
    }
  }

  async crearSesion(dto: CrearSesionDto) {
    const [progRows, practRows] = await Promise.all([
      this.db.query(
        `SELECT id_programa, codigo_programa, estado_programa FROM dbo.programas WHERE id_programa = @id`,
        { id: dto.id_programa },
      ),
      this.db.query(
        `SELECT id_practica, codigo_practica, nombre_practica, es_mixto FROM dbo.cat_practicas WHERE id_practica = @id AND activo = 1`,
        { id: dto.id_practica_tecnica },
      ),
    ]);

    if (!progRows.length) {
      throw new NotFoundException(`No existe el programa con id ${dto.id_programa}.`);
    }
    if (!practRows.length) {
      throw new BadRequestException(`No existe la práctica técnica activa con id ${dto.id_practica_tecnica}.`);
    }
    if (practRows[0].es_mixto) {
      throw new BadRequestException(
        'Una sesión individual debe tener una técnica concreta (P-01 a P-04), no MIXTO.',
      );
    }

    const fecha = String(dto.fecha_sesion).slice(0, 10);
    const hora = dto.hora_inicio || '09:00';
    const fechaHoraInicio = `${fecha}T${hora}:00-05:00`;
    const estado = dto.estado_sesion || 'PROGRAMADA';
    const motivo = estado === 'REALIZADA' ? 'EJECUCION_NORMAL' : 'PROGRAMACION_INICIAL';

    try {
      const inserted = await this.db.query<any>(
        `
        DECLARE @nueva TABLE (id_sesion BIGINT);
        INSERT INTO dbo.sesiones (
          id_programa, numero_sesion, id_practica_tecnica, modalidad,
          duracion_programada_min, fecha_sesion, fecha_hora_inicio,
          estado_sesion, motivo_estado_codigo
        )
        OUTPUT INSERTED.id_sesion INTO @nueva
        VALUES (
          @idPrograma, @numeroSesion, @idPractica, @modalidad,
          @duracion, CAST(@fecha AS DATE), CAST(@fechaHoraInicio AS DATETIMEOFFSET(0)),
          @estado, @motivo
        );

        DECLARE @idNueva BIGINT = (SELECT TOP 1 id_sesion FROM @nueva);

        INSERT INTO dbo.historial_estados_sesion (id_sesion, estado_anterior, estado_nuevo, motivo_codigo)
        VALUES (@idNueva, NULL, @estado, @motivo);

        SELECT
          s.id_sesion,
          s.id_programa,
          p.codigo_programa,
          s.numero_sesion,
          cp.codigo_practica,
          cp.nombre_practica,
          s.modalidad,
          s.duracion_programada_min,
          CONVERT(VARCHAR(10), s.fecha_sesion, 23) AS fecha_sesion,
          s.estado_sesion
        FROM dbo.sesiones s
        JOIN dbo.programas p ON p.id_programa = s.id_programa
        JOIN dbo.cat_practicas cp ON cp.id_practica = s.id_practica_tecnica
        WHERE s.id_sesion = @idNueva;
        `,
        {
          idPrograma: dto.id_programa,
          numeroSesion: dto.numero_sesion,
          idPractica: dto.id_practica_tecnica,
          modalidad: dto.modalidad,
          duracion: dto.duracion_programada_min,
          fecha,
          fechaHoraInicio,
          estado,
          motivo,
        },
      );

      return {
        ok: true,
        mensaje: 'Sesión programada correctamente.',
        sesion: inserted[0],
      };
    } catch (err: any) {
      if (err?.number === 2627 || err?.number === 2601) {
        throw new BadRequestException(
          `Ya existe la sesión número ${dto.numero_sesion} en el programa ${progRows[0].codigo_programa}.`,
        );
      }
      throw new BadRequestException(err?.message || 'Error al crear la sesión en SQL Server.');
    }
  }

  async ejecutarEtl(fechaCorte?: string) {
    const fecha = fechaCorte ? String(fechaCorte).slice(0, 10) : '2026-11-23';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('fecha_corte debe tener formato AAAA-MM-DD.');
    }

    try {
      const dmDb = this.db.dmDatabaseName;
      await this.db.query(
        `DECLARE @fc DATE = CAST(@fecha AS DATE); EXEC [${dmDb}].dm.usp_ejecutar_etl @fecha_corte = @fc;`,
        { fecha },
      );

      const logs = await this.db.queryDm<any>(
        `
        SELECT TOP 1
          id_ejecucion_etl,
          CONVERT(VARCHAR(10), fecha_corte, 23) AS fecha_corte,
          inicio_ejecucion,
          fin_ejecucion,
          estado,
          filas_continuidad,
          filas_cumplimiento,
          filas_resultados,
          incidencias_detectadas,
          mensaje,
          usuario_ejecucion
        FROM dm.etl_log_ejecuciones
        WHERE fecha_corte = CAST(@fecha AS DATE)
        ORDER BY id_ejecucion_etl DESC
        `,
        { fecha },
      );

      const ejecucion = logs[0] || null;
      const incidencias = ejecucion
        ? await this.db.queryDm<any>(
            `
            SELECT
              id_incidencia,
              regla_codigo,
              severidad,
              entidad_origen,
              id_registro_origen,
              detalle,
              registrado_en
            FROM dm.etl_incidencias_calidad
            WHERE id_ejecucion_etl = @idEjecucion
            ORDER BY id_incidencia
            `,
            { idEjecucion: ejecucion.id_ejecucion_etl },
          )
        : [];

      return {
        ok: true,
        ejecucion,
        incidencias,
      };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Error al ejecutar el proceso ETL del Data Mart.');
    }
  }

  async registrarResultado(dto: RegistrarResultadoDto) {
    const ops = await this.db.query(
      `
      SELECT id_oportunidad, codigo_instrumento, aplicable,
             CONVERT(VARCHAR(10), fecha_ventana_inicio, 23) AS fecha_ventana_inicio,
             CONVERT(VARCHAR(10), fecha_ventana_fin, 23) AS fecha_ventana_fin
      FROM dbo.oportunidades_evaluacion
      WHERE id_oportunidad = @id
      `,
      { id: dto.id_oportunidad },
    );
    if (!ops.length) throw new BadRequestException('Oportunidad de evaluación no encontrada.');
    const op = ops[0];
    if (!op.aplicable) throw new BadRequestException('La oportunidad está marcada como no aplicable.');
    if (op.codigo_instrumento === 'PSS-10' && dto.puntaje_total > 40) {
      throw new BadRequestException('PSS-10 admite puntajes entre 0 y 40.');
    }

    const enVentana =
      dto.fecha_realizacion >= op.fecha_ventana_inicio &&
      dto.fecha_realizacion <= op.fecha_ventana_fin;

    const tx = await this.db.beginTransaction();
    try {
      const reqCheck = tx.request();
      reqCheck.input('idOp', dto.id_oportunidad);
      const prevRes = await reqCheck.query(`
        SELECT id_resultado, numero_version
        FROM dbo.resultados_evaluacion
        WHERE id_oportunidad = @idOp AND es_vigente = 1 AND estado_validez = N'VALIDO'
      `);

      const prev = prevRes.recordset?.[0];

      if (prev) {
        if (!dto.motivo_correccion?.trim()) {
          throw new BadRequestException(
            'Ya existe un resultado vigente para esta oportunidad; debe indicar motivo_correccion para versionarlo.',
          );
        }
        const reqUpd = tx.request();
        reqUpd.input('idPrev', prev.id_resultado);
        await reqUpd.query(`
          UPDATE dbo.resultados_evaluacion
          SET es_vigente = 0, estado_validez = N'REEMPLAZADO', vigente_hasta = SYSDATETIMEOFFSET()
          WHERE id_resultado = @idPrev
        `);

        const reqIns = tx.request();
        reqIns.input('idOp', dto.id_oportunidad);
        reqIns.input('instr', op.codigo_instrumento);
        reqIns.input('ver', Number(prev.numero_version) + 1);
        reqIns.input('pts', dto.puntaje_total);
        reqIns.input('freal', dto.fecha_realizacion);
        reqIns.input('enVent', enVentana ? 1 : 0);
        reqIns.input('idPrev', prev.id_resultado);
        reqIns.input('motivo', dto.motivo_correccion.trim());
        await reqIns.query(`
          INSERT INTO dbo.resultados_evaluacion (
            id_oportunidad, codigo_instrumento, numero_version, puntaje_total,
            fecha_realizacion, en_ventana, estado_validez, es_vigente,
            id_resultado_reemplazado, motivo_correccion
          )
          VALUES (@idOp, @instr, @ver, @pts, CAST(@freal AS DATE), @enVent, N'VALIDO', 1, @idPrev, @motivo)
        `);
        await tx.commit();
        return {
          ok: true,
          version: Number(prev.numero_version) + 1,
          en_ventana: enVentana,
          mensaje: `Resultado corregido y versionado a v${Number(prev.numero_version) + 1} conservando historial.`,
        };
      } else {
        const reqIns = tx.request();
        reqIns.input('idOp', dto.id_oportunidad);
        reqIns.input('instr', op.codigo_instrumento);
        reqIns.input('pts', dto.puntaje_total);
        reqIns.input('freal', dto.fecha_realizacion);
        reqIns.input('enVent', enVentana ? 1 : 0);
        await reqIns.query(`
          INSERT INTO dbo.resultados_evaluacion (
            id_oportunidad, codigo_instrumento, numero_version, puntaje_total,
            fecha_realizacion, en_ventana, estado_validez, es_vigente
          )
          VALUES (@idOp, @instr, 1, @pts, CAST(@freal AS DATE), @enVent, N'VALIDO', 1)
        `);
        await tx.commit();
        return {
          ok: true,
          version: 1,
          en_ventana: enVentana,
          mensaje: enVentana
            ? 'Resultado registrado dentro de la ventana reglamentaria.'
            : 'Resultado registrado como completado tardío (válido para KPI-04, excluido de pares KPI-01/02).',
        };
      }
    } catch (err: any) {
      await tx.rollback();
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(err?.message || 'Error al registrar resultado.');
    }
  }
}
