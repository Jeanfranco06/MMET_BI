import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { ETL_SOURCE_COLUMNS } from './etl-snapshot';
@Injectable()
export class EtlService {
    constructor(private readonly db: DatabaseService) { }
    async run(cut: string) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(cut) || !Number.isFinite(Date.parse(cut)) || new Date(cut).toISOString().slice(0, 10) !== cut)
            throw new BadRequestException('Fecha de corte inválida.');
        const source = await this.db.beginTransaction();
        const snapshot: Record<string, any[]> = {};
        try {
            await source.client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
            for (const [table, columns] of Object.entries(ETL_SOURCE_COLUMNS))
                snapshot[table] = (await source.client.query(`SELECT ${columns} FROM dbo.${table}`)).rows;
            // Agregado de puntaje por resultado sin exportar respuestas individuales por ítem (RQ-BI-13 + minimización)
            snapshot.respuestas_resumen = (await source.client.query(
                `SELECT id_resultado, SUM(valor_puntuado)::int AS suma_items FROM dbo.respuestas_evaluacion GROUP BY id_resultado`
            )).rows;
            await source.commit();
        }
        catch (e) {
            await source.rollback();
            throw e;
        }
        const target = await this.db.beginDmTransaction();
        try {
            const load = await target.client.query('SELECT dm.ejecutar_etl($1::date,$2::jsonb) AS id', [cut, JSON.stringify(snapshot)]);
            const id = load.rows[0].id;
            const logs = await target.client.query('SELECT * FROM dm.etl_log_ejecuciones WHERE id_ejecucion_etl=$1', [id]);
            const incidents = await target.client.query('SELECT * FROM dm.etl_incidencias_calidad WHERE id_ejecucion_etl=$1 ORDER BY id_incidencia', [id]);
            await target.commit();
            if (logs.rows[0].estado !== 'EXITOSO')
                throw new BadRequestException(logs.rows[0].mensaje);
            return { ok: true, ejecucion: logs.rows[0], incidencias: incidents.rows };
        }
        catch (e) {
            await target.rollback();
            throw e;
        }
    }
}
