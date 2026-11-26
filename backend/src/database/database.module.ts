import { EtlService } from './etl.service';
import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [DatabaseService, EtlService],
  exports: [DatabaseService, EtlService],
})
export class DatabaseModule {}
