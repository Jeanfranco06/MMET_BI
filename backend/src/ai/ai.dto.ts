import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class InterpretarEvaluacionDto {
  @IsIn(['PSS-10', 'PCL-5'])
  instrumento: 'PSS-10' | 'PCL-5';

  @IsNumber()
  @Min(0)
  @Max(80)
  puntaje_total: number;

  @IsIn(['INICIAL', 'FINAL'])
  momento: 'INICIAL' | 'FINAL';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(80)
  puntaje_inicial_previo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  codigo_practica?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre_practica?: string;
}

export class GrupoReporteAiDto {
  @IsString()
  @MaxLength(150)
  nombre: string;

  @IsInt()
  @Min(0)
  n: number;

  @IsOptional()
  @IsIn(['PSS-10', 'PCL-5'])
  instrumento?: 'PSS-10' | 'PCL-5';

  @IsOptional()
  @IsNumber()
  valor?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  semaforo?: string;
}

export class InterpretarReporteDto {
  @IsIn(['RO-01', 'RO-02', 'RG-01', 'RG-02'])
  reporte: 'RO-01' | 'RO-02' | 'RG-01' | 'RG-02';

  @IsDateString()
  corte: string;

  @IsOptional()
  @IsObject()
  filtros?: Record<string, any>;

  @IsObject()
  kpis: Record<string, any>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrupoReporteAiDto)
  grupos?: GrupoReporteAiDto[];
}
