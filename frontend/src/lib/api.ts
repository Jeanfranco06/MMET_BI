const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

async function apiGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Error ${res.status}`);
  }
  return res.json();
}

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || `Error ${res.status}`);
  }
  return data as T;
}

export type SemaforoEstado = 'BUENO' | 'REGULAR' | 'MALO' | 'SIN_DATOS' | 'SUPRIMIDO';

export interface FiltrosResponse {
  practicas: Array<{
    id_practica: number;
    codigo_practica: string;
    nombre_practica: string;
    descripcion: string;
    es_mixto: boolean;
  }>;
  programas: Array<{
    id_programa: number;
    codigo_programa: string;
    nombre_programa: string;
    periodo_academico: string;
    id_practica_principal: number;
    codigo_practica: string;
    nombre_practica: string;
    fecha_inicio: string;
    fecha_cierre: string;
    estado_programa: string;
  }>;
  facultades: string[];
  ciclos?: number[];
  gruposEtarios: string[];
  sexos: string[];
  semestres: string[];
  rangoFechas: { fecha_min: string; fecha_max: string };
}

export interface ResumenResponse {
  corte: string;
  totales: {
    total_estudiantes: number;
    total_programas: number;
    sesiones_realizadas: number;
    total_asistencias: number;
  };
  kpi01_pss10: {
    pares_validos: number;
    suprimido: boolean;
    promedio_inicial: number | null;
    promedio_final: number | null;
    reduccion_promedio: number | null;
    reduccion_pct: number | null;
    disminuyeron: number | null;
    sin_cambio: number | null;
    aumentaron: number | null;
    meta_operativa: string;
    semaforo: SemaforoEstado;
  };
  kpi02_pcl5: {
    pares_validos: number;
    suprimido: boolean;
    promedio_inicial: number | null;
    promedio_final: number | null;
    reduccion_promedio: number | null;
    reduccion_pct: number | null;
    disminuyeron: number | null;
    sin_cambio: number | null;
    aumentaron: number | null;
    meta_operativa: string;
    semaforo: SemaforoEstado;
  };
  kpi03_continuidad: {
    evaluables: number;
    continuan: number | null;
    activos: number | null;
    en_riesgo: number | null;
    abandono: number | null;
    retirados: number | null;
    no_evaluables: number;
    tasa_continuidad: number | null;
    suprimido: boolean;
    meta_operativa: string;
    semaforo: SemaforoEstado;
  };
  kpi04_cumplimiento: {
    elegibles: number;
    completadas: number | null;
    completadas_en_ventana: number | null;
    completadas_tardias: number | null;
    vencidas: number | null;
    pendientes_en_ventana: number | null;
    tasa_cumplimiento: number | null;
    suprimido: boolean;
    meta_operativa: string;
    semaforo: SemaforoEstado;
  };
}

export const api = {
  getFiltros: () => apiGet<FiltrosResponse>('/analytics/filtros'),
  getResumen: (params: { corte: string; id_programa?: string; id_practica?: string; facultad?: string }) =>
    apiGet<ResumenResponse>('/analytics/resumen', params),
  getEvolucion: (params: {
    corte: string;
    semestre?: string;
    facultad?: string;
    id_programa?: string;
    id_practica?: string;
    grupo_etario?: string;
    sexo?: string;
    instrumento?: 'PSS-10' | 'PCL-5' | '';
    agrupar_por?: 'programa' | 'facultad' | 'grupo_etario';
    page?: number;
    pageSize?: number;
  }) => apiGet<any>('/analytics/evolucion', params),
  getImpactoPracticas: (params: {
    instrumento: 'PSS-10' | 'PCL-5';
    corte: string;
    semestre?: string;
    facultad?: string;
  }) => apiGet<any>('/analytics/impacto-practicas', params),
  getContinuidad: (params: {
    corte: string;
    semestre?: string;
    id_programa?: string;
    id_practica?: string;
    facultad?: string;
    ciclo?: string;
    estado?: string;
    buscar?: string;
    page?: number;
    pageSize?: number;
  }) => apiGet<any>('/analytics/continuidad', params),
  getCumplimiento: (params: {
    corte: string;
    semestre?: string;
    id_programa?: string;
    instrumento?: string;
    estado?: string;
    buscar?: string;
    page?: number;
    pageSize?: number;
  }) => apiGet<any>('/analytics/cumplimiento', params),
  getSesiones: (id_programa?: string) => apiGet<any[]>('/operacion/sesiones', { id_programa }),
  getOportunidadesAbiertas: (id_programa?: string) =>
    apiGet<any[]>('/operacion/oportunidades-abiertas', { id_programa }),
  registrarAsistencia: (body: {
    id_asignacion: number;
    id_sesion: number;
    estado_asistencia: 'ASISTIO' | 'INASISTENCIA' | 'RETIRO_BAJA';
    minutos_asistidos?: number;
  }) => apiPost<{ ok: boolean; mensaje: string }>('/operacion/asistencias', body),
  registrarResultado: (body: {
    id_oportunidad: number;
    puntaje_total: number;
    fecha_realizacion: string;
    motivo_correccion?: string;
  }) => apiPost<{ ok: boolean; version: number; en_ventana: boolean; mensaje: string }>('/operacion/resultados', body),
};
