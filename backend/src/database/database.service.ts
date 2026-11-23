import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sqlTedious from 'mssql';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlNative = require('mssql/msnodesqlv8');

export interface SqlParam {
  name: string;
  type: any;
  value: any;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: any;
  private driver: any;

  constructor(private readonly config: ConfigService) {}

  get types() {
    return this.driver || sqlTedious;
  }

  async onModuleInit() {
    const authMode = (this.config.get<string>('DB_AUTH_MODE') || 'windows').toLowerCase();
    const server = this.config.get<string>('DB_SERVER') || 'localhost';
    const database = this.config.get<string>('DB_DATABASE') || 'MMET_BI_OLTP';

    if (authMode === 'windows') {
      const odbcDriver = this.config.get<string>('DB_ODBC_DRIVER') || 'ODBC Driver 17 for SQL Server';
      this.driver = sqlNative;
      const connectionString = `Driver={${odbcDriver}};Server=${server};Database=${database};Trusted_Connection=Yes;TrustServerCertificate=Yes;`;
      this.pool = await new sqlNative.ConnectionPool({
        connectionString,
        driver: 'msnodesqlv8',
      }).connect();
      this.logger.log(`Conectado a SQL Server (${server}/${database}) via Windows Auth [${odbcDriver}]`);
    } else {
      this.driver = sqlTedious;
      this.pool = await new sqlTedious.ConnectionPool({
        server,
        port: Number(this.config.get<string>('DB_PORT') || 1433),
        database,
        user: this.config.get<string>('DB_USER'),
        password: this.config.get<string>('DB_PASSWORD'),
        options: {
          encrypt: this.config.get<string>('DB_ENCRYPT') !== 'false',
          trustServerCertificate: this.config.get<string>('DB_TRUST_SERVER_CERT') !== 'false',
        },
      }).connect();
      this.logger.log(`Conectado a SQL Server (${server}/${database}) via SQL Auth`);
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.close();
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

  async beginTransaction() {
    const tx = new this.driver.Transaction(this.pool);
    await tx.begin();
    return tx;
  }
}
