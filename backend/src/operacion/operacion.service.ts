import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EtlService } from '../database/etl.service';
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
  constructor(private readonly db: DatabaseService, private readonly etl: EtlService) {}

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
          COALESCE(STRING_AGG(p.codigo_programa, ', '), '') AS programas_codigos
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
        LIMIT @pageSize OFFSET @offset
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
      SELECT codigo_estudiante, correo_institucional
      FROM dbo.estudiantes
      WHERE codigo_estudiante = @codigo OR LOWER(correo_institucional) = @correo LIMIT 1`,
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
        `INSERT INTO dbo.estudiantes(codigo_estudiante,nombres,apellidos,correo_institucional,edad_anios,sexo_codificado,facultad_o_area,carrera,ciclo_academico) VALUES(@codigo,@nombres,@apellidos,@correo,@edad,@sexo,@facultad,@carrera,@ciclo) RETURNING *`,
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
      if (err?.code === '23505') {
        throw new ConflictException('El código de estudiante o el correo institucional ya se encuentran registrados.');
      }
      throw new BadRequestException(err?.message || 'Error al registrar el estudiante en PostgreSQL.');
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
          to_char(ventana_inicial_inicio, 'YYYY-MM-DD') AS ventana_inicial_inicio,
          to_char(ventana_inicial_fin, 'YYYY-MM-DD') AS ventana_inicial_fin,
          to_char(ventana_final_inicio, 'YYYY-MM-DD') AS ventana_final_inicio,
          to_char(ventana_final_fin, 'YYYY-MM-DD') AS ventana_final_fin
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
WITH nueva AS (
 INSERT INTO dbo.asignaciones(id_estudiante,id_programa,fecha_inscripcion,estado_asignacion)
 VALUES(@idEst,@idProg,CAST(@fecha AS DATE),'INSCRITO') RETURNING *
), historial AS (
 INSERT INTO dbo.historial_estados_asignacion(id_asignacion,estado_anterior,estado_nuevo,fecha_efectiva,motivo_codigo)
 SELECT id_asignacion,NULL,'INSCRITO',fecha_inscripcion,'INSCRIPCION_DIRECTA' FROM nueva
) SELECT * FROM nueva
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
WITH instrumento AS (
 SELECT i.id_instrumento, v.id_version_instrumento FROM dbo.cat_instrumentos i
 LEFT JOIN LATERAL (SELECT id_version_instrumento FROM dbo.instrumento_versiones WHERE id_instrumento=i.id_instrumento AND estado_contenido='PUBLICADO' ORDER BY id_version_instrumento DESC LIMIT 1) v ON true
 WHERE i.codigo_instrumento='PSS-10' AND i.activo=1 ORDER BY i.id_instrumento LIMIT 1
), nuevas AS (
 INSERT INTO dbo.oportunidades_evaluacion(id_asignacion,id_estudiante,id_programa,id_instrumento,codigo_instrumento,id_evento_indice,momento,fecha_ventana_inicio,fecha_ventana_fin,fecha_prevista,aplicable,id_version_instrumento)
 SELECT @idAsig,@idEst,@idProg,i.id_instrumento,'PSS-10',NULL,d.momento,d.inicio,d.fin,d.prevista,1,i.id_version_instrumento
 FROM instrumento i CROSS JOIN (VALUES('INICIAL',CAST(@viIni AS DATE),CAST(@viFin AS DATE),CAST(@viFin AS DATE)),('FINAL',CAST(@vfIni AS DATE),CAST(@vfFin AS DATE),CAST(@vfIni AS DATE))) AS d(momento,inicio,fin,prevista)
 RETURNING id_oportunidad
) SELECT count(*) AS generadas FROM nuevas
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
      if (err?.code === '23505') {
        throw new ConflictException(
          `El estudiante ${estRows[0].codigo_estudiante} ya se encuentra inscrito en ${prog.codigo_programa}.`,
        );
      }
      throw new BadRequestException(err?.message || 'Error al registrar la inscripción en PostgreSQL.');
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
      SELECT ev.id_evento_indice,
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
      ORDER BY ev.creado_en DESC, ev.id_evento_indice DESC LIMIT 60`,
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
        `WITH nuevo AS (INSERT INTO dbo.eventos_indice(id_estudiante,id_categoria_evento,codigo_evento_local,anio_ocurrencia_aprox,descripcion_evento,antecedente_clinico_externo,requiere_derivacion,vigente) VALUES(@idEst,@idCat,@codigo,NULLIF(@anio,0),NULLIF(@desc,''),@antExt,@reqDer,1) RETURNING *) SELECT ev.*,e.codigo_estudiante,e.nombres,e.apellidos,c.codigo_categoria,c.nombre_categoria FROM nuevo ev JOIN dbo.estudiantes e USING(id_estudiante) JOIN dbo.cat_categorias_evento_indice c USING(id_categoria_evento)`,
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
      throw new BadRequestException(err?.message || 'Error al registrar el evento índice en PostgreSQL.');
    }
  }

  async getSesiones(idPrograma?: number) {
    return this.db.query(
      `
      SELECT s.id_sesion,
        s.id_programa,
        p.codigo_programa,
        s.numero_sesion,
        cp.codigo_practica,
        cp.nombre_practica,
        s.modalidad,
        s.duracion_programada_min,
        to_char(s.fecha_sesion, 'YYYY-MM-DD') AS fecha_sesion,
        s.estado_sesion,
        (SELECT COUNT(*) FROM dbo.asistencias a WHERE a.id_sesion = s.id_sesion AND a.estado_asistencia = 'ASISTIO') AS total_asistieron,
        (SELECT COUNT(*) FROM dbo.asistencias a WHERE a.id_sesion = s.id_sesion AND a.estado_asistencia = 'INASISTENCIA') AS total_faltaron
      FROM dbo.sesiones s
      JOIN dbo.programas p ON p.id_programa = s.id_programa
      JOIN dbo.cat_practicas cp ON cp.id_practica = s.id_practica_tecnica
      WHERE (@idPrograma IS NULL OR s.id_programa = @idPrograma)
      ORDER BY s.id_programa, s.numero_sesion LIMIT 200`,
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
        to_char(s.fecha_sesion, 'YYYY-MM-DD') AS fecha_sesion,
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
        to_char(asig.fecha_retiro, 'YYYY-MM-DD') AS fecha_retiro,
        COALESCE(asis.estado_asistencia, 'PENDIENTE') AS estado,
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
      SELECT op.id_oportunidad,
        op.id_asignacion,
        e.codigo_estudiante,
        e.nombres,
        e.apellidos,
        p.codigo_programa,
        op.codigo_instrumento,
        op.momento,
        to_char(op.fecha_ventana_inicio, 'YYYY-MM-DD') AS fecha_ventana_inicio,
        to_char(op.fecha_ventana_fin, 'YYYY-MM-DD') AS fecha_ventana_fin,
        r.id_resultado,
        r.numero_version,
        r.puntaje_total,
        to_char(r.fecha_realizacion, 'YYYY-MM-DD') AS fecha_realizacion,
        r.en_ventana
      FROM dbo.oportunidades_evaluacion op
      JOIN dbo.estudiantes e ON e.id_estudiante = op.id_estudiante
      JOIN dbo.programas p ON p.id_programa = op.id_programa
      LEFT JOIN dbo.resultados_evaluacion r
        ON r.id_oportunidad = op.id_oportunidad
       AND r.es_vigente = 1 AND r.estado_validez = 'VALIDO'
      WHERE op.aplicable = 1
        AND (@idPrograma IS NULL OR op.id_programa = @idPrograma)
      ORDER BY CASE WHEN r.id_resultado IS NULL THEN 0 ELSE 1 END, op.fecha_ventana_fin ASC LIMIT 50`,
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
          to_char(fecha_sesion, 'YYYY-MM-DD') AS fecha_sesion
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
          to_char(fecha_inscripcion, 'YYYY-MM-DD') AS fecha_inscripcion,
          to_char(fecha_retiro, 'YYYY-MM-DD') AS fecha_retiro
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
WITH anterior AS MATERIALIZED (
 SELECT * FROM dbo.asignaciones WHERE id_asignacion=@idAsig FOR UPDATE
), asistencia AS (
 INSERT INTO dbo.asistencias(id_programa,id_asignacion,id_sesion,estado_asistencia,minutos_asistidos)
 SELECT @idProg,@idAsig,@idSes,@estado,@mins FROM anterior
 ON CONFLICT(id_asignacion,id_sesion) DO UPDATE SET estado_asistencia=EXCLUDED.estado_asistencia,minutos_asistidos=EXCLUDED.minutos_asistidos,actualizado_en=CURRENT_TIMESTAMP
 RETURNING id_asistencia
), actualizada AS (
 UPDATE dbo.asignaciones a SET
 estado_asignacion=CASE WHEN @estado='RETIRO_BAJA' THEN 'RETIRADO' WHEN p.estado_asignacion='RETIRADO' THEN 'ACTIVO' ELSE p.estado_asignacion END,
 fecha_retiro=CASE WHEN @estado='RETIRO_BAJA' THEN COALESCE(p.fecha_retiro,GREATEST(CAST(@fechaSes AS DATE),p.fecha_inscripcion)) ELSE NULL END,
 motivo_retiro_codigo=CASE WHEN @estado='RETIRO_BAJA' THEN COALESCE(p.motivo_retiro_codigo,'RETIRO_EN_SESION') ELSE NULL END,
 actualizado_en=CURRENT_TIMESTAMP FROM anterior p
 WHERE a.id_asignacion=p.id_asignacion AND EXISTS(SELECT 1 FROM asistencia) RETURNING a.*
), historial AS (
 INSERT INTO dbo.historial_estados_asignacion(id_asignacion,estado_anterior,estado_nuevo,fecha_efectiva,motivo_codigo)
 SELECT n.id_asignacion,p.estado_asignacion,n.estado_asignacion,GREATEST(CAST(@fechaSes AS DATE),p.fecha_inscripcion),CASE WHEN @estado='RETIRO_BAJA' THEN 'RETIRO_EN_SESION' ELSE 'REACTIVACION_ASISTENCIA' END
 FROM actualizada n JOIN anterior p USING(id_asignacion) WHERE n.estado_asignacion<>p.estado_asignacion
) SELECT estado_asignacion,to_char(fecha_retiro,'YYYY-MM-DD') AS fecha_retiro FROM actualizada
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
      throw new BadRequestException(err?.message || 'Error al registrar asistencia en PostgreSQL.');
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
        `WITH nueva AS (INSERT INTO dbo.sesiones(id_programa,numero_sesion,id_practica_tecnica,modalidad,duracion_programada_min,fecha_sesion,fecha_hora_inicio,estado_sesion,motivo_estado_codigo) VALUES(@idPrograma,@numeroSesion,@idPractica,@modalidad,@duracion,CAST(@fecha AS DATE),CAST(@fechaHoraInicio AS TIMESTAMPTZ),@estado,@motivo) RETURNING *), historial AS (INSERT INTO dbo.historial_estados_sesion(id_sesion,estado_anterior,estado_nuevo,motivo_codigo) SELECT id_sesion,NULL,estado_sesion,motivo_estado_codigo FROM nueva) SELECT s.*,p.codigo_programa,cp.codigo_practica,cp.nombre_practica FROM nueva s JOIN dbo.programas p USING(id_programa) JOIN dbo.cat_practicas cp ON cp.id_practica=s.id_practica_tecnica`,
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
      if (err?.code === '23505') {
        throw new BadRequestException(
          `Ya existe la sesión número ${dto.numero_sesion} en el programa ${progRows[0].codigo_programa}.`,
        );
      }
      throw new BadRequestException(err?.message || 'Error al crear la sesión en PostgreSQL.');
    }
  }

  async ejecutarEtl(fechaCorte?: string) {
    return this.etl.run(fechaCorte || '2026-11-23');
  }

  async registrarResultado(dto: RegistrarResultadoDto) {
    const ops = await this.db.query(
      `
      SELECT id_oportunidad, codigo_instrumento, aplicable,
             to_char(fecha_ventana_inicio, 'YYYY-MM-DD') AS fecha_ventana_inicio,
             to_char(fecha_ventana_fin, 'YYYY-MM-DD') AS fecha_ventana_fin
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
        WHERE id_oportunidad = @idOp AND es_vigente = 1 AND estado_validez = 'VALIDO'
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
          SET es_vigente = 0, estado_validez = 'REEMPLAZADO', vigente_hasta = CURRENT_TIMESTAMP
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
          VALUES (@idOp, @instr, @ver, @pts, CAST(@freal AS DATE), @enVent, 'VALIDO', 1, @idPrev, @motivo)
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
          VALUES (@idOp, @instr, 1, @pts, CAST(@freal AS DATE), @enVent, 'VALIDO', 1)
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
