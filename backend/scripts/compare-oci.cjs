const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv, isDeepStrictEqual } = require('node:util');
const { pool } = require('./connection.cjs');
const { bindParameters } = require('../dist/database/database.service');
const { AnalyticsService } = require('../dist/analytics/analytics.service');

const profile = (name) => parseEnv(readFileSync(resolve(__dirname, '..', name), 'utf8'));
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const catalogs = {
  relations: `SELECT c.relname, c.relkind, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity,
    CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid) END AS view
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m','S') ORDER BY c.relname`,
  columns: `SELECT c.relname, a.attname, format_type(a.atttypid,a.atttypmod) AS type,
    a.attnotnull, a.attidentity, a.attgenerated, co.collname, pg_get_expr(d.adbin,d.adrelid) AS expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_collation co ON co.oid=a.attcollation
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY c.relname,a.attnum`,
  constraints: `SELECT c.relname, x.conname, x.convalidated, pg_get_constraintdef(x.oid) AS definition
    FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 ORDER BY c.relname,x.conname`,
  indexes: `SELECT i.relname, x.indisvalid, pg_get_indexdef(i.oid) AS definition FROM pg_index x
    JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=i.relnamespace
    WHERE n.nspname=$1 ORDER BY i.relname`,
  triggers: `SELECT c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
  routines: `SELECT p.proname, pg_get_functiondef(p.oid) AS definition FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.prokind IN ('f','p')
    ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)`,
  sequences: `SELECT sequencename, data_type::text, start_value::text, min_value::text, max_value::text,
    increment_by::text, cycle, cache_size::text FROM pg_sequences WHERE schemaname=$1 ORDER BY sequencename`,
};

async function inspect(client, schema, relations) {
  const result = {};
  for (const { relname, relkind } of relations) {
    const name = `${quote(schema)}.${quote(relname)}`;
    const sql = relkind === 'S'
      ? `SELECT last_value::text, is_called FROM ${name}`
      : `SELECT count(*)::text AS filas,
           encode(sha256(convert_to(coalesce(string_agg(digest, '' ORDER BY digest COLLATE "C"), ''), 'UTF8')), 'hex') AS hash
         FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS digest FROM ${name} t) hashes`;
    result[relname] = (await client.query(sql)).rows[0];
  }
  return result;
}

let differences = 0;
function compare(label, local, remote) {
  const equal = isDeepStrictEqual(local, remote);
  console.log(`${equal ? 'IGUAL' : 'DIFERENTE'} ${label}`);
  if (!equal) {
    differences++;
    if (Array.isArray(local) && Array.isArray(remote)) {
      const left = new Set(local.map((row) => JSON.stringify(row)));
      const right = new Set(remote.map((row) => JSON.stringify(row)));
      const name = (row) => [row.relname, row.attname, row.conname, row.tgname, row.proname, row.sequencename].filter(Boolean).join('.');
      const affected = [...local.filter((row) => !right.has(JSON.stringify(row))),
        ...remote.filter((row) => !left.has(JSON.stringify(row)))].map(name).filter(Boolean);
      if (affected.length) console.log('  Objetos:', [...new Set(affected)].join(', '));
    }
  }
}

async function compareDatabase(prefix, schema, local, remote, expectedRemoteIp) {
  const clients = [];
  const pools = [pool(prefix, local), pool(prefix, remote)];
  try {
    for (const db of pools) {
      const client = await db.connect();
      clients.push(client);
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TIME ZONE 'UTC'; SET LOCAL search_path=pg_catalog");
    }
    const [a, b] = clients;
    const identity = `SELECT current_database() AS db, inet_server_addr()::text AS ip, version(),
      (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls`;
    const identities = await Promise.all(clients.map(async (client) => (await client.query(identity)).rows[0]));
    console.log(prefix, identities);
    if (expectedRemoteIp && identities[1].ip?.split('/')[0] !== expectedRemoteIp) {
      throw new Error('El túnel apunta a un servidor distinto del OCI esperado.');
    }
    if (expectedRemoteIp && !identities[1].tls) throw new Error('OCI no negoció TLS.');
    const ownership = await b.query(`SELECT pg_get_userbyid(c.relowner) AS propietario, count(*) AS objetos
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m','S') GROUP BY 1 ORDER BY 1`, [schema]);
    console.log(`${prefix} propietarios del destino:`, ownership.rows);

    let relations;
    for (const [name, sql] of Object.entries(catalogs)) {
      const [{ rows: left }, { rows: right }] = await Promise.all(clients.map((client) => client.query(sql, [schema])));
      compare(`${prefix} ${name} (${left.length}/${right.length})`, left, right);
      if (name === 'relations') relations = [left, right];
    }
    for (const client of clients) await client.query("SET LOCAL DATESTYLE TO 'ISO, YMD'; SET LOCAL bytea_output TO 'hex'");
    const contents = await Promise.all(clients.map(async (client, index) => {
      const data = await inspect(client, schema, relations[index]);
      const ledger = (await client.query("SELECT to_regclass('public.mmet_schema_migrations') AS name")).rows[0].name;
      if (ledger) Object.assign(data, await inspect(client, 'public', [{ relname: 'mmet_schema_migrations', relkind: 'r' }]));
      return data;
    }));
    for (const name of new Set(contents.flatMap(Object.keys))) {
      const counts = contents.map((data) => data[name]?.filas ?? (data[name] ? 'secuencia' : 'ausente'));
      compare(`${prefix} ${name} (${counts.join('/')})`, contents[0][name], contents[1][name]);
    }
    if (prefix === 'DM') {
      const services = clients.map((client) => {
        // Un cliente por transacción. Las consultas paralelas del servicio esperan su turno.
        let pending = Promise.resolve();
        return new AnalyticsService({
          queryDm(sql, params) {
            const result = pending.then(async () => (await client.query(bindParameters(sql, params))).rows);
            pending = result.then(() => {}, () => {});
            return result;
          },
        });
      });
      const filters = await Promise.all(services.map((service) => service.getFiltros()));
      compare('Filtros analíticos', ...filters);
      for (const corte of new Set(filters.flatMap((result) => result.cortesDisponibles))) {
        const reports = {
          'KPI-01 a KPI-04': (service) => service.getResumen({ corte }),
          'Evolución': (service) => service.getEvolucion({ corte, pageSize: 25 }),
          'Impacto PSS-10': (service) => service.getImpactoPracticas({ corte, instrumento: 'PSS-10' }),
          'Impacto PCL-5': (service) => service.getImpactoPracticas({ corte, instrumento: 'PCL-5' }),
          'Continuidad': (service) => service.getContinuidad({ corte, pageSize: 25 }),
          'Cumplimiento': (service) => service.getCumplimiento({ corte, pageSize: 25 }),
        };
        for (const [name, read] of Object.entries(reports)) {
          compare(`${corte} ${name}`, ...await Promise.all(services.map(read)));
        }
      }
    }
  } finally {
    await Promise.all(clients.map(async (client) => {
      try { await client.query('ROLLBACK'); } finally { client.release(); }
    }));
    await Promise.all(pools.map((db) => db.end()));
  }
}

async function main() {
  const local = profile('.env');
  const auditProfile = process.argv[2] || '.env.oci.local';
  if (!['.env.oci.local', '.env.oci-audit.local'].includes(auditProfile)) {
    throw new Error('Usa .env.oci.local o .env.oci-audit.local para la conciliación.');
  }
  const remote = profile(auditProfile);
  for (const prefix of ['OLTP', 'DM']) {
    if (remote[`${prefix}_PG_HOST`] !== '127.0.0.1' || remote[`${prefix}_PG_PORT`] !== '5433'
      || !remote[`${prefix}_PG_PASSWORD`] || remote[`${prefix}_PG_SSL`] !== 'true') {
      throw new Error(`Completa el perfil OCI de ${prefix} con su contraseña y TLS.`);
    }
  }
  await compareDatabase('OLTP', 'dbo', local, remote, '10.0.2.196');
  await compareDatabase('DM', 'dm', local, remote, '10.0.2.196');
  console.log(`Diferencias detectadas: ${differences}`);
  if (differences) process.exitCode = 2;
}

module.exports = { compareDatabase };
if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
