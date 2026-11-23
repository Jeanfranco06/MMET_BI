'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Calendar,
  ClipboardCheck,
  Database,
  HeartPulse,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api, type FiltrosResponse, type ResumenResponse } from '@/lib/api';
import { EChartBox } from './EChartBox';
import { SemaforoBadge } from './SemaforoBadge';
import { ResponsiveTable, type TableColumn } from './ResponsiveTable';
import { OperacionView } from './OperacionView';
import { ContinuidadReport } from './ContinuidadReport';

type SeccionId = 'resumen' | 'impacto' | 'continuidad' | 'cumplimiento' | 'operacion';

const NAV_ITEMS: Array<{ id: SeccionId; label: string; subtitle: string; Icon: typeof LayoutDashboard }> = [
  { id: 'resumen', label: 'Resumen Ejecutivo', subtitle: 'Panel de los 4 KPIs', Icon: LayoutDashboard },
  { id: 'impacto', label: 'Impacto por Práctica', subtitle: 'Evolución PSS-10 y PCL-5', Icon: BarChart3 },
  { id: 'continuidad', label: 'Continuidad y Abandono', subtitle: 'Seguimiento por estudiante', Icon: Users },
  { id: 'cumplimiento', label: 'Control de Evaluaciones', subtitle: 'Cumplimiento y ventanas', Icon: ClipboardCheck },
  { id: 'operacion', label: 'Operación OLTP', subtitle: 'Captura en vivo SQL Server', Icon: Database },
];

