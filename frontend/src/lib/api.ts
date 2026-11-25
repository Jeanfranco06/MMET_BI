const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function csrfHeader(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const item = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('mmet_csrf='));
  return item ? { 'X-CSRF-Token': decodeURIComponent(item.slice('mmet_csrf='.length)) } : {};
}

async function apiGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString(), { cache: 'no-store', credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Error ${res.status}`);
  }
  return res.json();
}

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeader() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || `Error ${res.status}`);
  }
  return data as T;
}

async function apiPut<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', ...csrfHeader() }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || `Error ${res.status}`);
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
  categoriasEvento?: Array<{
    id_categoria_evento?: number;
    codigo_categoria: string;
    nombre_categoria: string;
  }>;
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

export interface ImpactoPracticaRow {
  id_practica?: number;
  id_programa?: number;
  codigo_programa?: string;
  nombre_programa?: string;
  codigo_practica: string;
  nombre_practica: string;
  tipo_practica?: string;
  es_mixto?: boolean;
  estado_programa?: string;
  pares_validos: number;
  suprimido: boolean;
  promedio_inicial: number | null;
  promedio_final: number | null;
  reduccion_promedio: number | null;
  disminuyeron: number | null;
  sin_cambio: number | null;
  aumentaron: number | null;
  meta_operativa_pts: number;
  cumple_meta: boolean | null;
  semaforo: SemaforoEstado;
}

export interface ImpactoPracticasResponse {
  instrumento: 'PSS-10' | 'PCL-5';
  corte: string;
  facultad: string;
  meta_operativa_pts: number;
  kpi05_meta_practicas: {
    practicas_evaluables: number;
    practicas_cumplen_meta: number;
    tasa_cumplimiento_meta: number | null;
    meta_operativa: string;
    semaforo: SemaforoEstado;
  };
  por_practica: ImpactoPracticaRow[];
  por_programa: ImpactoPracticaRow[];
}

export const api = {
  login: (body: { username: string; password: string }) => apiPost<{ user: any }>('/auth/login', body),
  logout: () => apiPost<{ ok: boolean }>('/auth/logout', {}),
  me: () => apiGet<{ id_usuario: number; id_estudiante: number | null; nombre_usuario: string; rol: string }>('/auth/me'),
  getStudentsReadyForAccount: () => apiGet<Array<{ id_estudiante: number; codigo_anonimizado: string; evaluaciones_disponibles: number }>>('/auth/students-ready-for-account'),
  createStudentUser: (body: { username: string; password: string; studentId: number }) =>
    apiPost<{ ok: boolean }>('/auth/users', { ...body, role: 'ESTUDIANTE' }),
  getMyEvaluations: () => apiGet<any[]>('/estudiante/evaluaciones'),
  getMyEvaluation: (id: number) => apiGet<any>(`/estudiante/evaluaciones/${id}`),
  saveMyEvaluationDraft: (id: number, respuestas: Array<{ numero_item: number; valor: number }>) => apiPut<any>(`/estudiante/evaluaciones/${id}/borrador`, { respuestas }),
  submitMyEvaluation: (id: number, respuestas: Array<{ numero_item: number; valor: number }>, fecha_realizacion: string) => apiPost<any>(`/estudiante/evaluaciones/${id}/enviar`, { respuestas, fecha_realizacion }),
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
    categoria_evento?: string;
    agrupar_por?: 'programa' | 'facultad' | 'grupo_etario';
    page?: number;
    pageSize?: number;
  }) => apiGet<any>('/analytics/evolucion', params),
  getImpactoPracticas: (params: {
    instrumento: 'PSS-10' | 'PCL-5';
    corte: string;
    semestre?: string;
    facultad?: string;
  }) => apiGet<ImpactoPracticasResponse>('/analytics/impacto-practicas', params),
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
    facultad?: string;
    instrumento?: string;
    categoria_evento?: string;
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
  crearSesion: (body: {
    id_programa: number;
    numero_sesion: number;
    id_practica_tecnica: number;
    modalidad: 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA';
    duracion_programada_min: number;
    fecha_sesion: string;
    hora_inicio?: string;
    estado_sesion?: 'PROGRAMADA' | 'REALIZADA';
  }) => apiPost<{ ok: boolean; mensaje: string; sesion: any }>('/operacion/sesiones', body),
  corregirEvaluacion: (
    idOportunidad: number,
    body: {
      respuestas: Array<{ numero_item: number; valor: number }>;
      fecha_realizacion: string;
      motivo_correccion: string;
    },
  ) => apiPost<any>(`/evaluacion/admin/${idOportunidad}/corregir`, body),
  ejecutarEtl: (fecha_corte?: string) =>
    apiPost<{
      ok: boolean;
      ejecucion: {
        id_ejecucion_etl: number;
        fecha_corte: string;
        inicio_ejecucion: string;
        fin_ejecucion: string;
        estado: string;
        filas_continuidad: number;
        filas_cumplimiento: number;
        filas_resultados: number;
        incidencias_detectadas: number;
        mensaje: string;
      } | null;
      incidencias: any[];
    }>('/operacion/etl/ejecutar', fecha_corte ? { fecha_corte } : {}),
  interpretarEvaluacion: (body: {
    instrumento: 'PSS-10' | 'PCL-5';
    puntaje_total: number;
    momento: 'INICIAL' | 'FINAL';
    puntaje_inicial_previo?: number;
    codigo_practica?: string;
    nombre_practica?: string;
  }) =>
    apiPost<{
      instrumento: 'PSS-10' | 'PCL-5';
      momento: 'INICIAL' | 'FINAL';
      puntaje_total: number;
      escala_maxima: number;
      variacion_vs_inicial: number | null;
      resumen_preliminar: string;
      observaciones_clave: string[];
      sugerencias_seguimiento: string[];
      disclaimer: string;
      modelo: string;
      fuente: 'llm_externo' | 'fallback_reglas';
    }>('/ai/interpretar-evaluacion', body),
  interpretarReporte: (body: {
    reporte: 'RO-01' | 'RO-02' | 'RG-01' | 'RG-02';
    corte: string;
    filtros?: Record<string, any>;
    kpis: Record<string, any>;
    grupos?: Array<{
      nombre: string;
      n: number;
      instrumento?: 'PSS-10' | 'PCL-5';
      valor?: number | null;
      semaforo?: string;
    }>;
  }) =>
    apiPost<{
      reporte: 'RO-01' | 'RO-02' | 'RG-01' | 'RG-02';
      corte: string;
      hechos_observados: string[];
      lectura_semaforos: string[];
      recomendaciones_gestion: string[];
      nota_metodologica: string;
      modelo: string;
      fuente: 'llm_externo' | 'fallback_reglas';
    }>('/ai/interpretar-reporte', body),
};
