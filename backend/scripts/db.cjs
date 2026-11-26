const fs=require('fs');const path=require('path');const crypto=require('crypto');const {pool}=require('./connection.cjs');
const root=path.resolve(__dirname,'../../sql_postgres');
async function apply(db,file){const client=await db.connect();try{await client.query('CREATE TABLE IF NOT EXISTS public.mmet_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');const sql=fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,'');const hash=crypto.createHash('sha256').update(sql).digest('hex');const old=(await client.query('SELECT checksum FROM public.mmet_schema_migrations WHERE name=$1',[file])).rows[0];if(old){if(old.checksum!==hash)throw new Error(`${file} cambió después de aplicarse. Cree un script incremental; no se recrean tablas.`);return;}await client.query('BEGIN');await client.query(sql.replace(/^\s*BEGIN;/,'').replace(/COMMIT;\s*$/,''));await client.query('INSERT INTO public.mmet_schema_migrations(name,checksum) VALUES($1,$2)',[file,hash]);await client.query('COMMIT');console.log('Aplicado:',file);}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
(async()=>{const mode=process.argv[2];const oltp=pool('OLTP'),dm=pool('DM');try{
 if(mode==='init'){
  await apply(oltp,'01_oltp.sql');
  const importIndex=process.argv.indexOf('--import');
  if(importIndex>=0){const result=require('child_process').spawnSync(process.execPath,[path.join(__dirname,'import-oltp.cjs'),process.argv[importIndex+1]],{stdio:'inherit'});if(result.status!==0)throw new Error('Falló la importación OLTP.');}
  await apply(oltp,'02_reglas.sql');await apply(dm,'03_datamart.sql');await apply(dm,'04_etl.sql');
 }else if(mode==='seed'){
  await apply(oltp,'05_catalogos_y_formularios.sql');await apply(oltp,'06_datos_demo.sql');
 }else if(mode==='verify'){
  await oltp.query(fs.readFileSync(path.join(root,'08_verificar_oltp.sql'),'utf8'));
  await dm.query(fs.readFileSync(path.join(root,'07_verificar_datamart.sql'),'utf8'));console.log('Integridad de OLTP y Data Mart: OK');
 }else if(mode==='etl'){
  require('reflect-metadata');const {ConfigService}=require('@nestjs/config');const {DatabaseService}=require('../dist/database/database.service');const {EtlService}=require('../dist/database/etl.service');const db=new DatabaseService(new ConfigService());await db.onModuleInit();try{console.log(JSON.stringify(await new EtlService(db).run(process.argv[3]||'2026-11-23'),null,2));}finally{await db.onModuleDestroy();}
 }else throw new Error('Uso: db.cjs init [--import export.json] | seed | verify | etl [AAAA-MM-DD]');
}finally{await Promise.all([oltp.end(),dm.end()]);}})().catch(e=>{console.error(e.message);process.exitCode=1;});
