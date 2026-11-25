import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InterpretarEvaluacionDto, InterpretarReporteDto } from './ai.dto';

export const DISCLAIMER_NO_CLINICO =
  'Esta interpretación preliminar tiene fines exclusivamente informativos y académicos de apoyo al seguimiento del programa. No constituye un diagnóstico clínico, valoración médica ni prescripción terapéutica, y no reemplaza la evaluación de un profesional de salud mental.';

export const NOTA_METODOLOGICA_REPORTE =
  'Los resultados reflejan asociaciones observadas en el corte seleccionado y no demuestran causalidad. Las escalas PSS-10 (0–40) y PCL-5 (0–80) miden constructos distintos y nunca se combinan ni promedian entre sí.';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly config: ConfigService) {}

  private getConfig() {
    const baseUrl = (
      this.config.get<string>('AI_BASE_URL') ||
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
    ).replace(/\/+$/, '');
    const apiKey = (this.config.get<string>('AI_API_KEY') || '').trim();
    const model = (this.config.get<string>('AI_MODEL') || 'qwen-plus').trim();
    const timeoutMs = Number(this.config.get<string>('AI_TIMEOUT_MS') || 20000);
    return { baseUrl, apiKey, model, timeoutMs };
  }

  private async callChatCompletion(
    systemPrompt: string,
    userPayload: Record<string, any>,
  ): Promise<{ content: any; model: string } | null> {
    const { baseUrl, apiKey, model, timeoutMs } = this.getConfig();
    if (!apiKey) {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(userPayload) },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        this.logger.warn(`AI API HTTP ${response.status}: ${errText.slice(0, 200)}`);
        return null;
      }

      const data: any = await response.json();
      const rawContent = data?.choices?.[0]?.message?.content;
      if (!rawContent || typeof rawContent !== 'string') {
        return null;
      }

      const cleaned = rawContent
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      return { content: JSON.parse(cleaned), model: data?.model || model };
    } catch (err: any) {
      this.logger.warn(`Fallo al consultar modelo de IA externo (${err?.message || 'error'}). Usando respaldo estructurado.`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async interpretarEvaluacion(dto: InterpretarEvaluacionDto) {
    const escalaMax = dto.instrumento === 'PSS-10' ? 40 : 80;
    const metaReduccion = dto.instrumento === 'PSS-10' ? 4 : 10;

    if (dto.puntaje_total > escalaMax) {
      throw new BadRequestException(
        `El puntaje ${dto.puntaje_total} excede el máximo permitido (${escalaMax}) para ${dto.instrumento}.`,
      );
    }
    if (dto.puntaje_inicial_previo !== undefined && dto.puntaje_inicial_previo > escalaMax) {
      throw new BadRequestException(
        `El puntaje inicial previo ${dto.puntaje_inicial_previo} excede el máximo (${escalaMax}) para ${dto.instrumento}.`,
      );
    }

    const variacion =
      dto.puntaje_inicial_previo !== undefined
        ? Number((dto.puntaje_inicial_previo - dto.puntaje_total).toFixed(2))
        : null;

    // Payload estrictamente anonimizado (sin datos personales identificables)
    const sanitizedPayload = {
      instrumento: dto.instrumento,
      escala_rango: `0-${escalaMax}`,
      momento: dto.momento,
      puntaje_total: dto.puntaje_total,
      puntaje_inicial_previo: dto.puntaje_inicial_previo ?? null,
      reduccion_observada_pts: variacion,
      meta_operativa_referencial_pts: metaReduccion,
      practica_principal: dto.codigo_practica
        ? `${dto.codigo_practica}${dto.nombre_practica ? ` - ${dto.nombre_practica}` : ''}`
        : null,
    };

    const systemPrompt = [
      'Eres un asistente académico de soporte al sistema universitario MMET_BI (UNT Trujillo).',
      'Analizas ÚNICAMENTE un resumen numérico anónimo de una evaluación PSS-10 (0-40) o PCL-5 (0-80).',
      'Reglas estrictas:',
      '1. NUNCA emitas un diagnóstico clínico, etiqueta patológica ni prescripción médica.',
      '2. NUNCA afirmes causalidad entre la práctica y el puntaje.',
      '3. Responde ÚNICAMENTE con un objeto JSON válido con las claves exactas:',
      '   { "resumen_preliminar": string, "observaciones_clave": string[], "sugerencias_seguimiento": string[] }',
      '4. Redacta en español claro, empático y objetivo.',
    ].join('\n');

    const llmResult = await this.callChatCompletion(systemPrompt, sanitizedPayload);

    if (
      llmResult?.content &&
      typeof llmResult.content.resumen_preliminar === 'string' &&
      Array.isArray(llmResult.content.observaciones_clave) &&
      Array.isArray(llmResult.content.sugerencias_seguimiento)
    ) {
      return {
        instrumento: dto.instrumento,
        momento: dto.momento,
        puntaje_total: dto.puntaje_total,
        escala_maxima: escalaMax,
        variacion_vs_inicial: variacion,
        resumen_preliminar: llmResult.content.resumen_preliminar,
        observaciones_clave: llmResult.content.observaciones_clave.map(String),
        sugerencias_seguimiento: llmResult.content.sugerencias_seguimiento.map(String),
        disclaimer: DISCLAIMER_NO_CLINICO,
        modelo: llmResult.model,
        fuente: 'llm_externo' as const,
      };
    }

    // Respaldo estructurado basado en reglas cuando AI_API_KEY no está configurada o el proveedor no responde
    const ratio = dto.puntaje_total / escalaMax;
    const nivelReferencial =
      ratio < 0.35 ? 'bajo' : ratio < 0.65 ? 'moderado' : 'elevado';

    const observaciones: string[] = [
      `Se registró un puntaje total de ${dto.puntaje_total}/${escalaMax} en ${dto.instrumento} (${dto.momento}), ubicado en un rango referencial ${nivelReferencial} de la escala.`,
    ];

    if (variacion !== null) {
      if (variacion >= metaReduccion) {
        observaciones.push(
          `Respecto a la medición inicial (${dto.puntaje_inicial_previo} pts), se observa una disminución de ${variacion} puntos, alcanzando o superando la referencia operativa del programa (≥ ${metaReduccion} pts).`,
        );
      } else if (variacion > 0) {
        observaciones.push(
          `Respecto a la medición inicial (${dto.puntaje_inicial_previo} pts), se observa una disminución de ${variacion} puntos, por debajo de la referencia operativa de ${metaReduccion} pts.`,
        );
      } else if (variacion === 0) {
        observaciones.push(
          `El puntaje coincide con la medición inicial (${dto.puntaje_inicial_previo} pts), sin variación numérica observada.`,
        );
      } else {
        observaciones.push(
          `Respecto a la medición inicial (${dto.puntaje_inicial_previo} pts), se observa un incremento de ${Math.abs(variacion)} puntos en el puntaje reportado.`,
        );
      }
    }

    if (sanitizedPayload.practica_principal) {
      observaciones.push(
        `Evaluación asociada al programa con práctica principal ${sanitizedPayload.practica_principal}.`,
      );
    }

    const sugerencias: string[] = [
      'Mantener la continuidad en las sesiones programadas y completar las evaluaciones dentro de su ventana reglamentaria.',
    ];
    if (ratio >= 0.65 || (variacion !== null && variacion < 0)) {
      sugerencias.push(
        'Considerar orientación voluntaria con el servicio de bienestar universitario o consejería psicológica institucional para un acompañamiento especializado.',
      );
    } else {
      sugerencias.push(
        'Revisar la evolución en conjunto con el cierre del programa y los hábitos de práctica personal.',
      );
    }

    return {
      instrumento: dto.instrumento,
      momento: dto.momento,
      puntaje_total: dto.puntaje_total,
      escala_maxima: escalaMax,
      variacion_vs_inicial: variacion,
      resumen_preliminar: `Resultado ${dto.momento.toLowerCase()} de ${dto.instrumento}: ${dto.puntaje_total} de ${escalaMax} puntos (rango referencial ${nivelReferencial})${variacion !== null ? `, con una variación observada de ${variacion >= 0 ? `-${variacion}` : `+${Math.abs(variacion)}`} pts respecto al inicio` : ''}.`,
      observaciones_clave: observaciones,
      sugerencias_seguimiento: sugerencias,
      disclaimer: DISCLAIMER_NO_CLINICO,
      modelo: this.getConfig().model,
      fuente: 'fallback_reglas' as const,
    };
  }

  async interpretarReporte(dto: InterpretarReporteDto) {
    // 1. Validación estricta de supresión estadística (n < 5)
    if (dto.grupos && dto.grupos.length > 0) {
      const violaciones = dto.grupos.filter((g) => g.n > 0 && g.n < 5);
      if (violaciones.length > 0) {
        const nombres = violaciones.map((v) => `${v.nombre} (n=${v.n})`).join(', ');
        throw new BadRequestException(
          `Supresión estadística activa: no se permite enviar grupos con n < 5 a interpretación IA (${nombres}). Exclúyalos o amplíe el filtro antes de consultar.`,
        );
      }
    }

    // Verifica también métricas base de tamaño de muestra en kpis
    const sampleKeys = ['pares_validos', 'evaluables', 'elegibles', 'n'];
    const inspectKpis = (obj: any, path = '') => {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        if (sampleKeys.includes(k) && typeof v === 'number' && v > 0 && v < 5) {
          throw new BadRequestException(
            `Supresión estadística activa: el agregado '${path ? `${path}.` : ''}${k}' tiene n=${v} (< 5) y está protegido contra interpretación IA.`,
          );
        }
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          inspectKpis(v, path ? `${path}.${k}` : k);
        }
      }
    };
    inspectKpis(dto.kpis);

    const payload = {
      reporte: dto.reporte,
      corte: dto.corte,
      filtros: dto.filtros || {},
      kpis: dto.kpis,
      grupos: dto.grupos || [],
    };

    const systemPrompt = [
      'Eres un analista de Inteligencia de Negocios para el proyecto universitario MMET_BI (UNT Trujillo).',
      'Recibes KPIs agregados validados y libres de datos personales para uno de los reportes: RO-01 (Continuidad), RO-02 (Cumplimiento), RG-01 (Evolución PSS-10/PCL-5) o RG-02 (Efectividad por Práctica / KPI-05).',
      'Reglas obligatorias:',
      '1. NUNCA infieras causalidad; habla de asociaciones o cambios observados.',
      '2. NUNCA combines ni sumes puntajes de PSS-10 con PCL-5.',
      '3. NUNCA inventes cifras que no estén en el JSON recibido.',
      '4. Responde ÚNICAMENTE con un objeto JSON válido con estas 3 listas exactas:',
      '   { "hechos_observados": string[], "lectura_semaforos": string[], "recomendaciones_gestion": string[] }',
      '5. Redacta en español ejecutivo y conciso.',
    ].join('\n');

    const llmResult = await this.callChatCompletion(systemPrompt, payload);

    if (
      llmResult?.content &&
      Array.isArray(llmResult.content.hechos_observados) &&
      Array.isArray(llmResult.content.lectura_semaforos) &&
      Array.isArray(llmResult.content.recomendaciones_gestion)
    ) {
      return {
        reporte: dto.reporte,
        corte: dto.corte,
        hechos_observados: llmResult.content.hechos_observados.map(String),
        lectura_semaforos: llmResult.content.lectura_semaforos.map(String),
        recomendaciones_gestion: llmResult.content.recomendaciones_gestion.map(String),
        nota_metodologica: NOTA_METODOLOGICA_REPORTE,
        modelo: llmResult.model,
        fuente: 'llm_externo' as const,
      };
    }

    // Respaldo determinístico estructurado cuando AI_API_KEY no está configurada
    const hechos: string[] = [
      `Reporte ${dto.reporte} analizado al corte ${dto.corte} con los filtros activos del Data Mart.`,
    ];
    const semaforos: string[] = [];
    const recomendaciones: string[] = [];

    for (const [clave, valor] of Object.entries(dto.kpis || {})) {
      if (valor && typeof valor === 'object' && 'semaforo' in (valor as any)) {
        const v: any = valor;
        semaforos.push(`${clave}: semáforo ${v.semaforo}.`);
      } else if (clave === 'semaforo' && typeof valor === 'string') {
        semaforos.push(`Estado general del indicador: ${valor}.`);
      } else if (typeof valor === 'number' || typeof valor === 'string') {
        hechos.push(`${clave}: ${valor}.`);
      }
    }

    if (dto.grupos && dto.grupos.length > 0) {
      hechos.push(`Se analizaron ${dto.grupos.length} agrupaciones con tamaño de muestra válido (n ≥ 5).`);
      const enAlerta = dto.grupos.filter((g) => g.semaforo === 'REGULAR' || g.semaforo === 'MALO');
      if (enAlerta.length > 0) {
        semaforos.push(
          `Agrupaciones en seguimiento prioritario (REGULAR/MALO): ${enAlerta.map((g) => `${g.nombre} (${g.semaforo})`).join(', ')}.`,
        );
      }
    }

    if (semaforos.length === 0) {
      semaforos.push('Revise los umbrales operativos vigentes para cada KPI en la hoja de gestión.');
    }

    if (dto.reporte === 'RO-01') {
      recomendaciones.push(
        'Priorizar contacto preventivo con estudiantes en estado EN_RIESGO antes de que acumulen tres inasistencias consecutivas.',
        'Revisar horarios y modalidades de las cohortes con menor tasa de continuidad.',
      );
    } else if (dto.reporte === 'RO-02') {
      recomendaciones.push(
        'Reforzar recordatorios durante las ventanas activas para reducir oportunidades vencidas y envíos tardíos.',
        'Verificar que todas las oportunidades aplicables tengan versión de cuestionario habilitada.',
      );
    } else if (dto.reporte === 'RG-01') {
      recomendaciones.push(
        'Evaluar por separado la evolución de PSS-10 y PCL-5 en cohortes con menor reducción observada para ajustar el acompañamiento.',
      );
    } else {
      recomendaciones.push(
        'Priorizar la programación de prácticas evaluables que alcanzan la meta operativa y revisar el diseño operativo de aquellas en estado REGULAR o MALO.',
      );
    }

    return {
      reporte: dto.reporte,
      corte: dto.corte,
      hechos_observados: hechos,
      lectura_semaforos: semaforos,
      recomendaciones_gestion: recomendaciones,
      nota_metodologica: NOTA_METODOLOGICA_REPORTE,
      modelo: this.getConfig().model,
      fuente: 'fallback_reglas' as const,
    };
  }
}
