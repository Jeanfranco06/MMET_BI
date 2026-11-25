import { Body, Controller, ForbiddenException, Get, Post, Query } from '@nestjs/common';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { OperacionService } from './operacion.service';
import { Roles } from '../auth/auth.guard';

export class RegistrarAsistenciaDto {
  @IsInt()
  id_asignacion: number;

  @IsInt()
  id_sesion: number;

  @IsIn(['ASISTIO', 'INASISTENCIA', 'RETIRO_BAJA'])
  estado_asistencia: 'ASISTIO' | 'INASISTENCIA' | 'RETIRO_BAJA';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  minutos_asistidos?: number;
}

export class RegistrarResultadoDto {
  @IsInt()
  id_oportunidad: number;

  @IsInt()
  @Min(0)
  @Max(80)
  puntaje_total: number;

  @IsDateString()
  fecha_realizacion: string;

  @IsOptional()
  @IsString()
  motivo_correccion?: string;
}

@Controller('operacion')
export class OperacionController {
  constructor(private readonly operacionService: OperacionService) {}

  @Get('sesiones')
  @Roles('ADMIN', 'COORDINACION', 'EVALUACION')
  getSesiones(@Query('id_programa') idPrograma?: string) {
    return this.operacionService.getSesiones(idPrograma ? Number(idPrograma) : undefined);
  }

  @Get('oportunidades-abiertas')
  @Roles('ADMIN', 'EVALUACION')
  getOportunidadesAbiertas(@Query('id_programa') idPrograma?: string) {
    return this.operacionService.getOportunidadesAbiertas(idPrograma ? Number(idPrograma) : undefined);
  }

  @Post('asistencias')
  @Roles('ADMIN', 'COORDINACION')
  registrarAsistencia(@Body() dto: RegistrarAsistenciaDto) {
    return this.operacionService.registrarAsistencia(dto);
  }

  @Post('resultados')
  @Roles('ADMIN', 'EVALUACION')
  registrarResultado() {
    throw new ForbiddenException('El registro por puntaje total está deshabilitado. Use el envío de respuestas completas del estudiante.');
  }
}
