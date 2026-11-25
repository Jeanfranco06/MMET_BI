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
  Filter,
  Info,
  LogOut,
  Search,
  UserCheck,
  Users,
  UserX,
  X,
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

interface ContinuidadReportProps {
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

function EstadoContinuidadBadge({ estado }: { estado: string }) {
  switch (estado) {
    case 'ACTIVO':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Activo
        </span>
      );
    case 'EN_RIESGO':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          En riesgo
        </span>
      );
    case 'ABANDONO':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
          <UserX className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Abandono
        </span>
      );
    case 'RETIRADO':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
          <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Retirado
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
          No evaluable
        </span>
      );
  }
}

export function ContinuidadReport({ filtros, corteInicial, semestre }: ContinuidadReportProps) {
  const [corte, setCorte] = useState(corteInicial);
  const [idPrograma, setIdPrograma] = useState('');
  const [idPractica, setIdPractica] = useState('');
  const [facultad, setFacultad] = useState('');
  const [ciclo, setCiclo] = useState('');
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
      const res = await api.getContinuidad({
        corte,
        semestre: semestre || undefined,
        id_programa: idPrograma || undefined,
        id_practica: idPractica || undefined,
        facultad: facultad || undefined,
        ciclo: ciclo || undefined,
        estado: estado || undefined,
        buscar: buscar || undefined,
        page,
        pageSize,
      });
      setData(res);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el reporte de continuidad.');
    } finally {
      setLoading(false);
    }
  }, [corte, semestre, idPrograma, idPractica, facultad, ciclo, estado, buscar, page, pageSize]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiarFiltros = () => {
    setIdPrograma('');
    setIdPractica('');
    setFacultad('');
    setCiclo('');
    setEstado('');
    setBuscarInput('');
    setBuscar('');
    setPage(1);
  };

  const activeFilterCount = [idPrograma, idPractica, facultad, ciclo, estado, buscar].filter(Boolean).length;
  const rt = data?.resumen_total;
  const pag = data?.paginacion;

  const programasFiltrados = (filtros?.programas || []).filter(
    (p) => !semestre || p.periodo_academico === semestre,
  );

  // Chart 1: Continuity rate by program vs 80% target
  const chartProgramaOption = useMemo(() => {
    const items = (data?.por_programa || [])
      .filter((p: any) => p.tasa_continuidad != null && Number(p.evaluables || 0) >= 5)
      .slice(0, 12);
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const p = params[0];
          const r = items[p.dataIndex];
          return `<div style="font-weight:700;margin-bottom:4px">${r.codigo_programa}</div>
            <div>Tasa de continuidad: <strong style="color:#5EEAD4">${Number(r.tasa_continuidad).toFixed(1)}%</strong></div>
            <div style="color:#94A3B8;font-size:11px">Evaluables: n = ${r.evaluables} · Meta: ≥ 80%</div>`;
        },
      },
      grid: { left: 16, right: 20, top: 28, bottom: 26, containLabel: true },
      xAxis: {
        type: 'category',
        data: items.map((r: any) => compactPrograma(r.codigo_programa)),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisTick: { show: false },
        axisLabel: { ...EXECUTIVE_AXIS_LABEL, rotate: items.length > 6 ? 25 : 0 },
      },
      yAxis: {
        type: 'value',
        max: 100,
        name: 'Continuidad (%)',
        nameTextStyle: { color: '#64748B', fontSize: 11 },
        axisLabel: { ...EXECUTIVE_AXIS_LABEL, formatter: '{value}%' },
        splitLine: EXECUTIVE_SPLIT_LINE,
      },
      series: [
        {
          name: 'Continuidad',
          type: 'bar',
          barMaxWidth: 34,
          data: items.map((r: any) => ({
            value: Number(Number(r.tasa_continuidad).toFixed(1)),
            itemStyle: {
              borderRadius: [8, 8, 0, 0],
              color:
                r.tasa_continuidad >= 80
                  ? barGradient('#10B981', '#059669')
                  : r.tasa_continuidad >= 60
                    ? barGradient('#F59E0B', '#D97706')
                    : barGradient('#F43F5E', '#E11D48'),
            },
          })),
          markLine: metaMarkLine(80, 'Meta ≥ 80%', '#059669'),
        },
      ],
    };
  }, [data?.por_programa]);

  // Chart 2: Donut of Continuity States
  const chartEstadosOption = useMemo(() => {
    if (!rt) return null;
    const pieData = [
      { value: rt.activos ?? 0, name: 'Activo', itemStyle: { color: CHART_COLORS.emerald } },
      { value: rt.en_riesgo ?? 0, name: 'En riesgo', itemStyle: { color: CHART_COLORS.amber } },
      { value: rt.abandono ?? 0, name: 'Abandono', itemStyle: { color: CHART_COLORS.rose } },
      { value: rt.retirados ?? 0, name: 'Retirado', itemStyle: { color: CHART_COLORS.slate } },
      { value: rt.no_evaluables ?? 0, name: 'No evaluable', itemStyle: { color: CHART_COLORS.sky } },
    ].filter((d) => d.value > 0);

    return {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: <strong>{c}</strong> estudiantes ({d}%)',
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
          name: 'Estado',
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
      {/* Header & Filter Bar */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-card overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                RO-01
              </span>
              <h2 className="font-display text-lg font-bold text-slate-900 tracking-tight">
                Seguimiento de Continuidad y Abandono por Estudiante (KPI-03)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Semestre <strong className="text-slate-700">{semestre || 'Todos'}</strong> · Corte{' '}
              <strong className="text-slate-700">{formatFechaEs(corte)}</strong> · Regla D02 activa
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
              reporte="RO-01"
              corte={data?.corte || corte}
              disabled={loading || !rt}
              filtros={{ semestre, idPrograma, idPractica, facultad, ciclo, estado }}
              kpis={
                rt
                  ? {
                      evaluables: rt.evaluables,
                      continuan: rt.continuan,
                      activos: rt.activos,
                      en_riesgo: rt.en_riesgo,
                      abandono: rt.abandono,
                      retirados: rt.retirados,
                      no_evaluables: rt.no_evaluables,
                      tasa_continuidad_pct: rt.tasa_continuidad,
                      semaforo: rt.semaforo,
                    }
                  : null
              }
              grupos={(data?.por_programa || []).map((p: any) => ({
                nombre: p.codigo_programa,
                n: Number(p.evaluables || 0),
                valor: p.tasa_continuidad,
                semaforo: p.semaforo,
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
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Práctica principal</span>
                <select
                  value={idPractica}
                  onChange={(e) => {
                    setIdPractica(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
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
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Estado de continuidad</span>
                <select
                  value={estado}
                  onChange={(e) => {
                    setEstado(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
                >
                  <option value="">Todos los estados</option>
                  <option value="ACTIVO">Activo</option>
                  <option value="EN_RIESGO">En riesgo</option>
                  <option value="ABANDONO">Abandono</option>
                  <option value="RETIRADO">Retirado</option>
                  <option value="NO_EVALUABLE">No evaluable (&lt; 3 sesiones)</option>
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
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Ciclo académico</span>
                <select
                  value={ciclo}
                  onChange={(e) => {
                    setCiclo(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
                >
                  <option value="">Todos los ciclos</option>
                  {(filtros?.ciclos || []).map((c) => (
                    <option key={c} value={c}>
                      Ciclo {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block sm:col-span-2">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Buscar estudiante (código anonimizado)</span>
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
            code="KPI-03"
            title="Tasa de continuidad (Evaluables)"
            value={rt.tasa_continuidad != null ? `${Number(rt.tasa_continuidad).toFixed(1)}` : '—'}
            unit={rt.tasa_continuidad != null ? '%' : undefined}
            semaforo={rt.semaforo || 'SIN_DATOS'}
            metaLabel="Meta: ≥ 80%"
            subtitle={`${rt.continuan?.toLocaleString() ?? 0} de ${rt.evaluables?.toLocaleString() ?? 0} evaluables`}
            progressPct={rt.tasa_continuidad ?? null}
            accent="emerald"
            Icon={Users}
          />
          <KpiCard
            code="ACTIVOS"
            title="Estudiantes activos al corte"
            value={(rt.activos ?? 0).toLocaleString()}
            subtitle={`Asistencia global: ${rt.asistencia_pct != null ? `${rt.asistencia_pct.toFixed(1)}%` : '—'}`}
            accent="teal"
            Icon={UserCheck}
          />
          <KpiCard
            code="ALERTA TEMPRANA"
            title="En riesgo de deserción"
            value={(rt.en_riesgo ?? 0).toLocaleString()}
            subtitle="Faltaron a su última sesión exigible"
            accent="amber"
            Icon={AlertTriangle}
          />
          <KpiCard
            code="BAJAS / ABANDONO"
            title="Abandono y retiros formales"
            value={((rt.abandono ?? 0) + (rt.retirados ?? 0)).toLocaleString()}
            subtitle={`${rt.abandono ?? 0} abandonos · ${rt.retirados ?? 0} retirados`}
            accent="rose"
            Icon={UserX}
          />
        </section>
      ) : null}

      {/* 2 Interactive ECharts */}
      {loading && !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7"><ChartSkeleton height={275} /></div>
          <div className="lg:col-span-5"><ChartSkeleton height={275} /></div>
        </div>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="mb-3">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Tasa de Continuidad por Programa vs. Meta (80%)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Programas con n ≥ 5 estudiantes evaluables al corte {formatFechaEs(corte)}
              </p>
            </div>
            {(data?.por_programa || []).some((p: any) => p.tasa_continuidad != null && p.evaluables >= 5) ? (
              <EChartBox
                option={chartProgramaOption}
                height={270}
                ariaLabel="Gráfico de barras de tasa de continuidad por programa"
              />
            ) : (
              <EmptyState title="Sin programas evaluables" description="No hay cohortes con ≥ 5 evaluables en este filtro." icon="filter" />
            )}
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="mb-3">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Distribución de Estados de Continuidad
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Proporción de estudiantes activos, en riesgo, abandono, retirados y no evaluables
              </p>
            </div>
            {chartEstadosOption ? (
              <EChartBox
                option={chartEstadosOption}
                height={270}
                ariaLabel="Gráfico circular de estados de continuidad"
              />
            ) : (
              <EmptyState title="Sin datos de distribución" icon="inbox" />
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
                <span className="w-1.5 h-5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                <h3 id={captionId} className="font-display text-sm font-bold text-slate-900 tracking-tight">
                  Detalle de continuidad por estudiante
                </h3>
              </div>
              {pag && (
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  Mostrando <strong className="text-slate-800">{data?.estudiantes?.length || 0}</strong> de{' '}
                  <strong className="text-slate-800">{pag.totalRegistros.toLocaleString()}</strong> registros
                </span>
              )}
            </div>

            {!data?.estudiantes?.length ? (
              <EmptyState
                title="No se encontraron estudiantes"
                description="Ajusta el filtro de búsqueda, estado o programa para visualizar registros."
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
                    Detalle de continuidad por estudiante al corte {formatFechaEs(corte)}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Estudiante</th>
                      <th scope="col">Programa</th>
                      <th scope="col">Exigibles</th>
                      <th scope="col">Asist. / Faltas</th>
                      <th scope="col">Asistencia</th>
                      <th scope="col">Primera / Última</th>
                      <th scope="col">Evaluable</th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.estudiantes.map((r: any) => {
                      const esEvaluable =
                        typeof r.es_evaluable === 'boolean'
                          ? r.es_evaluable
                          : Number(r.sesiones_exigibles || 0) >= 3;
                      return (
                        <tr key={r.id_asignacion}>
                          <th scope="row">
                            <div className="font-bold text-slate-900">{r.codigo_anonimizado}</div>
                            <div className="text-[11px] font-normal text-slate-500 truncate max-w-[185px]" title={r.facultad_o_area}>
                              {r.facultad_o_area}
                              {r.ciclo_academico != null ? ` · Ciclo ${r.ciclo_academico}` : ''}
                            </div>
                          </th>
                          <td data-label="Programa" title={r.codigo_programa}>
                            <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200/80">
                              {compactPrograma(r.codigo_programa)}
                            </span>
                          </td>
                          <td data-label="Exigibles" className="tabular-nums font-medium text-slate-700">
                            {r.sesiones_exigibles}
                          </td>
                          <td data-label="Asist. / Faltas" className="tabular-nums text-xs">
                            <span className="font-bold text-emerald-700">{r.asistencias}</span>
                            <span className="text-slate-300 mx-1">/</span>
                            <span className="font-medium text-slate-600">{r.inasistencias}</span>
                          </td>
                          <td data-label="Asistencia" className="tabular-nums font-bold">
                            <span
                              className={
                                r.asistencia_pct >= 80
                                  ? 'text-emerald-700'
                                  : r.asistencia_pct >= 60
                                    ? 'text-amber-700'
                                    : 'text-rose-700'
                              }
                            >
                              {r.asistencia_pct.toFixed(1)}%
                            </span>
                          </td>
                          <td data-label="Primera / Última" className="tabular-nums text-xs text-slate-600 whitespace-nowrap">
                            {formatFechaEs(r.primera_asistencia)} → {formatFechaEs(r.ultima_asistencia)}
                          </td>
                          <td data-label="Evaluable">
                            <span
                              className={
                                esEvaluable
                                  ? 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200'
                                  : 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200'
                              }
                            >
                              {esEvaluable ? 'Sí' : 'No'}
                            </span>
                          </td>
                          <td data-label="Estado">
                            <EstadoContinuidadBadge estado={r.estado_continuidad} />
                          </td>
                        </tr>
                      );
                    })}
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
          Reglas de continuidad y clasificación D02 (RO-01 / KPI-03)
        </summary>
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 leading-relaxed">
          <div>
            <strong className="text-slate-900 block mb-0.5">Prioridad de Retiro (D02)</strong>
            El retiro formal al corte prevalece sobre el umbral de 3 sesiones, clasificándose como <em>Retirado</em> con <code>EsEvaluable = 0</code>.
          </div>
          <div>
            <strong className="text-slate-900 block mb-0.5">Criterio de evaluabilidad</strong>
            Requiere al menos <strong>3 sesiones realizadas</strong> desde la primera asistencia del estudiante hasta la fecha de corte.
          </div>
          <div>
            <strong className="text-slate-900 block mb-0.5">No perjuicio</strong>
            Sesiones canceladas, no realizadas o futuras nunca generan inasistencias.
          </div>
        </div>
      </details>
    </div>
  );
}
