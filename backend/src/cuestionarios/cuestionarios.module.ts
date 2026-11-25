import { Module } from '@nestjs/common';
import { CorreccionesCuestionarioController, CuestionariosController } from './cuestionarios.controller';
import { CuestionariosService } from './cuestionarios.service';

@Module({ controllers: [CuestionariosController, CorreccionesCuestionarioController], providers: [CuestionariosService] })
export class CuestionariosModule {}