export function DashboardApp() {
  const [seccion, setSeccion] = useState<SeccionId>('resumen');
  const [semestre, setSemestre] = useState<string>('2026-II');
  const [corte, setCorte] = useState<string>('2026-11-23');
  const [idPractica, setIdPractica] = useState<string>('');
  const [idPrograma, setIdPrograma] = useState<string>('');
  const [facultad, setFacultad] = useState<string>('');
  const [instrumentoImpacto, setInstrumentoImpacto] = useState<'PSS-10' | 'PCL-5'>('PSS-10');

  const [filtros, setFiltros] = useState<FiltrosResponse | null>(null);
  const [resumen, setResumen] = useState<ResumenResponse | null>(null);
  const [impacto, setImpacto] = useState<any | null>(null);
  const [continuidad, setContinuidad] = useState<any | null>(null);
  const [cumplimiento, setCumplimiento] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const tabPssId = useId();
  const tabPclId = useId();

  useEffect(() => {
    api
      .getFiltros()
      .then(setFiltros)
      .catch((e) => setError(`No se pudo conectar al backend NestJS: ${e.message}`));
  }, []);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, imp, cont, cump] = await Promise.all([
        api.getResumen({
          corte,
          id_programa: idPrograma || undefined,
          id_practica: idPractica || undefined,
          facultad: facultad || undefined,
        }),
        api.getImpactoPracticas({
          instrumento: instrumentoImpacto,
          corte,
          facultad: facultad || undefined,
        }),
        api.getContinuidad({
          corte,
          id_programa: idPrograma || undefined,
          id_practica: idPractica || undefined,
        }),
        api.getCumplimiento({
          corte,
          id_programa: idPrograma || undefined,
        }),
      ]);
      setResumen(res);
      setImpacto(imp);
      setContinuidad(cont);
      setCumplimiento(cump);
    } catch (e: any) {
      setError(e.message || 'Error consultando indicadores en SQL Server.');
    } finally {
      setLoading(false);
    }
  }, [corte, idPrograma, idPractica, facultad, instrumentoImpacto]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Gráficos ECharts
  const optResumenContinuidad = useMemo(() => {
    if (!resumen) return {};
    const c = resumen.kpi03_continuidad;
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { fontSize: 12 } },
      color: ['#0f766e', '#d97706', '#e11d48', '#64748b'],
      series: [
        {
          name: 'Continuidad',
          type: 'pie',
          radius: ['48%', '74%'],
          avoidLabelOverlap: true,
          label: { show: false },
          data: [
            { value: c.activos ?? 0, name: 'Activos' },
            { value: c.en_riesgo ?? 0, name: 'En riesgo' },
            { value: c.abandono ?? 0, name: 'Abandono' },
            { value: c.retirados ?? 0, name: 'Retirados' },
          ],
        },
      ],
    };
  }, [resumen]);

  const optResumenCumplimiento = useMemo(() => {
    if (!resumen) return {};
    const k = resumen.kpi04_cumplimiento;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 16, right: 20, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'value' },
      yAxis: {
        type: 'category',
        data: ['Vencidas', 'Pendientes', 'Tardías (KPI-04)', 'En ventana'],
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 26,
          data: [
            { value: k.vencidas ?? 0, itemStyle: { color: '#e11d48' } },
            { value: k.pendientes_en_ventana ?? 0, itemStyle: { color: '#0284c7' } },
            { value: k.completadas_tardias ?? 0, itemStyle: { color: '#d97706' } },
            { value: k.completadas_en_ventana ?? 0, itemStyle: { color: '#0f766e' } },
          ],
          label: { show: true, position: 'right', fontWeight: 600 },
        },
      ],
    };
  }, [resumen]);

  const optImpactoPracticas = useMemo(() => {
    if (!impacto?.por_practica) return {};
    const rows = impacto.por_practica.filter((r: any) => !r.suprimido);
    const meta = instrumentoImpacto === 'PSS-10' ? 4 : 10;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0 },
      grid: { left: 16, right: 24, top: 42, bottom: 28, containLabel: true },
      xAxis: {
        type: 'category',
        data: rows.map((r: any) => `${r.codigo_practica}\n(n=${r.pares_validos})`),
      },
      yAxis: [
        { type: 'value', name: 'Puntaje promedio' },
        { type: 'value', name: 'Reducción (Δ pts)' },
      ],
      series: [
        {
          name: 'Promedio Inicial',
          type: 'bar',
          itemStyle: { color: '#94a3b8' },
          data: rows.map((r: any) => r.promedio_inicial),
        },
        {
          name: 'Promedio Final',
          type: 'bar',
          itemStyle: { color: '#0f766e' },
          data: rows.map((r: any) => r.promedio_final),
        },
        {
          name: 'Reducción (Δ pts)',
          type: 'line',
          yAxisIndex: 1,
          symbolSize: 9,
          lineStyle: { width: 3, color: '#0284c7' },
          itemStyle: { color: '#0284c7' },
          data: rows.map((r: any) => r.reduccion_promedio),
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed', color: '#15803d' },
            label: { formatter: `Meta ≥ ${meta} pts`, position: 'insideEndTop' },
            data: [{ yAxis: meta }],
          },
        },
      ],
    };
  }, [impacto, instrumentoImpacto]);

  const optContinuidadProgramas = useMemo(() => {
    if (!continuidad?.por_programa) return {};
    const rows = continuidad.por_programa;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0 },
      grid: { left: 16, right: 20, top: 38, bottom: 24, containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: rows.map((r: any) => r.codigo_programa) },
      series: [
        { name: 'Activos', type: 'bar', stack: 't', itemStyle: { color: '#0f766e' }, data: rows.map((r: any) => r.activos) },
        { name: 'En riesgo', type: 'bar', stack: 't', itemStyle: { color: '#d97706' }, data: rows.map((r: any) => r.en_riesgo) },
        { name: 'Abandono', type: 'bar', stack: 't', itemStyle: { color: '#e11d48' }, data: rows.map((r: any) => r.abandono) },
        { name: 'Retirados', type: 'bar', stack: 't', itemStyle: { color: '#64748b' }, data: rows.map((r: any) => r.retirados) },
      ],
    };
  }, [continuidad]);

  // Columnas de tablas
  const colsImpactoPractica: TableColumn<any>[] = [
    {
      key: 'prac',
      header: 'Práctica Principal',
      isRowHeader: true,
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900">{r.codigo_practica}</span>{' '}
          <span className="text-slate-600 font-normal">· {r.nombre_practica}</span>
        </div>
      ),
    },
    { key: 'pares', header: 'Pares válidos (n)', render: (r) => r.pares_validos },
    { key: 'ini', header: 'Prom. Inicial', render: (r) => (r.suprimido ? 'Suprimido' : r.promedio_inicial ?? '—') },
    { key: 'fin', header: 'Prom. Final', render: (r) => (r.suprimido ? 'Suprimido' : r.promedio_final ?? '—') },
    {
      key: 'red',
      header: 'Reducción (Δ)',
      render: (r) =>
        r.suprimido ? (
          'Suprimido'
        ) : (
          <strong className="text-teal-800">
            {r.reduccion_promedio != null ? `${r.reduccion_promedio > 0 ? '+' : ''}${r.reduccion_promedio} pts` : '—'}
          </strong>
        ),
    },
    {
      key: 'dist',
      header: 'Disminuyó / Igual / Aumentó',
      render: (r) => (r.suprimido ? 'n < 5' : `${r.disminuyeron} / ${r.sin_cambio} / ${r.aumentaron}`),
    },
    { key: 'sem', header: 'Semáforo', render: (r) => <SemaforoBadge estado={r.semaforo} /> },
  ];

  const colsContinuidadProg: TableColumn<any>[] = [
    { key: 'prog', header: 'Programa', isRowHeader: true, render: (r) => r.codigo_programa },
    { key: 'prac', header: 'Práctica', render: (r) => r.codigo_practica },
    { key: 'eval', header: 'Evaluables (n)', render: (r) => r.evaluables },
    { key: 'act', header: 'Activos', render: (r) => r.activos },
    { key: 'rie', header: 'En riesgo', render: (r) => r.en_riesgo },
    { key: 'aba', header: 'Abandono', render: (r) => r.abandono },
    { key: 'ret', header: 'Retirados', render: (r) => r.retirados },
    {
      key: 'tasa',
      header: 'Continuidad (%)',
      render: (r) => (r.tasa_continuidad != null ? <strong>{r.tasa_continuidad}%</strong> : 'Suprimido'),
    },
    { key: 'sem', header: 'Semáforo', render: (r) => <SemaforoBadge estado={r.semaforo} /> },
  ];

  const colsCasosRiesgo: TableColumn<any>[] = [
    { key: 'cod', header: 'Código Anonimizado', isRowHeader: true, render: (r) => r.codigo_anonimizado },
    { key: 'fac', header: 'Facultad', render: (r) => r.facultad_o_area },
    { key: 'prog', header: 'Programa', render: (r) => `${r.codigo_programa} (${r.codigo_practica})` },
    {
      key: 'est',
      header: 'Estado al Corte',
      render: (r) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            r.estado_continuidad === 'EN_RIESGO'
              ? 'bg-amber-50 text-amber-900'
              : r.estado_continuidad === 'ABANDONO'
                ? 'bg-rose-50 text-rose-800'
                : 'bg-slate-100 text-slate-700'
          }`}
        >
          {r.estado_continuidad}
        </span>
      ),
    },
    { key: 'asis', header: 'Asistencias / Evaluadas', render: (r) => `${r.asistencias_total} / ${r.sesiones_eval}` },
    { key: 'ret', header: 'Fecha retiro', render: (r) => r.fecha_retiro || '—' },
  ];

  const colsCumplimientoProg: TableColumn<any>[] = [
    { key: 'prog', header: 'Programa', isRowHeader: true, render: (r) => r.codigo_programa },
    { key: 'inst', header: 'Instrumento', render: (r) => r.codigo_instrumento },
    { key: 'eleg', header: 'Elegibles (n)', render: (r) => r.elegibles },
    { key: 'env', header: 'En ventana', render: (r) => r.completadas_en_ventana },
    { key: 'tard', header: 'Tardías (KPI-04)', render: (r) => r.completadas_tardias },
    { key: 'venc', header: 'Vencidas', render: (r) => r.vencidas },
    { key: 'corr', header: 'Correcciones v2+', render: (r) => r.correcciones_versionadas },
    {
      key: 'tasa',
      header: 'Cumplimiento (%)',
      render: (r) => (r.tasa_cumplimiento != null ? <strong>{r.tasa_cumplimiento}%</strong> : 'Suprimido'),
    },
    { key: 'sem', header: 'Semáforo', render: (r) => <SemaforoBadge estado={r.semaforo} /> },
  ];

  const colsPendientesEval: TableColumn<any>[] = [
    { key: 'est', header: 'Estudiante', isRowHeader: true, render: (r) => r.codigo_anonimizado },
    { key: 'fac', header: 'Facultad', render: (r) => r.facultad_o_area },
    { key: 'prog', header: 'Programa', render: (r) => r.codigo_programa },
    { key: 'inst', header: 'Instrumento', render: (r) => `${r.codigo_instrumento} (${r.momento})` },
    { key: 'vfin', header: 'Límite ventana', render: (r) => r.fecha_ventana_fin },
    {
      key: 'estado',
      header: 'Estado',
      render: (r) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            r.estado_oportunidad === 'VENCIDA' ? 'bg-rose-50 text-rose-800' : 'bg-sky-50 text-sky-800'
          }`}
        >
          {r.estado_oportunidad === 'VENCIDA' ? 'Vencida' : 'Pendiente en ventana'}
        </span>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Navegación lateral semántica (<nav>, NO ARIA tabs para navegación de página) */}
      <aside className="lg:w-72 bg-slate-900 text-slate-100 shrink-0 flex flex-col">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center">
              <HeartPulse className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">MMET · Bienestar BI</h1>
              <p className="text-xs text-slate-400">Trujillo · Semestre 2026-II</p>
            </div>
          </div>
        </div>

        <nav aria-label="Navegación principal" className="p-3 space-y-1 flex-1">
          {NAV_ITEMS.map(({ id, label, subtitle, Icon }) => {
            const active = seccion === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setSeccion(id)}
                className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  active
                    ? 'bg-teal-700/90 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-sm font-semibold leading-tight">{label}</div>
                  <div className={`text-xs ${active ? 'text-teal-100' : 'text-slate-400'}`}>{subtitle}</div>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-1.5">
          <div className="flex items-center gap-1.5 text-teal-300 font-medium">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>Ética y Privacidad Activas</span>
          </div>
          <p>Identificadores anonimizados · Supresión automática si n &lt; 5 · Sin diagnóstico clínico ni causalidad.</p>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Barra superior de filtros globales (fecha de corte C + práctica + programa + facultad) */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {NAV_ITEMS.find((n) => n.id === seccion)?.label}
              </h2>
              <p className="text-xs text-slate-500">
                Conectado en vivo a SQL Server <code className="bg-slate-100 px-1.5 py-0.5 rounded">MMET_BI_OLTP</code>
                {resumen?.totales && (
                  <>
                    {' · '}
                    {resumen.totales.total_estudiantes.toLocaleString()} estudiantes ·{' '}
                    {resumen.totales.total_asistencias.toLocaleString()} asistencias
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Filtro global de Semestre siempre visible en el header */}
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <span>Semestre:</span>
                <select
                  aria-label="Seleccionar semestre académico"
                  value={semestre}
                  onChange={(e) => setSemestre(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-semibold text-slate-800"
                >
                  {(filtros?.semestres?.length ? filtros.semestres : ['2026-II']).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value="">Todos</option>
                </select>
              </label>

              {seccion !== 'operacion' && seccion !== 'continuidad' && (
                <>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                    <Calendar className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                    <span>Corte C:</span>
                    <input
                      type="date"
                      value={corte}
                      onChange={(e) => setCorte(e.target.value)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-medium"
                    />
                  </label>

                  <select
                    aria-label="Filtrar por práctica"
                    value={idPractica}
                    onChange={(e) => setIdPractica(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                  >
                    <option value="">Todas las prácticas</option>
                    {filtros?.practicas.map((p) => (
                      <option key={p.id_practica} value={p.id_practica}>
                        {p.codigo_practica} · {p.nombre_practica}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filtrar por facultad"
                    value={facultad}
                    onChange={(e) => setFacultad(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                  >
                    <option value="">Todas las facultades</option>
                    {filtros?.facultades.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filtrar por programa"
                    value={idPrograma}
                    onChange={(e) => setIdPrograma(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white max-w-[200px]"
                  >
                    <option value="">Todos los programas</option>
                    {filtros?.programas.map((p) => (
                      <option key={p.id_programa} value={p.id_programa}>
                        {p.codigo_programa}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
        </header>

        <main id="main-content" className="p-6 space-y-6 flex-1">
          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <strong>Error de conexión:</strong> {error}
            </div>
          )}

          {loading && !resumen && (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Cargando indicadores desde SQL Server...
            </div>
          )}

          {/* ==============================================================
              VISTA 1: RESUMEN EJECUTIVO (4 KPIs OFICIALES)
              ============================================================== */}
          {seccion === 'resumen' && resumen && (
            <>
              <section aria-label="Indicadores clave de gestión" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* KPI-01 */}
                <article className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">KPI-01 · PSS-10</span>
                      <h3 className="text-sm font-semibold text-slate-800 mt-0.5">Reducción Estrés Percibido</h3>
                    </div>
                    <SemaforoBadge estado={resumen.kpi01_pss10.semaforo} />
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-slate-900">
                      {resumen.kpi01_pss10.reduccion_promedio != null
                        ? `+${resumen.kpi01_pss10.reduccion_promedio} pts`
                        : resumen.kpi01_pss10.suprimido
                          ? 'Suprimido'
                          : 'Sin datos'}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Inicial {resumen.kpi01_pss10.promedio_inicial ?? '—'} → Final{' '}
                      {resumen.kpi01_pss10.promedio_final ?? '—'} ({resumen.kpi01_pss10.reduccion_pct ?? '—'}%)
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <span>Pares válidos: <strong>{resumen.kpi01_pss10.pares_validos}</strong></span>
                    <span>Meta: {resumen.kpi01_pss10.meta_operativa}</span>
                  </div>
                </article>

                {/* KPI-02 */}
                <article className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-sky-700">KPI-02 · PCL-5</span>
                      <h3 className="text-sm font-semibold text-slate-800 mt-0.5">Reducción Síntomas Trauma</h3>
                    </div>
                    <SemaforoBadge estado={resumen.kpi02_pcl5.semaforo} />
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-slate-900">
                      {resumen.kpi02_pcl5.reduccion_promedio != null
                        ? `+${resumen.kpi02_pcl5.reduccion_promedio} pts`
                        : resumen.kpi02_pcl5.suprimido
                          ? 'Suprimido'
                          : 'Sin datos'}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Inicial {resumen.kpi02_pcl5.promedio_inicial ?? '—'} → Final{' '}
                      {resumen.kpi02_pcl5.promedio_final ?? '—'} (mismo evento índice)
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <span>Pares válidos: <strong>{resumen.kpi02_pcl5.pares_validos}</strong></span>
                    <span>Meta: {resumen.kpi02_pcl5.meta_operativa}</span>
                  </div>
                </article>

                {/* KPI-03 */}
                <article className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">KPI-03 · RO-03</span>
                      <h3 className="text-sm font-semibold text-slate-800 mt-0.5">Tasa de Continuidad</h3>
                    </div>
                    <SemaforoBadge estado={resumen.kpi03_continuidad.semaforo} />
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-slate-900">
                      {resumen.kpi03_continuidad.tasa_continuidad != null
                        ? `${resumen.kpi03_continuidad.tasa_continuidad}%`
                        : resumen.kpi03_continuidad.suprimido
                          ? 'Suprimido'
                          : 'Sin datos'}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Continúan {resumen.kpi03_continuidad.continuan ?? '—'} de {resumen.kpi03_continuidad.evaluables}{' '}
                      evaluables (≥ 3 sesiones)
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <span>En riesgo: <strong>{resumen.kpi03_continuidad.en_riesgo ?? '—'}</strong></span>
                    <span>Meta: {resumen.kpi03_continuidad.meta_operativa}</span>
                  </div>
                </article>

                {/* KPI-04 */}
                <article className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-violet-700">KPI-04 · RO-04</span>
                      <h3 className="text-sm font-semibold text-slate-800 mt-0.5">Cumplimiento Evaluaciones</h3>
                    </div>
                    <SemaforoBadge estado={resumen.kpi04_cumplimiento.semaforo} />
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-slate-900">
                      {resumen.kpi04_cumplimiento.tasa_cumplimiento != null
                        ? `${resumen.kpi04_cumplimiento.tasa_cumplimiento}%`
                        : resumen.kpi04_cumplimiento.suprimido
                          ? 'Suprimido'
                          : 'Sin datos'}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {resumen.kpi04_cumplimiento.completadas ?? '—'} de {resumen.kpi04_cumplimiento.elegibles}{' '}
                      elegibles (incl. {resumen.kpi04_cumplimiento.completadas_tardias ?? 0} tardías)
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <span>Vencidas: <strong>{resumen.kpi04_cumplimiento.vencidas ?? '—'}</strong></span>
                    <span>Meta: {resumen.kpi04_cumplimiento.meta_operativa}</span>
                  </div>
                </article>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-base font-semibold text-slate-900">Distribución de Continuidad Estudiantil (KPI-03)</h3>
                  <p className="text-xs text-slate-500 mb-2">
                    Solo estudiantes evaluables al corte {corte}. El retiro prevalece sobre asistencia previa.
                  </p>
                  <EChartBox
                    option={optResumenContinuidad}
                    height={280}
                    ariaLabel="Gráfico circular de continuidad estudiantil: activos, en riesgo, abandono y retirados"
                  />
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-base font-semibold text-slate-900">Estado de Evaluaciones Elegibles (KPI-04)</h3>
                  <p className="text-xs text-slate-500 mb-2">
                    Las completadas tardías cuentan para cumplimiento (KPI-04) pero no forman par para KPI-01/KPI-02.
                  </p>
                  <EChartBox
                    option={optResumenCumplimiento}
                    height={280}
                    ariaLabel="Gráfico de barras de estado de evaluaciones elegibles: en ventana, tardías, pendientes y vencidas"
                  />
                </div>
              </section>
            </>
          )}

          {/* ==============================================================
              VISTA 2: IMPACTO POR PRÁCTICA (UNIFICA RG-01 + RG-03 SIN REDUNDANCIA)
              ============================================================== */}
          {seccion === 'impacto' && impacto && (
            <section className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Comparativo de Evolución e Impacto por Práctica (P-01 a P-04 y Mixto)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Consolida RG-01 y RG-03 en una sola vista coherente. PSS-10 (0–40) y PCL-5 (0–80) nunca se suman entre sí.
                    </p>
                  </div>

                  {/* True WAI-ARIA Tablist para alternar instrumento en página (modern-web-guidance: tabs) */}
                  <div role="tablist" aria-label="Selector de instrumento psicológico" className="mwg-tablist">
                    <button
                      type="button"
                      role="tab"
                      id={tabPssId}
                      aria-selected={instrumentoImpacto === 'PSS-10'}
                      onClick={() => setInstrumentoImpacto('PSS-10')}
                    >
                      PSS-10 · Estrés Percibido (KPI-01)
                    </button>
                    <button
                      type="button"
                      role="tab"
                      id={tabPclId}
                      aria-selected={instrumentoImpacto === 'PCL-5'}
                      onClick={() => setInstrumentoImpacto('PCL-5')}
                    >
                      PCL-5 · Síntomas Postraumáticos (KPI-02)
                    </button>
                  </div>
                </div>

                <div
                  role="tabpanel"
                  aria-labelledby={instrumentoImpacto === 'PSS-10' ? tabPssId : tabPclId}
                >
                  <EChartBox
                    option={optImpactoPracticas}
                    height={340}
                    ariaLabel={`Comparativo inicial, final y reducción promedio en ${instrumentoImpacto} por práctica principal`}
                  />
                </div>
              </div>

              <ResponsiveTable
                caption={`Resumen de impacto por práctica principal — ${instrumentoImpacto} (corte ${corte})`}
                columns={colsImpactoPractica}
                rows={impacto.por_practica}
                rowKey={(r) => r.id_practica}
              />
            </section>
          )}

          {/* ==============================================================
              VISTA 3: SEGUIMIENTO DE CONTINUIDAD Y ABANDONO POR ESTUDIANTE
              ============================================================== */}
          {seccion === 'continuidad' && (
            <ContinuidadReport filtros={filtros} corteInicial={corte} semestre={semestre} />
          )}

          {/* ==============================================================
              VISTA 4: CONTROL DE EVALUACIONES (RO-04)
              ============================================================== */}
          {seccion === 'cumplimiento' && cumplimiento && (
            <section className="space-y-6">
              <ResponsiveTable
                caption={`Control de cumplimiento KPI-04 por programa e instrumento (corte ${corte})`}
                columns={colsCumplimientoProg}
                rows={cumplimiento.por_programa}
                rowKey={(r) => `${r.id_programa}-${r.codigo_instrumento}`}
              />

              <ResponsiveTable
                caption="Evaluaciones pendientes y vencidas para seguimiento del psicólogo de bienestar"
                columns={colsPendientesEval}
                rows={cumplimiento.pendientes_seguimiento}
                rowKey={(r) => r.id_oportunidad}
              />
            </section>
          )}

          {/* ==============================================================
              VISTA 5: OPERACIÓN TRANSACCIONAL OLTP
              ============================================================== */}
          {seccion === 'operacion' && (
            <OperacionView filtros={filtros} onDataMutated={cargarDatos} />
          )}
        </main>
      </div>
    </div>
  );
}
