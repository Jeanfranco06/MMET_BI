import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('filtros')
  getFiltros() {
    return this.analyticsService.getFiltros();
  }

  @Get('resumen')
  getResumen(
    @Query('corte') corte?: string,
    @Query('id_programa') idPrograma?: string,
    @Query('id_practica') idPractica?: string,
    @Query('facultad') facultad?: string,
  ) {
    return this.analyticsService.getResumen({
      corte: corte || '2026-11-23',
      idPrograma: idPrograma ? Number(idPrograma) : undefined,
      idPractica: idPractica ? Number(idPractica) : undefined,
      facultad: facultad || undefined,
    });
  }

  @Get('impacto-practicas')
  getImpactoPracticas(
    @Query('instrumento') instrumento?: string,
    @Query('corte') corte?: string,
    @Query('facultad') facultad?: string,
  ) {
    const inst = instrumento === 'PCL-5' ? 'PCL-5' : 'PSS-10';
    return this.analyticsService.getImpactoPracticas({
      instrumento: inst,
      corte: corte || '2026-11-23',
      facultad: facultad || undefined,
    });
  }

  @Get('continuidad')
  getContinuidad(
    @Query('corte') corte?: string,
    @Query('semestre') semestre?: string,
    @Query('id_programa') idPrograma?: string,
    @Query('id_practica') idPractica?: string,
    @Query('estado') estado?: string,
    @Query('buscar') buscar?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.analyticsService.getContinuidad({
      corte: corte || '2026-11-23',
      semestre: semestre || undefined,
      idPrograma: idPrograma ? Number(idPrograma) : undefined,
      idPractica: idPractica ? Number(idPractica) : undefined,
      estado: estado || undefined,
      buscar: buscar?.trim() || undefined,
      page: page ? Math.max(1, Number(page)) : 1,
      pageSize: pageSize ? Math.min(100, Math.max(5, Number(pageSize))) : 10,
    });
  }

  @Get('cumplimiento')
  getCumplimiento(
    @Query('corte') corte?: string,
    @Query('id_programa') idPrograma?: string,
    @Query('instrumento') instrumento?: string,
  ) {
    return this.analyticsService.getCumplimiento({
      corte: corte || '2026-11-23',
      idPrograma: idPrograma ? Number(idPrograma) : undefined,
      instrumento: instrumento === 'PSS-10' || instrumento === 'PCL-5' ? instrumento : undefined,
    });
  }
}
