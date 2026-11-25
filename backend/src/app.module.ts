import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { OperacionModule } from './operacion/operacion.module';
import { AuthModule } from './auth/auth.module';
import { CuestionariosModule } from './cuestionarios/cuestionarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AnalyticsModule,
    OperacionModule,
    AuthModule,
    CuestionariosModule,
  ],
})
export class AppModule {}
