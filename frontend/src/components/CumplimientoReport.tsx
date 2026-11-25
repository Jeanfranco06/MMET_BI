'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Filter,
  Info,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { AiReportButton } from './AiReportButton';
import { KpiCard } from './KpiCard';
import { EChartBox } from './EChartBox';
import { ChartSkeleton, EmptyState, KpiGridSkeleton, TableSkeleton } from './UiStates';
import {
  CHART_COLORS,
  EXECUTIVE_AXIS_LABEL,
  EXECUTIVE_SPLIT_LINE,
  barGradient,
  metaMarkLine,
} from '@/lib/chartTheme';

interface CumplimientoReportProps {
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

function EstadoEvaluacionBadge({ estado }: { estado: string }) {
  switch (estado) {
    case 'COMPLETADA_EN_VENTANA':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          En ventana
        </span>
      );
    case 'COMPLETADA_TARDIA':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Tardía
        </span>
      );
    case 'VENCIDA':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Vencida
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Pendiente
        </span>
      );
  }
}

export function CumplimientoReport({ filtros, corteInicial, semestre }: CumplimientoReportProps) {
  const [corte, setCorte] = useState(corteInicial);
  const [idPrograma, setIdPrograma] = useState('');
  const [facultad, setFacultad] = useState('');
  const [instrumento, setInstrumento] = useState<'' | 'PSS-10' | 'PCL-5'>('');
  const [categoriaEvento, setCategoriaEvento] = useState('');
  const [estado, setEstado] = useState('');
  const [buscarInput, setBuscarInput] = useState('');
  const [buscar, setBuscar] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(true);

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const captionId = useId();

  useEffect(() => {
    const t = setTimeout(() => {
      setBuscar(buscarInput.trim());
      setPage(1);
    }, 260);
    return () => clearTimeout(t);
  }, [buscarInput]);

  useEffect(() => {
    setPage(1);
  }, [semestre]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCumplimiento({
        corte,
        semestre: semestre || undefined,
        id_programa: idPrograma || undefined,
        facultad: facultad || undefined,
        instrumento: instrumento || undefined,
        categoria_evento: categoriaEvento || undefined,
        estado: estado || undefined,
        buscar: buscar || undefined,
        page,
        pageSize,
      });
      setData(res);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el control de evaluaciones psicológicas.');
    } finally {
      setLoading(false);
    }
  }, [corte, semestre, idPrograma, facultad, instrumento, categoriaEvento, estado, buscar, page, pageSize]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiarFiltros = () => {
    setIdPrograma('');
    setFacultad('');
    setInstrumento('');
    setCategoriaEvento('');
    setEstado('');
    setBuscarInput('');
    setBuscar('');
    setPage(1);
  };

  const activeFilterCount = [idPrograma, facultad, instrumento, categoriaEvento, estado, buscar].filter(Boolean).length;
  const rt = data?.resumen_total;
  const pag = data?.paginacion;

  const programasFiltrados = (filtros?.programas || []).filter(
    (p) => !semestre || p.periodo_academico === semestre,
  );

  // Chart 1: Compliance Rate vs 90% Target Bar
  const chartTasaOption = useMemo(() => {
    if (!rt) return null;
    const total = Math.max(1, Number(rt.elegibles || 0));
    const pctVentana = Number((((rt.completadas_en_ventana || 0) / total) * 100).toFixed(1));
    const pctTotal = rt.tasa_cumplimiento != null ? Number(Number(rt.tasa_cumplimiento).toFixed(1)) : 0;
    const pctVencidas = Number((((rt.vencidas || 0) / total) * 100).toFixed(1));

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: '{b}: <strong>{c}%</strong>',
      },
      grid: { left: 16, right: 20, top: 28, bottom: 26, containLabel: true },
      xAxis: {
        type: 'category',
        data: ['Cumplimiento Total', 'En Ventana', 'Vencidas'],
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisTick: { show: false },
        axisLabel: EXECUTIVE_AXIS_LABEL,
      },
      yAxis: {
        type: 'value',
        max: 100,
        name: 'Porcentaje (%)',
        nameTextStyle: { color: '#64748B', fontSize: 11 },
        axisLabel: { ...EXECUTIVE_AXIS_LABEL, formatter: '{value}%' },
        splitLine: EXECUTIVE_SPLIT_LINE,
      },
      series: [
        {
          name: 'Porcentaje',
          type: 'bar',
          barMaxWidth: 48,
          data: [
            {
              value: pctTotal,
              itemStyle: {
                borderRadius: [8, 8, 0, 0],
                color: pctTotal >= 90 ? barGradient('#14B8A6', '#0D9488') : barGradient('#6366F1', '#4F46E5'),
              },
            },
            {
              value: pctVentana,
              itemStyle: { borderRadius: [8, 8, 0, 0], color: barGradient('#10B981', '#059669') },
            },
            {
              value: pctVencidas,
              itemStyle: { borderRadius: [8, 8, 0, 0], color: barGradient('#F43F5E', '#E11D48') },
            },
          ],
          markLine: metaMarkLine(90, 'Meta ≥ 90%', '#4F46E5'),
        },
      ],
    };
  }, [rt]);

  // Chart 2: Donut of Evaluation States
  const chartEstadosOption = useMemo(() => {
    if (!rt) return null;
    const pieData = [
      { value: rt.completadas_en_ventana ?? 0, name: 'En ventana', itemStyle: { color: CHART_COLORS.emerald } },
      { value: rt.completadas_tardias ?? 0, name: 'Tardía', itemStyle: { color: CHART_COLORS.amber } },
      { value: rt.pendientes_en_ventana ?? 0, name: 'Pendiente', itemStyle: { color: CHART_COLORS.sky } },
      { value: rt.vencidas ?? 0, name: 'Vencida', itemStyle: { color: CHART_COLORS.rose } },
    ].filter((d) => d.value > 0);

    return {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: <strong>{c}</strong> oportunidades ({d}%)',
      },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 9,
        itemHeight: 9,
        textStyle: { color: '#475569', fontSize: 11 },
      },
      series: [
        {
          name: 'Estado evaluación',
          type: 'pie',
          radius: ['50%', '75%'],
          center: ['50%', '43%'],
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          data: pieData,
        },
      ],
    };
  }, [rt]);

  return (
    <div className="space-y-5">
      {/* Header & Collapsible Filter Bar */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-card overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                RO-02
              </span>
              <h2 className="font-display text-lg font-bold text-slate-900 tracking-tight">
                Control de Evaluaciones Psicológicas Pendientes y Completadas (KPI-04)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Semestre <strong className="text-slate-700">{semestre || 'Todos'}</strong> · Corte{' '}
              <strong className="text-slate-700">{formatFechaEs(corte)}</strong> · Regla D01 activa
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Filter className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>Filtros</span>
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-teal-600 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
              {filtersOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            <AiReportButton
              reporte="RO-02"
              corte={data?.corte || corte}
              disabled={loading || !rt}
              filtros={{ semestre, idPrograma, facultad, instrumento, categoriaEvento, estado }}
              kpis={
                rt
                  ? {
                      elegibles: rt.elegibles,
                      completadas_en_ventana: rt.completadas_en_ventana,
                      completadas_tardias: rt.completadas_tardias,
                      pendientes_en_ventana: rt.pendientes_en_ventana,
                      vencidas: rt.vencidas,
                      tasa_cumplimiento_pct: rt.tasa_cumplimiento,
                      semaforo: rt.semaforo,
                    }
                  : null
              }
            />
          </div>
        </div>

        {filtersOpen && (
          <div className="px-5 pb-5 pt-3 border-t border-slate-100 bg-slate-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Fecha de corte</span>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-teal-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={corte}
                    onChange={(e) => {
                      setCorte(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs font-medium text-slate-800"
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
                >
                  <option value="">Todos (PSS-10 y PCL-5)</option>
                  <option value="PSS-10">PSS-10</option>
                  <option value="PCL-5">PCL-5</option>
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
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
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Estado de evaluación</span>
                <select
                  value={estado}
                  onChange={(e) => {
                    setEstado(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
                >
                  <option value="">Todos los estados</option>
                  <option value="COMPLETADA_EN_VENTANA">Completada en ventana</option>
                  <option value="COMPLETADA_TARDIA">Completada tardía</option>
                  <option value="PENDIENTE_EN_VENTANA">Pendiente en ventana</option>
                  <option value="VENCIDA">Vencida</option>
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
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
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Evento índice (PCL-5)</span>
                <select
                  value={categoriaEvento}
                  onChange={(e) => {
                    setCategoriaEvento(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
                >
                  <option value="">Todos los eventos</option>
                  {(filtros?.categoriasEvento || []).map((c) => (
                    <option key={c.codigo_categoria} value={c.codigo_categoria}>
                      {c.codigo_categoria} · {c.nombre_categoria}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block sm:col-span-2">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Buscar estudiante (código)</span>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={buscarInput}
                    onChange={(e) => setBuscarInput(e.target.value)}
                    placeholder="Ej. UNT26-EST-0015"
                    className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              </label>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex justify-end pt-2 border-t border-slate-200/70">
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

      {/* Top KPI Cards */}
      {loading && !data ? (
        <KpiGridSkeleton count={4} />
      ) : rt ? (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            code="KPI-04"
            title="Tasa de cumplimiento (Elegibles)"
            value={rt.tasa_cumplimiento != null ? `${Number(rt.tasa_cumplimiento).toFixed(1)}` : '—'}
            unit={rt.tasa_cumplimiento != null ? '%' : undefined}
            semaforo={rt.semaforo || 'SIN_DATOS'}
            metaLabel="Meta: ≥ 90%"
            subtitle={`n = ${rt.elegibles?.toLocaleString() ?? 0} elegibles`}
            progressPct={rt.tasa_cumplimiento ?? null}
            accent="indigo"
            Icon={ClipboardCheck}
          />
          <KpiCard
            code="EN VENTANA"
            title="Completadas dentro de plazo"
            value={(rt.completadas_en_ventana ?? 0).toLocaleString()}
            subtitle={`${rt.en_par_valido?.toLocaleString() ?? 0} habilitan par válido`}
            accent="emerald"
            Icon={CheckCircle2}
          />
          <KpiCard
            code="TARDÍAS"
            title="Completadas fuera de ventana"
            value={(rt.completadas_tardias ?? 0).toLocaleString()}
            subtitle="Cuentan en KPI-04; excluidas de pares"
            accent="amber"
            Icon={AlertTriangle}
          />
          <KpiCard
            code="PENDIENTES / VENCIDAS"
            title="Oportunidades sin completar"
            value={((rt.vencidas ?? 0) + (rt.pendientes_en_ventana ?? 0)).toLocaleString()}
            subtitle={`${rt.vencidas ?? 0} vencidas · ${rt.pendientes_en_ventana ?? 0} pendientes`}
            accent="rose"
            Icon={Clock}
          />
        </section>
      ) : null}

      {/* 2 Interactive ECharts */}
      {loading && !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7"><ChartSkeleton height={270} /></div>
          <div className="lg:col-span-5"><ChartSkeleton height={270} /></div>
        </div>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="mb-3">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Cumplimiento Operativo vs. Meta (90%)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparativo de cumplimiento total, en ventana y proporción vencida al corte
              </p>
            </div>
            {chartTasaOption ? (
              <EChartBox
                option={chartTasaOption}
                height={265}
                ariaLabel="Gráfico de barras de cumplimiento operativo contra meta de 90%"
              />
            ) : (
              <EmptyState title="Sin métricas de cumplimiento" icon="inbox" />
            )}
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="mb-3">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Distribución por Estado de Evaluación
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Oportunidades elegibles clasificadas al corte {formatFechaEs(corte)}
              </p>
            </div>
            {chartEstadosOption ? (
              <EChartBox
                option={chartEstadosOption}
                height={265}
                ariaLabel="Gráfico circular de estados de evaluación"
              />
            ) : (
              <EmptyState title="Sin oportunidades registradas" icon="inbox" />
            )}
          </div>
        </section>
      )}

      {/* Detailed Paginated Table */}
      {loading && !data ? (
        <TableSkeleton rows={6} cols={9} />
      ) : (
        <section className="space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="w-1.5 h-5 rounded-full bg-indigo-500 shrink-0" aria-hidden="true" />
                <h3 id={captionId} className="font-display text-sm font-bold text-slate-900 tracking-tight">
                  Matriz de control operacional por oportunidad de evaluación
                </h3>
              </div>
              {pag && (
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  Mostrando <strong className="text-slate-800">{data?.oportunidades?.length || 0}</strong> de{' '}
                  <strong className="text-slate-800">{pag.totalRegistros.toLocaleString()}</strong> oportunidades
                </span>
              )}
            </div>

            {!data?.oportunidades?.length ? (
              <EmptyState
                title="No se encontraron oportunidades"
                description="Ajusta el filtro de instrumento, estado o código de estudiante."
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
                    Control de evaluaciones psicológicas pendientes y completadas al corte {formatFechaEs(corte)}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Instrumento</th>
                      <th scope="col">Estudiante</th>
                      <th scope="col">Programa</th>
                      <th scope="col">Momento</th>
                      <th scope="col">Ventana prevista</th>
                      <th scope="col">Realización</th>
                      <th scope="col">Puntaje / Ver.</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Par válido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.oportunidades.map((r: any) => (
                      <tr key={r.id_oportunidad}>
                        <th scope="row">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold border ${
                              r.codigo_instrumento === 'PSS-10'
                                ? 'bg-teal-50 text-teal-800 border-teal-200'
                                : 'bg-sky-50 text-sky-800 border-sky-200'
                            }`}
                          >
                            {r.codigo_instrumento}
                          </span>
                          <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                            {r.codigo_evento_local
                              ? `${r.codigo_evento_local}${r.categoria_evento ? ` · ${r.categoria_evento}` : ''}`
                              : 'No aplica'}
                          </div>
                        </th>
                        <td data-label="Estudiante">
                          <div className="font-bold text-slate-900">{r.codigo_anonimizado}</div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[160px]" title={r.facultad_o_area}>
                            {r.facultad_o_area}
                          </div>
                        </td>
                        <td data-label="Programa" title={r.codigo_programa}>
                          <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200/80">
                            {compactPrograma(r.codigo_programa)}
                          </span>
                        </td>
                        <td data-label="Momento" className="text-xs font-bold text-slate-700">
                          {r.momento}
                        </td>
                        <td data-label="Ventana prevista" className="tabular-nums text-xs text-slate-600 whitespace-nowrap">
                          {formatFechaEs(r.fecha_ventana_inicio)} – {formatFechaEs(r.fecha_ventana_fin)}
                        </td>
                        <td data-label="Realización" className="tabular-nums text-xs text-slate-700">
                          {formatFechaEs(r.fecha_realizacion)}
                        </td>
                        <td data-label="Puntaje / Ver." className="tabular-nums text-slate-700">
                          {r.puntaje_total != null ? (
                            <div>
                              <span className="font-bold text-slate-900">{r.puntaje_total} pts</span>
                              <span className="text-[11px] text-slate-400 ml-1">v{r.numero_version ?? 1}</span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td data-label="Estado">
                          <EstadoEvaluacionBadge estado={r.estado_evaluacion} />
                        </td>
                        <td data-label="Par válido">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${
                              r.par_valido
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {r.par_valido ? 'Sí' : 'No'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
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

      <details className="rounded-2xl border border-slate-200/80 bg-white px-5 py-3 text-xs text-slate-600 shadow-card">
        <summary className="cursor-pointer font-semibold text-slate-700 inline-flex items-center gap-2 select-none">
          <Info className="w-4 h-4 text-teal-600" aria-hidden="true" />
          Reglas de elegibilidad y cumplimiento D01 (RO-02 / KPI-04)
        </summary>
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 leading-relaxed">
          <div>
            <strong className="text-slate-900 block mb-0.5">Elegibilidad al corte (D01)</strong>
            Una oportunidad es elegible cuando <code>fecha_ventana_fin &lt;= @corte</code> (excluyendo futuras y no aplicables).
          </div>
          <div>
            <strong className="text-slate-900 block mb-0.5">Tardías vs. Pares válidos</strong>
            Las evaluaciones tardías suman al cumplimiento (<code>KPI-04</code>), pero nunca conforman pares válidos en <code>RG-01</code>/<code>RG-02</code>.
          </div>
          <div>
            <strong className="text-slate-900 block mb-0.5">Versionado auditado</strong>
            Cada corrección genera una nueva versión (<code>v2+</code>) manteniendo trazabilidad completa.
          </div>
        </div>
      </details>
    </div>
  );
}
