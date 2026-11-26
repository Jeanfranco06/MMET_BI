import { resolve } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { OperacionModule } from './operacion/operacion.module';
import { AuthModule } from './auth/auth.module';
import { CuestionariosModule } from './cuestionarios/cuestionarios.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [resolve(__dirname, '../.env'), '.env'] }),
    DatabaseModule,
    AnalyticsModule,
    OperacionModule,
    AuthModule,
    CuestionariosModule,
    AiModule,
  ],
})
export class AppModule {}
