import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { calcularPuntuacion } from './puntuacion';

@Injectable()
export class CuestionariosService {
  constructor(private readonly db: DatabaseService) {}

  async list(studentId: number) {
    if (!studentId) throw new ForbiddenException('La cuenta no está vinculada a un estudiante.');
    return this.db.query(
      `SELECT op.id_oportunidad,op.codigo_instrumento,op.momento,iv.numero_version,iv.idioma,
              iv.estado_contenido,iv.texto_periodo,iv.instrucciones,
              to_char(op.fecha_ventana_inicio, 'YYYY-MM-DD') fecha_ventana_inicio,
              to_char(op.fecha_ventana_fin, 'YYYY-MM-DD') fecha_ventana_fin,
              CASE WHEN r.id_resultado IS NOT NULL THEN 'COMPLETADA' WHEN b.id_oportunidad IS NOT NULL THEN 'BORRADOR' ELSE 'PENDIENTE' END estado
       FROM dbo.oportunidades_evaluacion op
       JOIN dbo.instrumento_versiones iv ON iv.id_version_instrumento=op.id_version_instrumento AND iv.estado_contenido='PUBLICADO'
       LEFT JOIN dbo.resultados_evaluacion r ON r.id_oportunidad=op.id_oportunidad AND r.es_vigente=1 AND r.estado_validez='VALIDO'
       LEFT JOIN dbo.respuestas_borrador b ON b.id_oportunidad=op.id_oportunidad AND b.id_estudiante=op.id_estudiante
       WHERE op.id_estudiante=@studentId AND op.aplicable=1
       ORDER BY op.fecha_prevista,op.momento,op.codigo_instrumento`, { studentId });
  }

  async get(studentId: number, opportunityId: number) {
    const op = await this.getOpportunity(studentId, opportunityId);
    if (op.completed) throw new BadRequestException('La evaluación ya fue enviada.');
    if (op.estado_contenido !== 'PUBLICADO') throw new BadRequestException('La versión del cuestionario no está habilitada.');
    const [items, options, drafts] = await Promise.all([
      this.db.query<any>(`SELECT numero_item,texto_item,puntuacion_inversa FROM dbo.instrumento_items WHERE id_version_instrumento=@version ORDER BY numero_item`, { version: op.id_version_instrumento }),
      this.db.query<any>(`SELECT valor,etiqueta FROM dbo.instrumento_opciones_respuesta WHERE id_version_instrumento=@version ORDER BY valor`, { version: op.id_version_instrumento }),
      this.db.query<any>(`SELECT respuestas_json FROM dbo.respuestas_borrador WHERE id_oportunidad=@id AND id_estudiante=@student`, { id: opportunityId, student: studentId }),
    ]);
    if (items.length !== (op.codigo_instrumento === 'PSS-10' ? 10 : 20) || items.some((x) => !x.texto_item) || options.length !== 5) {
      throw new BadRequestException('El contenido o las opciones de esta versión todavía no están completas.');
    }
    return { oportunidad: op, items: items.map(({ numero_item, texto_item }) => ({ numero_item, texto_item })), opciones: options, respuestas: drafts.length ? JSON.parse(drafts[0].respuestas_json) : [] };
  }

  async saveDraft(studentId: number, opportunityId: number, answers: Array<{ numero_item: number; valor: number }>) {
    const op = await this.getOpportunity(studentId, opportunityId);
    if (op.completed) throw new BadRequestException('Una evaluación enviada no admite edición del estudiante.');
    const items = await this.itemsFor(op);
    this.validateAnswers(answers, items, false);
    const json = JSON.stringify(answers);
    await this.db.query(
      `INSERT INTO dbo.respuestas_borrador(id_oportunidad,id_estudiante,id_version_instrumento,respuestas_json)
 VALUES(@id,@student,@version,@json)
 ON CONFLICT(id_oportunidad) DO UPDATE SET respuestas_json=EXCLUDED.respuestas_json,actualizado_en=CURRENT_TIMESTAMP`,
      { id: opportunityId, student: studentId, version: op.id_version_instrumento, json },
    );
    return { ok: true, guardado: answers.length, total: items.length };
  }

