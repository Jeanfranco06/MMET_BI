import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RegistrarAsistenciaDto, RegistrarResultadoDto } from './operacion.controller';

@Injectable()
export class OperacionService {
  constructor(private readonly db: DatabaseService) {}

  async getSesiones(idPrograma?: number) {
    return this.db.query(
      `
      SELECT TOP 60
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

  async getOportunidadesAbiertas(idPrograma?: number) {
    return this.db.query(
      `
      SELECT TOP 50
        op.id_oportunidad,
        op.id_asignacion,
        e.codigo_anonimizado,
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
    const sesRows = await this.db.query(
      `SELECT id_sesion, id_programa, estado_sesion, duracion_programada_min FROM dbo.sesiones WHERE id_sesion = @id`,
      { id: dto.id_sesion },
    );
    if (!sesRows.length) throw new BadRequestException('La sesión no existe.');
    const ses = sesRows[0];
    if (ses.estado_sesion !== 'REALIZADA' && dto.estado_asistencia !== 'RETIRO_BAJA') {
      throw new BadRequestException(
        `No se puede registrar ${dto.estado_asistencia} sobre una sesión en estado ${ses.estado_sesion}.`,
      );
    }

    const mins =
      dto.estado_asistencia === 'ASISTIO'
        ? dto.minutos_asistidos ?? ses.duracion_programada_min
        : 0;

    try {
      await this.db.query(
        `
        MERGE dbo.asistencias AS target
        USING (SELECT @idAsig AS id_asignacion, @idSes AS id_sesion) AS src
          ON target.id_asignacion = src.id_asignacion AND target.id_sesion = src.id_sesion
        WHEN MATCHED THEN
          UPDATE SET estado_asistencia = @estado, minutos_asistidos = @mins, registrado_en = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (id_programa, id_asignacion, id_sesion, estado_asistencia, minutos_asistidos)
          VALUES (@idProg, @idAsig, @idSes, @estado, @mins);
        `,
        {
          idProg: ses.id_programa,
          idAsig: dto.id_asignacion,
          idSes: dto.id_sesion,
          estado: dto.estado_asistencia,
          mins,
        },
      );
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Error al registrar asistencia en SQL Server.');
    }

    return { ok: true, mensaje: 'Asistencia registrada correctamente.' };
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
