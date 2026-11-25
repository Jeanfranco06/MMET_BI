import { Body, Controller, ForbiddenException, Get, Post, Query } from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { OperacionService } from './operacion.service';
import { Roles } from '../auth/auth.guard';

export class CrearEstudianteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  codigo_estudiante: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombres: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  apellidos: string;

  @IsEmail({}, { message: 'correo_institucional debe ser un correo electrónico válido.' })
  @MaxLength(150)
  correo_institucional: string;

  @IsInt()
  @Min(18, { message: 'La edad mínima permitida es 18 años.' })
  @Max(99)
  edad_anios: number;

  @IsIn(['F', 'M', 'NO_ESPECIFICADO'])
  sexo_codificado: 'F' | 'M' | 'NO_ESPECIFICADO';

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  facultad_o_area: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  carrera: string;

  @IsInt()
  @Min(1)
  @Max(14)
  ciclo_academico: number;
}

export class CrearAsignacionDto {
  @IsInt()
  @Min(1)
  id_estudiante: number;

  @IsInt()
  @Min(1)
  id_programa: number;

  @IsOptional()
  @IsDateString()
  fecha_inscripcion?: string;
}

export class CrearEventoIndiceDto {
  @IsInt()
  @Min(1)
  id_estudiante: number;

  @IsInt()
  @Min(1)
  id_categoria_evento: number;

  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(2030)
  anio_ocurrencia_aprox?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion_evento?: string;

  @IsOptional()
  @IsBoolean()
  antecedente_clinico_externo?: boolean;

  @IsOptional()
  @IsBoolean()
  requiere_derivacion?: boolean;
}

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

export class CrearSesionDto {
  @IsInt()
  @Min(1)
  id_programa: number;

  @IsInt()
  @Min(1)
  numero_sesion: number;

  @IsInt()
  @Min(1)
  id_practica_tecnica: number;

  @IsIn(['PRESENCIAL', 'VIRTUAL', 'HIBRIDA'])
  modalidad: 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA';

  @IsInt()
  @Min(5)
  @Max(480)
  duracion_programada_min: number;

  @IsDateString()
  fecha_sesion: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'hora_inicio debe tener formato HH:MM (24h).' })
  hora_inicio?: string;

  @IsOptional()
  @IsIn(['PROGRAMADA', 'REALIZADA'])
  estado_sesion?: 'PROGRAMADA' | 'REALIZADA';
}

export class EjecutarEtlDto {
  @IsOptional()
  @IsDateString()
  fecha_corte?: string;
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

  @Get('estudiantes')
  @Roles('ADMIN', 'COORDINACION', 'EVALUACION')
  getEstudiantes(
    @Query('buscar') buscar?: string,
    @Query('facultad') facultad?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.operacionService.getEstudiantes({
      buscar: buscar?.trim() || undefined,
      facultad: facultad?.trim() || undefined,
      page: page ? Math.max(1, Number(page)) : 1,
      pageSize: pageSize ? Math.min(100, Math.max(1, Number(pageSize))) : 15,
    });
  }

  @Post('estudiantes')
  @Roles('ADMIN', 'COORDINACION')
  crearEstudiante(@Body() dto: CrearEstudianteDto) {
    return this.operacionService.crearEstudiante(dto);
  }

  @Post('asignaciones')
  @Roles('ADMIN', 'COORDINACION')
  crearAsignacion(@Body() dto: CrearAsignacionDto) {
    return this.operacionService.crearAsignacion(dto);
  }

  @Get('categorias-evento')
  @Roles('ADMIN', 'EVALUACION', 'COORDINACION')
  getCategoriasEvento() {
    return this.operacionService.getCategoriasEvento();
  }

  @Get('eventos-indice')
  @Roles('ADMIN', 'EVALUACION', 'COORDINACION')
  getEventosIndice(
    @Query('id_estudiante') idEstudiante?: string,
    @Query('codigo_estudiante') codigoEstudiante?: string,
  ) {
    return this.operacionService.getEventosIndice({
      idEstudiante: idEstudiante ? Number(idEstudiante) : undefined,
      codigoEstudiante: codigoEstudiante?.trim() || undefined,
    });
  }

  @Post('eventos-indice')
  @Roles('ADMIN', 'EVALUACION', 'COORDINACION')
  crearEventoIndice(@Body() dto: CrearEventoIndiceDto) {
    return this.operacionService.crearEventoIndice(dto);
  }

  @Get('sesiones')
  @Roles('ADMIN', 'COORDINACION', 'EVALUACION')
  getSesiones(@Query('id_programa') idPrograma?: string) {
    return this.operacionService.getSesiones(idPrograma ? Number(idPrograma) : undefined);
  }

  @Post('sesiones')
  @Roles('ADMIN', 'COORDINACION')
  crearSesion(@Body() dto: CrearSesionDto) {
    return this.operacionService.crearSesion(dto);
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

  @Post('etl/ejecutar')
  @Roles('ADMIN')
  ejecutarEtl(@Body() dto: EjecutarEtlDto) {
    return this.operacionService.ejecutarEtl(dto?.fecha_corte);
  }

  @Post('resultados')
  @Roles('ADMIN', 'EVALUACION')
  registrarResultado() {
    throw new ForbiddenException(
      'El registro por puntaje total está deshabilitado. Use el envío de respuestas completas del estudiante.',
    );
  }
}
