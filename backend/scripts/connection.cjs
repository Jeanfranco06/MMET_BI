const fs=require('fs'); const path=require('path'); const {Pool}=require('pg');
try {process.loadEnvFile(path.resolve(__dirname,'../.env'));} catch(e) {if(e.code!=='ENOENT')throw e;}
function pool(prefix, env = process.env) {
  const get = (key, fallback) => env[`${prefix}_PG_${key}`] || fallback;
  const tls = get('SSL', 'false') === 'true';
  const mode = get('SSL_MODE', 'verify-full');
  if (!['verify-full', 'require'].includes(mode)) throw new Error(`${prefix}_PG_SSL_MODE inválido.`);
  if (mode === 'require' && (!tls || get('HOST') !== '127.0.0.1')) {
    throw new Error(`${prefix}: el modo require solo se permite por el túnel local con SSL activo.`);
  }
  return new Pool({
    host: get('HOST', '127.0.0.1'),
    port: Number(get('PORT', '5432')),
    database: get('DATABASE', prefix === 'OLTP' ? 'mmet_bi_oltp' : 'mmet_bi_dm'),
    user: get('USER', 'postgres'),
    password: get('PASSWORD'),
    options: '-c timezone=America/Lima',
    connectionTimeoutMillis: 10000,
    ssl: tls ? {
      rejectUnauthorized: mode === 'verify-full',
      ...(get('CA_FILE') ? { ca: fs.readFileSync(get('CA_FILE'), 'utf8') } : {}),
      ...(get('SERVERNAME') ? { servername: get('SERVERNAME') } : {}),
    } : false,
  });
}
module.exports={pool};