  async submit(studentId: number, actorId: number, opportunityId: number, body: { respuestas: Array<{ numero_item: number; valor: number }>; fecha_realizacion: string }) {
    const op = await this.getOpportunity(studentId, opportunityId);
    if (op.completed) throw new BadRequestException('La evaluación ya fue enviada.');
    return this.persist(op, actorId, opportunityId, body);
  }

  async correct(actorId: number, opportunityId: number, body: { respuestas: Array<{ numero_item: number; valor: number }>; fecha_realizacion: string; motivo_correccion: string }) {
    const op = await this.getOpportunity(-1, opportunityId, true);
    if (!op.completed) throw new BadRequestException('Solo se corrige una evaluación ya enviada.');
    if (!body.motivo_correccion?.trim() || body.motivo_correccion.trim().length < 6) throw new BadRequestException('Indique un motivo de corrección de al menos seis caracteres.');
    return this.persist(op, actorId, opportunityId, body, body.motivo_correccion.trim());
  }

  private async persist(op: any, actorId: number, opportunityId: number, body: { respuestas: Array<{ numero_item: number; valor: number }>; fecha_realizacion: string }, correctionReason?: string) {
    const items = await this.itemsFor(op);
    this.validateAnswers(body.respuestas, items, true);
    const start = String(op.fecha_ventana_inicio).slice(0,10);
    const end = String(op.fecha_ventana_fin).slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha_realizacion)) throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD.');
    if (body.fecha_realizacion > String(op.hoy_lima).slice(0,10)) throw new BadRequestException('La fecha de respuesta no puede estar en el futuro.');
    if (body.fecha_realizacion < start) throw new BadRequestException('La fecha de respuesta no puede ser anterior al inicio de la ventana.');
    const inWindow = body.fecha_realizacion <= end;
    const answersByNumber = new Map(body.respuestas.map((a) => [a.numero_item, a.valor]));
    const scored = items.map((item) => ({ ...item, valor: answersByNumber.get(Number(item.numero_item))!, puntuado: item.puntuacion_inversa ? 4 - answersByNumber.get(Number(item.numero_item))! : answersByNumber.get(Number(item.numero_item))! }));
    const score = calcularPuntuacion(items, body.respuestas);
    const tx = await this.db.beginTransaction();
    try {
      const check = tx.request(); check.input('idOp', opportunityId);
      await tx.client.query('SELECT id_oportunidad FROM dbo.oportunidades_evaluacion WHERE id_oportunidad=$1 FOR UPDATE', [opportunityId]);
      const previousQuery = await check.query(`SELECT id_resultado,numero_version FROM dbo.resultados_evaluacion  WHERE id_oportunidad=@idOp AND es_vigente=1 AND estado_validez='VALIDO' LIMIT 1 FOR UPDATE`);
      const previous = previousQuery.recordset?.[0];
      if (correctionReason && !previous) throw new BadRequestException('El resultado vigente ya no existe; actualice la página.');
      if (!correctionReason && previous) throw new BadRequestException('La evaluación ya fue enviada.');
      if (previous) {
        const replace = tx.request(); replace.input('idPrev', previous.id_resultado);
        await replace.query(`UPDATE dbo.resultados_evaluacion SET es_vigente=0,estado_validez='REEMPLAZADO',vigente_hasta=CURRENT_TIMESTAMP WHERE id_resultado=@idPrev`);
      }
      const req = tx.request();
      req.input('idOp', opportunityId); req.input('instrument', op.codigo_instrumento); req.input('score', score);
      req.input('date', body.fecha_realizacion); req.input('inWindow', inWindow ? 1 : 0); req.input('actor', actorId);
      req.input('version', previous ? Number(previous.numero_version) + 1 : 1);
      req.input('idPrev', previous?.id_resultado ?? null); req.input('reason', correctionReason ?? null);
      const inserted = await req.query(`INSERT INTO dbo.resultados_evaluacion(id_oportunidad,codigo_instrumento,numero_version,puntaje_total,fecha_realizacion,en_ventana,id_usuario_registro,id_usuario_correccion,id_resultado_reemplazado,motivo_correccion)
 VALUES(@idOp,@instrument,@version,@score,CAST(@date AS DATE),@inWindow,@actor,CASE WHEN @idPrev IS NULL THEN NULL ELSE @actor END,@idPrev,@reason) RETURNING id_resultado`);
      const resultId = inserted.recordset[0].id_resultado;
      for (const answer of scored) {
        const answerReq = tx.request();
        answerReq.input('resultId',resultId); answerReq.input('version',op.id_version_instrumento); answerReq.input('itemId',answer.id_item);
        answerReq.input('value',answer.valor); answerReq.input('scored',answer.puntuado);
        await answerReq.query(`INSERT INTO dbo.respuestas_evaluacion(id_resultado,id_version_instrumento,id_item,valor_respuesta,valor_puntuado) VALUES(@resultId,@version,@itemId,@value,@scored)`);
      }
      const clean = tx.request(); clean.input('idOp',opportunityId); clean.input('student',op.id_estudiante);
      await clean.query('DELETE FROM dbo.respuestas_borrador WHERE id_oportunidad=@idOp AND id_estudiante=@student');
      await tx.commit();
      return { ok: true, version: previous ? Number(previous.numero_version) + 1 : 1, puntaje_total: score, total_items: items.length, en_ventana: inWindow, mensaje: correctionReason ? 'Corrección versionada; la versión anterior y sus respuestas se conservan.' : 'Respuestas guardadas y puntuación calculada en el servidor.' };
    } catch (error: any) {
      await tx.rollback();
      if (error?.code === '23505') throw new BadRequestException('Esta oportunidad ya fue enviada.');
      throw error;
    }
  }

  private async getOpportunity(studentId: number, opportunityId: number, privileged = false) {
    const rows = await this.db.query<any>(
      `SELECT op.id_oportunidad,op.id_estudiante,op.id_version_instrumento,op.codigo_instrumento,op.momento,op.aplicable,
              iv.numero_version,iv.idioma,iv.estado_contenido,iv.periodo_referencia,iv.texto_periodo,iv.instrucciones,
              to_char(op.fecha_ventana_inicio, 'YYYY-MM-DD') fecha_ventana_inicio,
              to_char(op.fecha_ventana_fin, 'YYYY-MM-DD') fecha_ventana_fin,
              to_char(CAST(CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima' AS date), 'YYYY-MM-DD') hoy_lima,
              CASE WHEN r.id_resultado IS NULL THEN 0 ELSE 1 END completed
       FROM dbo.oportunidades_evaluacion op
       LEFT JOIN dbo.instrumento_versiones iv ON iv.id_version_instrumento=op.id_version_instrumento
       LEFT JOIN dbo.resultados_evaluacion r ON r.id_oportunidad=op.id_oportunidad AND r.es_vigente=1 AND r.estado_validez='VALIDO'
       WHERE op.id_oportunidad=@id AND (@privileged=1 OR op.id_estudiante=@student) AND op.aplicable=1`,
      { id: opportunityId, student: studentId, privileged: privileged ? 1 : 0 },
    );
    if (!rows.length) throw new NotFoundException('No existe una evaluación asignada a esta cuenta.');
    return rows[0];
  }

  private async itemsFor(op: any) {
    if (!op.id_version_instrumento || op.estado_contenido !== 'PUBLICADO') throw new BadRequestException('La versión no está habilitada para responder.');
    const items = await this.db.query<any>(`SELECT id_item,numero_item,puntuacion_inversa,texto_item FROM dbo.instrumento_items WHERE id_version_instrumento=@version ORDER BY numero_item`, { version: op.id_version_instrumento });
    if (items.length !== (op.codigo_instrumento === 'PSS-10' ? 10 : 20) || items.some((item) => !item.texto_item)) throw new BadRequestException('La versión no contiene todos los ítems autorizados.');
    return items;
  }

  private validateAnswers(answers: Array<{ numero_item: number; valor: number }>, items: any[], complete: boolean) {
    if (!Array.isArray(answers) || answers.some((a) => !Number.isInteger(a.numero_item) || !Number.isInteger(a.valor) || a.valor < 0 || a.valor > 4)) throw new BadRequestException('Cada respuesta debe ser un entero de 0 a 4.');
    const numbers = answers.map((a) => a.numero_item);
    if (new Set(numbers).size !== numbers.length || numbers.some((n) => !items.some((i) => Number(i.numero_item) === n))) throw new BadRequestException('Hay ítems duplicados o no pertenecientes a esta versión.');
    if (complete && (answers.length !== items.length || items.some((item) => !numbers.includes(Number(item.numero_item))))) throw new BadRequestException(`Debe responder los ${items.length} ítems antes de enviar.`);
  }
}
