import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.guard';
import { InterpretarEvaluacionDto, InterpretarReporteDto } from './ai.dto';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('interpretar-evaluacion')
  @Roles('ESTUDIANTE', 'ADMIN', 'EVALUACION', 'COORDINACION', 'DIRECCION')
  interpretarEvaluacion(@Body() dto: InterpretarEvaluacionDto) {
    return this.aiService.interpretarEvaluacion(dto);
  }

  @Post('interpretar-reporte')
  @Roles('ADMIN', 'DIRECCION', 'COORDINACION', 'EVALUACION')
  interpretarReporte(@Body() dto: InterpretarReporteDto) {
    return this.aiService.interpretarReporte(dto);
  }
}
