import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sqlTedious from 'mssql';

export interface SqlParam {
  name: string;
  type: any;
  value: any;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: any;
  private dmPool: any;
  private driver: any;
  private dmDatabase = 'MMET_BI_DM';

  constructor(private readonly config: ConfigService) {}

  get types() {
    return this.driver || sqlTedious;
  }

  get dmDatabaseName(): string {
    return this.dmDatabase;
  }

  private async connectPool(database: string, maxConnections = 10) {
    const authMode = (this.config.get<string>('DB_AUTH_MODE') || 'windows').toLowerCase();
    const server = this.config.get<string>('DB_SERVER') || 'localhost';

    if (authMode === 'windows') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sqlNative = require('mssql/msnodesqlv8');
      const odbcDriver = this.config.get<string>('DB_ODBC_DRIVER') || 'ODBC Driver 17 for SQL Server';
      this.driver = sqlNative;
      const connectionString = `Driver={${odbcDriver}};Server=${server};Database=${database};Trusted_Connection=Yes;TrustServerCertificate=Yes;`;
      const pool = await new sqlNative.ConnectionPool({
        connectionString,
        driver: 'msnodesqlv8',
        pool: {
          max: maxConnections,
          min: 0,
          idleTimeoutMillis: 30000,
          acquireTimeoutMillis: 60000,
          createTimeoutMillis: 30000,
        },
      }).connect();
      this.logger.log(`Conectado a SQL Server (${server}/${database}) via Windows Auth [${odbcDriver}]`);
      return pool;
    }

    this.driver = sqlTedious;
    const pool = await new sqlTedious.ConnectionPool({
      server,
      port: Number(this.config.get<string>('DB_PORT') || 1433),
      database,
      user: this.config.get<string>('DB_USER'),
      password: this.config.get<string>('DB_PASSWORD'),
      connectionTimeout: 30000,
      requestTimeout: 60000,
      pool: {
        max: maxConnections,
        min: 0,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 60000,
        createTimeoutMillis: 30000,
      },
      options: {
        encrypt: this.config.get<string>('DB_ENCRYPT') !== 'false',
        trustServerCertificate: this.config.get<string>('DB_TRUST_SERVER_CERT') !== 'false',
      },
    }).connect();
    this.logger.log(`Conectado a SQL Server (${server}/${database}) via SQL Auth (pool max=${maxConnections})`);
    return pool;
  }

  async onModuleInit() {
    const oltpDatabase = this.config.get<string>('DB_DATABASE') || 'MMET_BI_OLTP';
    const dmDatabase = (this.config.get<string>('DB_DM_NAME') || 'MMET_BI_DM').trim();
    if (!/^[A-Za-z0-9_]+$/.test(dmDatabase)) {
      throw new Error(`Nombre de base de datos Data Mart inválido: ${dmDatabase}`);
    }
    this.dmDatabase = dmDatabase;

    const dmPoolMax = Math.max(1, Number(this.config.get<string>('DB_DM_POOL_MAX') || 4));
    this.pool = await this.connectPool(oltpDatabase, 10);
    this.dmPool = await this.connectPool(dmDatabase, dmPoolMax);
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.close();
    }
    if (this.dmPool) {
      await this.dmPool.close();
    }
  }

  async query<T = any>(sqlText: string, params: Record<string, any> = {}): Promise<T[]> {
    const req = this.pool.request();
    for (const [key, value] of Object.entries(params)) {
      req.input(key, value);
    }
    const result = await req.query(sqlText);
    return (result.recordset || []) as T[];
  }

  async queryDm<T = any>(sqlText: string, params: Record<string, any> = {}): Promise<T[]> {
    const req = this.dmPool.request();
    for (const [key, value] of Object.entries(params)) {
      req.input(key, value);
    }
    const result = await req.query(sqlText);
    return (result.recordset || []) as T[];
  }

  async beginTransaction() {
    const tx = new this.driver.Transaction(this.pool);
    await tx.begin();
    return tx;
  }
}
