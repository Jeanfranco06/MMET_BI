import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Roles } from '../auth/auth.guard';
import { CuestionariosService } from './cuestionarios.service';

class RespuestaDto {
  @IsInt() @Min(1) @Max(20) numero_item: number;
  @IsInt() @Min(0) @Max(4) valor: number;
}
class BorradorDto {
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => RespuestaDto) respuestas: RespuestaDto[];
}
class EnvioDto extends BorradorDto {
  @IsDateString() fecha_realizacion: string;
}
class CorreccionDto extends EnvioDto {
  @IsString() @MinLength(6) @MaxLength(150) motivo_correccion: string;
}

@Controller('estudiante/evaluaciones')
@Roles('ESTUDIANTE')
export class CuestionariosController {
  constructor(private readonly cuestionarios: CuestionariosService) {}
  @Get() list(@Req() req: any) { return this.cuestionarios.list(req.user.id_estudiante); }
  @Get(':id') get(@Req() req: any, @Param('id', ParseIntPipe) id: number) { return this.cuestionarios.get(req.user.id_estudiante, id); }
  @Put(':id/borrador') save(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: BorradorDto) { return this.cuestionarios.saveDraft(req.user.id_estudiante, id, dto.respuestas); }
  @Post(':id/enviar') submit(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: EnvioDto) { return this.cuestionarios.submit(req.user.id_estudiante, req.user.id_usuario, id, dto); }
}

@Controller('evaluacion/admin')
@Roles('ADMIN', 'EVALUACION')
export class CorreccionesCuestionarioController {
  constructor(private readonly cuestionarios: CuestionariosService) {}
  @Post(':id/corregir')
  correct(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: CorreccionDto) {
    return this.cuestionarios.correct(req.user.id_usuario, id, dto);
  }
}
