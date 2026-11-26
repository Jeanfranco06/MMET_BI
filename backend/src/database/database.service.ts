import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, types } from 'pg';
import { readFileSync } from 'fs';
// IDs and counts are numbers in the existing HTTP contract. Fail rather than round large IDs.
types.setTypeParser(20, value => { const n = Number(value); if (!Number.isSafeInteger(n))
    throw new Error('ID fuera del rango seguro de JavaScript.'); return n; });
types.setTypeParser(1700, value => Number(value));
types.setTypeParser(1082, value => value); // Calendar dates must not move with the Windows timezone.
/** Named parameters only; all statements are native PostgreSQL. No SQL dialect translation. */
export function bindParameters(sql: string, params: Record<string, any> = {}) {
    const names: string[] = [];
    const text = sql.replace(/'(?:''|[^'])*'|--[^\n]*|\/\*[\s\S]*?\*\/|@([A-Za-z_]\w*)/g, (token, name) => {
        if (!name)
            return token;
        if (!(name in params))
            throw new Error(`Falta el parámetro SQL ${name}.`);
        let i = names.indexOf(name);
        if (i < 0) {
            i = names.length;
            names.push(name);
        }
        // Explicit casts avoid PostgreSQL unknown-type errors on optional filters (NULL IS NULL).
        const value = params[name];
        const numeric = /^(id(?!ioma)|student|actor|version|score|scored|value|privileged|inWindow|enVent|pts|ver|edad|ciclo|anio|mins|duracion|numeroSesion|antExt|reqDer|offset|pageSize|skCorte|targetSk|resultId|itemId|userId|event)/i.test(name);
        const cast = typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? 'uuid' : Buffer.isBuffer(value) ? 'bytea' : (typeof value === 'number' || numeric) ? 'bigint' : 'text';
        return `$${i + 1}::${cast}`;
    });
    return { text, values: names.map(n => params[n] ?? null) };
}
// SQL Server BIT columns were booleans in the HTTP contract. Persist 0/1 in SQL,
// but preserve the existing application representation at the query boundary.
const booleanColumns = new Set(['es_mixto', 'activo', 'requiere_evento_indice', 'puntuacion_inversa', 'obligatorio', 'aplicable', 'en_ventana', 'es_vigente', 'antecedente_clinico_externo', 'requiere_derivacion', 'vigente']);
function normalizeRows(rows: any[]): any[] {
    return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, booleanColumns.has(key) && value !== null ? Boolean(value) : value])));
}
class TransactionRequest {
    private params: Record<string, any> = {};
    constructor(private client: PoolClient) { }
    input(name: string, value: any) { this.params[name] = value; return this; }
    async query(sql: string) { const result = await this.client.query(bindParameters(sql, this.params)); return { recordset: normalizeRows(result.rows), rowsAffected: [result.rowCount] }; }
}
export class DatabaseTransaction {
    private finished = false;
    constructor(public readonly client: PoolClient) { }
    request() { return new TransactionRequest(this.client); }
    async commit() { if (this.finished)
        return; try {
        await this.client.query('COMMIT');
    }
    finally {
        this.finished = true;
        this.client.release();
    } }
    async rollback() { if (this.finished)
        return; try {
        await this.client.query('ROLLBACK');
    }
    finally {
        this.finished = true;
        this.client.release();
    } }
}
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DatabaseService.name);
    private pool: Pool;
    private dmPool: Pool;
    constructor(private readonly config: ConfigService) { }
    private createPool(prefix: 'OLTP' | 'DM') {
        const get = (key: string, fallback?: string) => this.config.get<string>(`${prefix}_PG_${key}`) || fallback;
        const tls = get('SSL', 'false') === 'true';
        const mode = get('SSL_MODE', 'verify-full');
        if (mode !== 'verify-full' && mode !== 'require')
            throw new Error(`${prefix}_PG_SSL_MODE debe ser verify-full o require.`);
        if (mode === 'require' && (!tls || get('HOST') !== '127.0.0.1'))
            throw new Error(`${prefix}: el modo require solo se permite por el túnel local con SSL activo.`);
        const pool = new Pool({ host: get('HOST', '127.0.0.1'), port: Number(get('PORT', '5432')), database: get('DATABASE', prefix === 'OLTP' ? 'mmet_bi_oltp' : 'mmet_bi_dm'), user: get('USER', 'postgres'), password: get('PASSWORD'), options: '-c timezone=America/Lima', max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
            ssl: tls ? { rejectUnauthorized: mode === 'verify-full', ...(get('CA_FILE') ? { ca: readFileSync(get('CA_FILE')!, 'utf8') } : {}), ...(get('SERVERNAME') ? { servername: get('SERVERNAME') } : {}) } : false });
        pool.on('error', error => this.logger.error(`Conexión PostgreSQL ${prefix}: ${error.message}`));
        return pool;
    }
    async onModuleInit() {
        this.pool = this.createPool('OLTP');
        this.dmPool = this.createPool('DM');
        try {
            const [oltp, dm] = await Promise.all([this.pool.query('SELECT current_database() AS name'), this.dmPool.query('SELECT current_database() AS name')]);
            if (oltp.rows[0].name === dm.rows[0].name && this.config.get('OLTP_PG_HOST') === this.config.get('DM_PG_HOST') && this.config.get('OLTP_PG_PORT') === this.config.get('DM_PG_PORT'))
                throw new Error('OLTP y Data Mart deben ser bases independientes.');
            this.logger.log('Conectado a las dos bases PostgreSQL: OLTP y Data Mart.');
        }
        catch (error) {
            await this.onModuleDestroy();
            throw error;
        }
    }
    async onModuleDestroy() { await Promise.all([this.pool?.end(), this.dmPool?.end()]); }
    async query<T = any>(sql: string, params: Record<string, any> = {}): Promise<T[]> { return normalizeRows((await this.pool.query(bindParameters(sql, params))).rows); }
    async queryDm<T = any>(sql: string, params: Record<string, any> = {}): Promise<T[]> { return normalizeRows((await this.dmPool.query(bindParameters(sql, params))).rows); }
    async beginTransaction() { const client = await this.pool.connect(); try {
        await client.query('BEGIN');
        return new DatabaseTransaction(client);
    }
    catch (e) {
        client.release();
        throw e;
    } }
    async beginDmTransaction() { const client = await this.dmPool.connect(); try {
        await client.query('BEGIN');
        return new DatabaseTransaction(client);
    }
    catch (e) {
        client.release();
        throw e;
    } }
}
