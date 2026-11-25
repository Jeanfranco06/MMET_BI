'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpDown,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Filter,
  HeartPulse,
  Info,
  X,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { AiReportButton } from './AiReportButton';
import { KpiCard } from './KpiCard';
import { EChartBox } from './EChartBox';
import { SemaforoBadge } from './SemaforoBadge';
import { ChartSkeleton, EmptyState, KpiGridSkeleton, TableSkeleton } from './UiStates';
import {
  CHART_COLORS,
  EXECUTIVE_AXIS_LABEL,
  EXECUTIVE_SPLIT_LINE,
  barGradient,
  metaMarkLine,
} from '@/lib/chartTheme';

interface EvolucionReportProps {
  filtros: FiltrosResponse | null;
  corteInicial: string;
  semestre: string;
}

function formatFechaEs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function compactPrograma(codigo: string): string {
  const match = codigo.match(/(P-\d{2}|MIXTO)-(C\d{2})$/);
  if (match) return `${match[1]} · ${match[2]}`;
  return codigo;
}

export function EvolucionReport({ filtros, corteInicial, semestre }: EvolucionReportProps) {
  const [corte, setCorte] = useState(corteInicial);
  const [facultad, setFacultad] = useState('');
  const [idPractica, setIdPractica] = useState('');
  const [idPrograma, setIdPrograma] = useState('');
  const [grupoEtario, setGrupoEtario] = useState('');
  const [sexo, setSexo] = useState('');
  const [instrumento, setInstrumento] = useState<'' | 'PSS-10' | 'PCL-5'>('');
  const [categoriaEvento, setCategoriaEvento] = useState('');
  const [agruparPor, setAgruparPor] = useState<'programa' | 'facultad' | 'grupo_etario'>('programa');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sortBy, setSortBy] = useState<'reduccion' | 'pares' | 'none'>('none');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const captionId = useId();

  useEffect(() => {
    setPage(1);
  }, [semestre]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getEvolucion({
        corte,
        semestre: semestre || undefined,
        facultad: facultad || undefined,
        id_programa: idPrograma || undefined,
        id_practica: idPractica || undefined,
        grupo_etario: grupoEtario || undefined,
        sexo: sexo || undefined,
        instrumento: instrumento || undefined,
        categoria_evento: categoriaEvento || undefined,
        agrupar_por: agruparPor,
        page,
        pageSize,
      });
      setData(res);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el reporte de evolución psicológica.');
    } finally {
      setLoading(false);
    }
  }, [
    corte,
    semestre,
    facultad,
    idPrograma,
    idPractica,
    grupoEtario,
    sexo,
    instrumento,
    categoriaEvento,
    agruparPor,
    page,
    pageSize,
  ]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiarFiltros = () => {
    setFacultad('');
    setIdPractica('');
    setIdPrograma('');
    setGrupoEtario('');
    setSexo('');
    setInstrumento('');
    setCategoriaEvento('');
    setAgruparPor('programa');
    setPage(1);
  };

  const activeFilterCount = [
    facultad,
    idPractica,
    idPrograma,
    grupoEtario,
    sexo,
    instrumento,
    categoriaEvento,
    agruparPor !== 'programa' ? agruparPor : '',
  ].filter(Boolean).length;

  const programasFiltrados = (filtros?.programas || []).filter(
    (p) => !semestre || p.periodo_academico === semestre,
  );
  const pag = data?.paginacion;
  const totales: any[] = data?.totales_por_instrumento || [];
  const pssTotal = totales.find((t) => t.codigo_instrumento === 'PSS-10');
  const pclTotal = totales.find((t) => t.codigo_instrumento === 'PCL-5');

  const etiquetaDimension =
    agruparPor === 'facultad'
      ? 'Facultad / Área'
      : agruparPor === 'grupo_etario'
        ? 'Grupo etario'
        : 'Programa';

  const filasOrdenadas = useMemo(() => {
    const raw: any[] = data?.filas || [];
    if (sortBy === 'none') return raw;
    return [...raw].sort((a, b) => {
      const av = sortBy === 'pares' ? Number(a.pares_validos || 0) : Number(a.reduccion_promedio ?? -999);
      const bv = sortBy === 'pares' ? Number(b.pares_validos || 0) : Number(b.reduccion_promedio ?? -999);
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [data?.filas, sortBy, sortDir]);

  const toggleSort = (col: 'reduccion' | 'pares') => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  // Chart 1: Inicial vs Final por Instrumento (strictly separated scales)
  const chartPrePostOption = useMemo(() => {
    const validTotals = totales.filter((t) => !t.suprimido && t.promedio_inicial != null);
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      legend: {
        top: 0,
        right: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: '#475569', fontSize: 11 },
      },
      grid: { left: 14, right: 16, top: 34, bottom: 24, containLabel: true },
      xAxis: {
        type: 'category',
        data: validTotals.map((t) =>
          t.codigo_instrumento === 'PSS-10' ? 'PSS-10 (0–40)' : 'PCL-5 (0–80)',
        ),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisTick: { show: false },
        axisLabel: EXECUTIVE_AXIS_LABEL,
      },
      yAxis: {
        type: 'value',
        name: 'Puntaje promedio',
        nameTextStyle: { color: '#64748B', fontSize: 11 },
        axisLabel: EXECUTIVE_AXIS_LABEL,
        splitLine: EXECUTIVE_SPLIT_LINE,
      },
      series: [
        {
          name: 'Promedio Inicial',
          type: 'bar',
          barMaxWidth: 36,
          itemStyle: { borderRadius: [8, 8, 0, 0], color: barGradient('#94A3B8', '#64748B') },
          data: validTotals.map((t) => Number(t.promedio_inicial.toFixed(2))),
        },
        {
          name: 'Promedio Final',
          type: 'bar',
          barMaxWidth: 36,
          itemStyle: { borderRadius: [8, 8, 0, 0], color: barGradient('#14B8A6', '#0D9488') },
          data: validTotals.map((t) => Number(t.promedio_final.toFixed(2))),
        },
      ],
    };
  }, [totales]);

  // Chart 2: Dirección del cambio (Disminuyeron / Sin cambio / Aumentaron)
  const chartDireccionOption = useMemo(() => {
    const validTotals = totales.filter((t) => !t.suprimido && t.pares_validos >= 5);
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      legend: {
        top: 0,
        right: 0,
        icon: 'circle',
        itemWidth: 9,
        itemHeight: 9,
        textStyle: { color: '#475569', fontSize: 11 },
      },
      grid: { left: 14, right: 16, top: 34, bottom: 24, containLabel: true },
      xAxis: {
        type: 'category',
        data: validTotals.map((t) => t.codigo_instrumento),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisTick: { show: false },
        axisLabel: EXECUTIVE_AXIS_LABEL,
      },
      yAxis: {
        type: 'value',
        name: 'Pares válidos',
        nameTextStyle: { color: '#64748B', fontSize: 11 },
        axisLabel: EXECUTIVE_AXIS_LABEL,
        splitLine: EXECUTIVE_SPLIT_LINE,
      },
      series: [
        {
          name: 'Disminuyeron (mejora)',
          type: 'bar',
          stack: 'dir',
          barMaxWidth: 46,
          itemStyle: { color: CHART_COLORS.emerald },
          data: validTotals.map((t) => t.disminuyeron ?? 0),
        },
        {
          name: 'Sin cambio',
          type: 'bar',
          stack: 'dir',
          barMaxWidth: 46,
          itemStyle: { color: CHART_COLORS.slateLight },
          data: validTotals.map((t) => t.sin_cambio ?? 0),
        },
        {
          name: 'Aumentaron',
          type: 'bar',
          stack: 'dir',
          barMaxWidth: 46,
          itemStyle: { borderRadius: [6, 6, 0, 0], color: CHART_COLORS.rose },
          data: validTotals.map((t) => t.aumentaron ?? 0),
        },
      ],
    };
  }, [totales]);

  // Suppress unused warning for metaMarkLine (we use it in other reports; keep clean)
  void metaMarkLine;

  return (
    <div className="space-y-5">
      {/* Power BI Filter Bar & Report Header */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-card overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200/80">
                RG-01
              </span>
              <h2 className="font-display text-lg font-bold text-slate-900 tracking-tight">
                Evolución del Estrés Percibido (PSS-10) y Síntomas Postraumáticos (PCL-5)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Pares válidos en ventana · Semestre <strong className="text-slate-700">{semestre || 'Todos'}</strong> · Corte{' '}
              <strong className="text-slate-700">{formatFechaEs(corte)}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Filter className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>Filtros</span>
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-teal-600 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
              {filtersOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              )}
            </button>

            <AiReportButton
              reporte="RG-01"
              corte={data?.corte || corte}
              disabled={loading || !data}
              filtros={{ semestre, facultad, idPractica, idPrograma, instrumento, agruparPor }}
              kpis={
                data
                  ? Object.fromEntries(
                      totales.map((t) => [
                        t.codigo_instrumento,
                        {
                          pares_validos: t.pares_validos,
                          promedio_inicial: t.promedio_inicial,
                          promedio_final: t.promedio_final,
                          reduccion_promedio: t.reduccion_promedio,
                          semaforo: t.semaforo,
                        },
                      ]),
                    )
                  : null
              }
              grupos={(data?.filas || []).map((r: any) => ({
                nombre: `${r.codigo_instrumento} · ${r.dim_clave}`,
                n: Number(r.pares_validos || 0),
                instrumento: r.codigo_instrumento,
                valor: r.reduccion_promedio,
                semaforo: r.semaforo,
              }))}
            />
          </div>
        </div>

        {filtersOpen && (
          <div className="px-5 pb-5 pt-3 border-t border-slate-100 bg-slate-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Fecha de corte</span>
                <div className="relative">
                  <Calendar
                    className="w-3.5 h-3.5 text-teal-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="date"
                    value={corte}
                    onChange={(e) => {
                      setCorte(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Instrumento</span>
                <select
                  value={instrumento}
                  onChange={(e) => {
                    setInstrumento(e.target.value as '' | 'PSS-10' | 'PCL-5');
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value="">Ambos (separados)</option>
                  <option value="PSS-10">PSS-10 · Estrés percibido (0–40)</option>
                  <option value="PCL-5">PCL-5 · Síntomas postraumáticos (0–80)</option>
                </select>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Agrupar filas por</span>
                <select
                  value={agruparPor}
                  onChange={(e) => {
                    setAgruparPor(e.target.value as 'programa' | 'facultad' | 'grupo_etario');
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value="programa">Instrumento → Programa</option>
                  <option value="facultad">Instrumento → Facultad / Área</option>
                  <option value="grupo_etario">Instrumento → Grupo etario</option>
                </select>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Práctica principal</span>
                <select
                  value={idPractica}
                  onChange={(e) => {
                    setIdPractica(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value="">Todas las prácticas</option>
                  {filtros?.practicas.map((p) => (
                    <option key={p.id_practica} value={p.id_practica}>
                      {p.codigo_practica} · {p.nombre_practica}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Programa</span>
                <select
                  value={idPrograma}
                  onChange={(e) => {
                    setIdPrograma(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value="">Todos los programas</option>
                  {programasFiltrados.map((p) => (
                    <option key={p.id_programa} value={p.id_programa}>
                      {p.codigo_programa}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Facultad / Área</span>
                <select
                  value={facultad}
                  onChange={(e) => {
                    setFacultad(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value="">Todas las facultades</option>
                  {filtros?.facultades.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Grupo etario / Sexo</span>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label="Grupo etario"
                    value={grupoEtario}
                    onChange={(e) => {
                      setGrupoEtario(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800"
                  >
                    <option value="">Edad</option>
                    {(filtros?.gruposEtarios || ['18-20', '21-23', '24-26', '27+']).map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Sexo"
                    value={sexo}
                    onChange={(e) => {
                      setSexo(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800"
                  >
                    <option value="">Sexo</option>
                    {(filtros?.sexos || ['F', 'M', 'NO_ESPECIFICADO']).map((s) => (
                      <option key={s} value={s}>
                        {s === 'F' ? 'Fem (F)' : s === 'M' ? 'Masc (M)' : 'N/E'}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Evento índice (PCL-5)</span>
                <select
                  value={categoriaEvento}
                  onChange={(e) => {
                    setCategoriaEvento(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value="">Todos los eventos</option>
                  {(filtros?.categoriasEvento || []).map((c) => (
                    <option key={c.codigo_categoria} value={c.codigo_categoria}>
                      {c.codigo_categoria} · {c.nombre_categoria}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-slate-500 font-medium">Activos:</span>
                  {instrumento && (
                    <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-semibold">
                      {instrumento}
                    </span>
                  )}
                  {facultad && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 font-semibold">
                      {facultad}
                    </span>
                  )}
                  {grupoEtario && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 font-semibold">
                      {grupoEtario} años
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {error}
        </div>
      )}

      {/* Top Executive KPI Cards */}
      {loading && !data ? (
        <KpiGridSkeleton count={4} />
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            code="KPI-01 · PSS-10"
            title="Reducción promedio estrés percibido"
            value={
              pssTotal?.suprimido
                ? 'Suprimido'
                : pssTotal?.reduccion_promedio != null
                  ? `${pssTotal.reduccion_promedio > 0 ? '+' : ''}${pssTotal.reduccion_promedio.toFixed(2)}`
                  : '—'
            }
            unit={pssTotal && !pssTotal.suprimido ? 'pts' : undefined}
            semaforo={pssTotal?.semaforo || 'SIN_DATOS'}
            metaLabel="Meta: ≥ 4.0 pts"
            subtitle={`n = ${pssTotal?.pares_validos ?? 0} pares válidos`}
            progressPct={
              pssTotal?.reduccion_promedio != null ? (pssTotal.reduccion_promedio / 6) * 100 : null
            }
            accent="teal"
            Icon={Activity}
          />

          <KpiCard
            code="PSS-10 · Pre/Post"
            title="Puntaje inicial vs. final (0–40)"
            value={
              pssTotal?.suprimido
                ? 'n < 5'
                : pssTotal?.promedio_inicial != null
                  ? `${pssTotal.promedio_inicial.toFixed(1)} → ${pssTotal.promedio_final.toFixed(1)}`
                  : '—'
            }
            subtitle={
              pssTotal && !pssTotal.suprimido
                ? `${pssTotal.disminuyeron ?? 0} mejoraron · ${pssTotal.aumentaron ?? 0} subieron`
                : 'Escala independiente'
            }
            accent="teal"
          />

          <KpiCard
            code="KPI-02 · PCL-5"
            title="Reducción síntomas postraumáticos"
            value={
              pclTotal?.suprimido
                ? 'Suprimido'
                : pclTotal?.reduccion_promedio != null
                  ? `${pclTotal.reduccion_promedio > 0 ? '+' : ''}${pclTotal.reduccion_promedio.toFixed(2)}`
                  : '—'
            }
            unit={pclTotal && !pclTotal.suprimido ? 'pts' : undefined}
            semaforo={pclTotal?.semaforo || 'SIN_DATOS'}
            metaLabel="Meta: ≥ 10.0 pts"
            subtitle={`n = ${pclTotal?.pares_validos ?? 0} pares válidos`}
            progressPct={
              pclTotal?.reduccion_promedio != null ? (pclTotal.reduccion_promedio / 14) * 100 : null
            }
            accent="sky"
            Icon={HeartPulse}
          />

          <KpiCard
            code="PCL-5 · Pre/Post"
            title="Puntaje inicial vs. final (0–80)"
            value={
              pclTotal?.suprimido
                ? 'n < 5'
                : pclTotal?.promedio_inicial != null
                  ? `${pclTotal.promedio_inicial.toFixed(1)} → ${pclTotal.promedio_final.toFixed(1)}`
                  : '—'
            }
            subtitle={
              pclTotal && !pclTotal.suprimido
                ? `${pclTotal.disminuyeron ?? 0} mejoraron · ${pclTotal.aumentaron ?? 0} subieron`
                : 'Mismo evento índice'
            }
            accent="sky"
          />
        </section>
      )}

      {/* 2 Interactive ECharts in Responsive Grid */}
      {loading && !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartSkeleton height={280} />
          <ChartSkeleton height={280} />
        </div>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="mb-3">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Comparativo Promedio Inicial vs. Final por Instrumento
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                PSS-10 (0–40) y PCL-5 (0–80) se presentan estrictamente separados
              </p>
            </div>
            {totales.some((t) => !t.suprimido && t.promedio_inicial != null) ? (
              <EChartBox
                option={chartPrePostOption}
                height={270}
                ariaLabel="Gráfico comparativo de puntaje promedio inicial y final por instrumento"
              />
            ) : (
              <EmptyState title="Sin promedios visibles" description="No hay grupos con n ≥ 5 pares válidos en este filtro." icon="filter" />
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="mb-3">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Dirección del Cambio en Pares Válidos
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribución de estudiantes que disminuyeron, mantuvieron o aumentaron puntaje
              </p>
            </div>
            {totales.some((t) => !t.suprimido && t.pares_validos >= 5) ? (
              <EChartBox
                option={chartDireccionOption}
                height={270}
                ariaLabel="Gráfico apilado de dirección del cambio en pares válidos"
              />
            ) : (
              <EmptyState title="Sin distribución disponible" description="Aumenta el rango de filtros para obtener al menos 5 pares válidos." icon="filter" />
            )}
          </div>
        </section>
      )}

      {/* Detailed Sortable Table */}
      {loading && !data ? (
        <TableSkeleton rows={6} cols={9} />
      ) : (
        <section className="space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="w-1.5 h-5 rounded-full bg-teal-500 shrink-0" aria-hidden="true" />
                <h3 id={captionId} className="font-display text-sm font-bold text-slate-900 tracking-tight">
                  Evolución pareada por Instrumento y {etiquetaDimension}
                </h3>
              </div>
              {pag && (
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  Mostrando <strong className="text-slate-800">{filasOrdenadas.length}</strong> de{' '}
                  <strong className="text-slate-800">{pag.totalRegistros.toLocaleString()}</strong> grupos
                </span>
              )}
            </div>

            {!filasOrdenadas.length ? (
              <EmptyState
                title="No se encontraron pares válidos"
                description="Ajusta el semestre, programa o fecha de corte para consultar pares iniciales y finales completados en ventana."
                actionLabel={activeFilterCount > 0 ? 'Limpiar filtros' : undefined}
                onAction={activeFilterCount > 0 ? limpiarFiltros : undefined}
                icon="filter"
              />
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby={captionId}
                className="table-wrapper table-wrapper--paged !border-0 !rounded-none"
              >
                <table className="mwg-table">
                  <caption className="sr-only">
                    Evolución pareada de PSS-10 y PCL-5 agrupada por {etiquetaDimension} al corte {formatFechaEs(corte)}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Instrumento</th>
                      <th scope="col">{etiquetaDimension}</th>
                      <th scope="col">
                        <button
                          type="button"
                          onClick={() => toggleSort('pares')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 uppercase tracking-wider"
                        >
                          Pares (n)
                          <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </th>
                      <th scope="col">Inicial</th>
                      <th scope="col">Final</th>
                      <th scope="col">
                        <button
                          type="button"
                          onClick={() => toggleSort('reduccion')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 uppercase tracking-wider"
                        >
                          Reducción
                          <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </th>
                      <th scope="col">Mejora / = / Sube</th>
                      <th scope="col">Semáforo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasOrdenadas.map((r: any) => (
                      <tr key={`${r.codigo_instrumento}-${r.dim_clave}`}>
                        <th scope="row">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${
                              r.codigo_instrumento === 'PSS-10'
                                ? 'bg-teal-50 text-teal-800 border-teal-200'
                                : 'bg-sky-50 text-sky-800 border-sky-200'
                            }`}
                          >
                            {r.codigo_instrumento}
                          </span>
                          {r.version_instrumento && (
                            <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                              {r.version_instrumento}
                            </div>
                          )}
                        </th>
                        <td data-label={etiquetaDimension}>
                          <div className="font-semibold text-slate-900">
                            {agruparPor === 'programa' ? compactPrograma(r.dim_clave) : r.dim_clave}
                          </div>
                          {agruparPor === 'programa' && (r.dim_subtitulo || r.estado_programa) && (
                            <div
                              className="text-[11px] text-slate-500 truncate max-w-[220px]"
                              title={r.dim_subtitulo}
                            >
                              {r.dim_subtitulo}
                              {r.estado_programa ? ` · ${r.estado_programa}` : ''}
                            </div>
                          )}
                        </td>
                        <td data-label="Pares (n)" className="tabular-nums font-semibold text-slate-700">
                          {r.pares_validos}
                        </td>
                        <td data-label="Inicial" className="tabular-nums text-slate-600">
                          {r.suprimido ? 'Suprimido' : r.promedio_inicial != null ? r.promedio_inicial.toFixed(2) : '—'}
                        </td>
                        <td data-label="Final" className="tabular-nums text-slate-600">
                          {r.suprimido ? 'Suprimido' : r.promedio_final != null ? r.promedio_final.toFixed(2) : '—'}
                        </td>
                        <td data-label="Reducción" className="tabular-nums font-bold">
                          {r.suprimido ? (
                            <span className="text-slate-400 font-normal">n &lt; 5</span>
                          ) : r.reduccion_promedio != null ? (
                            <span className={r.reduccion_promedio >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                              {r.reduccion_promedio > 0 ? '+' : ''}
                              {r.reduccion_promedio.toFixed(2)} pts
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td data-label="Mejora / = / Sube" className="tabular-nums text-xs">
                          {r.suprimido ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              <span className="text-emerald-700 font-bold">{r.disminuyeron ?? 0}</span>
                              <span className="text-slate-300">/</span>
                              <span className="text-slate-500">{r.sin_cambio ?? 0}</span>
                              <span className="text-slate-300">/</span>
                              <span className="text-rose-600 font-semibold">{r.aumentaron ?? 0}</span>
                            </span>
                          )}
                        </td>
                        <td data-label="Semáforo">
                          <SemaforoBadge estado={r.suprimido ? 'SUPRIMIDO' : r.semaforo || 'SIN_DATOS'} size="xs" />
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {totales.length > 0 && (
                    <tfoot>
                      {totales.map((t: any) => (
                        <tr key={`tot-${t.codigo_instrumento}`} className="text-xs font-semibold">
                          <th scope="row" className="whitespace-nowrap">
                            <div className="font-bold text-slate-900">TOTAL {t.codigo_instrumento}</div>
                            <div className="text-[11px] font-normal text-slate-500">
                              {t.codigo_instrumento === 'PSS-10' ? 'Escala 0–40' : 'Escala 0–80'}
                            </div>
                          </th>
                          <td className="text-slate-400">—</td>
                          <td data-label="Pares (n)" className="tabular-nums font-bold text-slate-900">
                            {t.pares_validos.toLocaleString()}
                          </td>
                          <td data-label="Inicial" className="tabular-nums font-bold">
                            {t.suprimido ? 'Suprimido' : t.promedio_inicial != null ? t.promedio_inicial.toFixed(2) : '—'}
                          </td>
                          <td data-label="Final" className="tabular-nums font-bold">
                            {t.suprimido ? 'Suprimido' : t.promedio_final != null ? t.promedio_final.toFixed(2) : '—'}
                          </td>
                          <td data-label="Reducción" className="tabular-nums font-bold text-teal-800">
                            {t.suprimido
                              ? 'n < 5'
                              : t.reduccion_promedio != null
                                ? `${t.reduccion_promedio > 0 ? '+' : ''}${t.reduccion_promedio.toFixed(2)} pts`
                                : '—'}
                          </td>
                          <td data-label="Mejora / = / Sube" className="tabular-nums">
                            {t.suprimido
                              ? '—'
                              : `${t.disminuyeron ?? 0} / ${t.sin_cambio ?? 0} / ${t.aumentaron ?? 0}`}
                          </td>
                          <td data-label="Semáforo">
                            <SemaforoBadge estado={t.suprimido ? 'SUPRIMIDO' : t.semaforo || 'SIN_DATOS'} size="xs" />
                          </td>
                        </tr>
                      ))}
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {pag && pag.totalPaginas > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3 rounded-2xl border border-slate-200/80 shadow-card">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>Filas por página:</span>
                <select
                  aria-label="Filas por página"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs bg-white font-semibold"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  Anterior
                </button>
                <span className="text-xs font-semibold text-slate-700 px-2 tabular-nums">
                  {pag.page} / {pag.totalPaginas}
                </span>
                <button
                  type="button"
                  disabled={page >= pag.totalPaginas}
                  onClick={() => setPage((p) => Math.min(pag.totalPaginas, p + 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  Siguiente
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Compact methodological rules footer */}
      <details className="rounded-2xl border border-slate-200/80 bg-white px-5 py-3 text-xs text-slate-600 shadow-card">
        <summary className="cursor-pointer font-semibold text-slate-700 inline-flex items-center gap-2 select-none">
          <Info className="w-4 h-4 text-teal-600" aria-hidden="true" />
          Reglas metodológicas y privacidad estadística de RG-01
        </summary>
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 leading-relaxed">
          <div>
            <strong className="text-slate-900 block mb-0.5">Diferencia pareada (pts)</strong>
            <code>PuntajeInicial − PuntajeFinal</code>. Valores positivos indican disminución de síntomas. PSS-10 y PCL-5 nunca se combinan.
          </div>
          <div>
            <strong className="text-slate-900 block mb-0.5">Par válido en ventana</strong>
            Exige evaluación inicial y final vigentes, válidas, dentro de ventana (<code>en_ventana = 1</code>) y mismo evento índice en PCL-5.
          </div>
          <div>
            <strong className="text-slate-900 block mb-0.5">Supresión por privacidad</strong>
            Todo grupo con menos de 5 pares válidos (<code>n &lt; 5</code>) se suprime automáticamente.
          </div>
        </div>
      </details>
    </div>
  );
}
