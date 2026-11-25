'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  Info,
  Target,
  X,
  XCircle,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { AiReportButton } from './AiReportButton';
import { KpiCard } from './KpiCard';
import { EChartBox } from './EChartBox';
import { ChartSkeleton, EmptyState, KpiGridSkeleton, SuppressedState, TableSkeleton } from './UiStates';
import {
  EXECUTIVE_AXIS_LABEL,
  EXECUTIVE_SPLIT_LINE,
  barGradient,
  metaMarkLine,
} from '@/lib/chartTheme';

interface EfectividadPracticaReportProps {
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

function CumpleMetaBadge({ cumple, suprimido }: { cumple: boolean | null; suprimido: boolean }) {
  if (suprimido || cumple === null) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" aria-hidden="true" />
        No evaluable (n &lt; 5)
      </span>
    );
  }
  if (cumple) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Cumple meta
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
      <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      No cumple
    </span>
  );
}

export function EfectividadPracticaReport({
  filtros,
  corteInicial,
  semestre,
}: EfectividadPracticaReportProps) {
  const [instrumento, setInstrumento] = useState<'PSS-10' | 'PCL-5'>('PSS-10');
  const [corte, setCorte] = useState(corteInicial);
  const [facultad, setFacultad] = useState('');
  const [vista, setVista] = useState<'practica' | 'programa'>('practica');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const captionId = useId();

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getImpactoPracticas({
        instrumento,
        corte,
        semestre: semestre || undefined,
        facultad: facultad || undefined,
      });
      setData(res);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el comparativo de efectividad por práctica.');
    } finally {
      setLoading(false);
    }
  }, [instrumento, corte, semestre, facultad]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiarFiltros = () => {
    setInstrumento('PSS-10');
    setFacultad('');
    setVista('practica');
  };

  const activeFilterCount = [
    facultad,
    instrumento !== 'PSS-10' ? instrumento : '',
    vista !== 'practica' ? vista : '',
  ].filter(Boolean).length;

  const kpi05 = data?.kpi05_meta_practicas;
  const metaPts = data?.meta_operativa_pts ?? (instrumento === 'PSS-10' ? 4 : 10);

  const filasRaw: any[] = vista === 'practica' ? data?.por_practica || [] : data?.por_programa || [];
  const filas = useMemo(() => {
    return [...filasRaw].sort((a, b) => {
      const av = a.suprimido ? -9999 : Number(a.reduccion_promedio ?? -999);
      const bv = b.suprimido ? -9999 : Number(b.reduccion_promedio ?? -999);
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [filasRaw, sortDir]);

  const totalParesFilas = filas.reduce((acc, r) => acc + Number(r.pares_validos || 0), 0);
  const evaluablesFilas = filas.filter((r) => !r.suprimido && r.reduccion_promedio != null);
  const mejorPractica = evaluablesFilas.length
    ? [...evaluablesFilas].sort((a, b) => Number(b.reduccion_promedio) - Number(a.reduccion_promedio))[0]
    : null;

  // Chart 1: Reduction vs Operational Target (markLine)
  const chartRankingOption = useMemo(() => {
    const items = evaluablesFilas.slice(0, 10);
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const p = params[0];
          const r = items[p.dataIndex];
          const label = vista === 'practica' ? `${r.codigo_practica} · ${r.nombre_practica}` : r.codigo_programa;
          return `<div style="font-weight:700;margin-bottom:4px">${label}</div>
            <div>Reducción ${instrumento}: <strong style="color:#5EEAD4">${r.reduccion_promedio > 0 ? '+' : ''}${Number(r.reduccion_promedio).toFixed(2)} pts</strong></div>
            <div style="color:#94A3B8;font-size:11px">n = ${r.pares_validos} pares · Meta: ≥ ${metaPts.toFixed(1)} pts</div>`;
        },
      },
      grid: { left: 16, right: 20, top: 28, bottom: 26, containLabel: true },
      xAxis: {
        type: 'category',
        data: items.map((r) => (vista === 'practica' ? r.codigo_practica : compactPrograma(r.codigo_programa))),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisTick: { show: false },
        axisLabel: EXECUTIVE_AXIS_LABEL,
      },
      yAxis: {
        type: 'value',
        name: 'Reducción (pts)',
        nameTextStyle: { color: '#64748B', fontSize: 11 },
        axisLabel: EXECUTIVE_AXIS_LABEL,
        splitLine: EXECUTIVE_SPLIT_LINE,
      },
      series: [
        {
          name: `Reducción ${instrumento}`,
          type: 'bar',
          barMaxWidth: 42,
          data: items.map((r) => ({
            value: Number(r.reduccion_promedio.toFixed(2)),
            itemStyle: {
              borderRadius: [8, 8, 0, 0],
              color: r.cumple_meta
                ? barGradient('#14B8A6', '#0D9488')
                : barGradient('#F59E0B', '#D97706'),
            },
          })),
          markLine: metaMarkLine(metaPts, `Meta ≥ ${metaPts.toFixed(1)} pts`, '#0D9488'),
        },
      ],
    };
  }, [evaluablesFilas, instrumento, metaPts, vista]);

  // Chart 2: Pre vs Post Score Comparison
  const chartPrePostOption = useMemo(() => {
    const items = evaluablesFilas.slice(0, 8);
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
        data: items.map((r) => (vista === 'practica' ? r.codigo_practica : compactPrograma(r.codigo_programa))),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisTick: { show: false },
        axisLabel: EXECUTIVE_AXIS_LABEL,
      },
      yAxis: {
        type: 'value',
        name: `Puntaje ${instrumento}`,
        nameTextStyle: { color: '#64748B', fontSize: 11 },
        axisLabel: EXECUTIVE_AXIS_LABEL,
        splitLine: EXECUTIVE_SPLIT_LINE,
      },
      series: [
        {
          name: 'Prom. Inicial',
          type: 'bar',
          barMaxWidth: 26,
          itemStyle: { borderRadius: [6, 6, 0, 0], color: barGradient('#94A3B8', '#64748B') },
          data: items.map((r) => Number(r.promedio_inicial.toFixed(2))),
        },
        {
          name: 'Prom. Final',
          type: 'bar',
          barMaxWidth: 26,
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            color:
              instrumento === 'PSS-10'
                ? barGradient('#14B8A6', '#0D9488')
                : barGradient('#38BDF8', '#0284C7'),
          },
          data: items.map((r) => Number(r.promedio_final.toFixed(2))),
        },
      ],
    };
  }, [evaluablesFilas, instrumento, vista]);

  return (
    <div className="space-y-5">
      {/* Header & Collapsible Filter Bar */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-card overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200/80">
                RG-02
              </span>
              <h2 className="font-display text-lg font-bold text-slate-900 tracking-tight">
                Comparativo de Efectividad y Cumplimiento de Meta por Práctica (KPI-05)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Instrumento <strong className="text-slate-700">{instrumento}</strong> · Meta operativa{' '}
              <strong className="text-slate-700">≥ {metaPts.toFixed(1)} pts</strong> · Corte{' '}
              <strong className="text-slate-700">{formatFechaEs(corte)}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Instrument Segmented Toggle */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/80" role="group" aria-label="Selector de instrumento">
              {(['PSS-10', 'PCL-5'] as const).map((inst) => (
                <button
                  key={inst}
                  type="button"
                  onClick={() => setInstrumento(inst)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    instrumento === inst
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {inst}
                </button>
              ))}
            </div>

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
              reporte="RG-02"
              corte={data?.corte || corte}
              disabled={loading || !data}
              filtros={{ semestre, instrumento, facultad: facultad || 'TODAS', vista }}
              kpis={
                kpi05
                  ? {
                      instrumento,
                      meta_operativa_pts: metaPts,
                      practicas_evaluables: kpi05.practicas_evaluables,
                      practicas_cumplen_meta: kpi05.practicas_cumplen_meta,
                      tasa_cumplimiento_meta_pct: kpi05.tasa_cumplimiento_meta,
                      semaforo: kpi05.semaforo,
                    }
                  : null
              }
              grupos={filas.map((r: any) => ({
                nombre: vista === 'practica' ? `${r.codigo_practica} · ${r.nombre_practica}` : r.codigo_programa,
                n: Number(r.pares_validos || 0),
                instrumento,
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
                  <Calendar className="w-3.5 h-3.5 text-teal-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={corte}
                    onChange={(e) => setCorte(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs font-medium text-slate-800"
                  />
                </div>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Instrumento (separado)</span>
                <select
                  value={instrumento}
                  onChange={(e) => setInstrumento(e.target.value as 'PSS-10' | 'PCL-5')}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
                >
                  <option value="PSS-10">PSS-10 · Estrés percibido (0–40)</option>
                  <option value="PCL-5">PCL-5 · Síntomas postraumáticos (0–80)</option>
                </select>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Facultad / Área</span>
                <select
                  value={facultad}
                  onChange={(e) => setFacultad(e.target.value)}
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
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Nivel de detalle</span>
                <select
                  value={vista}
                  onChange={(e) => setVista(e.target.value as 'practica' | 'programa')}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
                >
                  <option value="practica">Por Práctica Principal (P-01..P-04, MIXTO)</option>
                  <option value="programa">Desglosado por Programa (Cohorte)</option>
                </select>
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

      {/* Top Executive KPI Cards */}
      {loading && !data ? (
        <KpiGridSkeleton count={4} />
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            code="KPI-05"
            title={`Prácticas que cumplen meta (${instrumento})`}
            value={
              kpi05?.tasa_cumplimiento_meta != null
                ? `${Number(kpi05.tasa_cumplimiento_meta).toFixed(1)}`
                : '—'
            }
            unit={kpi05?.tasa_cumplimiento_meta != null ? '%' : undefined}
            semaforo={kpi05?.semaforo || 'SIN_DATOS'}
            metaLabel="Meta: ≥ 80%"
            subtitle={
              kpi05
                ? `${kpi05.practicas_cumplen_meta} de ${kpi05.practicas_evaluables} evaluables`
                : 'Sin evaluables'
            }
            progressPct={kpi05?.tasa_cumplimiento_meta ?? null}
            accent="teal"
            Icon={Award}
          />

          <KpiCard
            code="META OPERATIVA"
            title={`Umbral mínimo requerido (${instrumento})`}
            value={`≥ ${metaPts.toFixed(1)}`}
            unit="pts"
            subtitle={instrumento === 'PSS-10' ? 'Reducción estrés percibido' : 'Cambio clínicamente relevante'}
            accent="indigo"
            Icon={Target}
          />

          <KpiCard
            code="MEJOR DESEMPEÑO"
            title={vista === 'practica' ? 'Práctica líder en reducción' : 'Cohorte líder en reducción'}
            value={
              mejorPractica
                ? `+${Number(mejorPractica.reduccion_promedio).toFixed(2)}`
                : 'n < 5'
            }
            unit={mejorPractica ? 'pts' : undefined}
            subtitle={
              mejorPractica
                ? vista === 'practica'
                  ? `${mejorPractica.codigo_practica} · n = ${mejorPractica.pares_validos}`
                  : `${compactPrograma(mejorPractica.codigo_programa)} · n = ${mejorPractica.pares_validos}`
                : 'Sin grupos con n ≥ 5'
            }
            accent="emerald"
          />

          <KpiCard
            code="MUESTRA TOTAL"
            title="Pares válidos analizados al corte"
            value={totalParesFilas.toLocaleString()}
            unit="pares"
            subtitle={`${evaluablesFilas.length} de ${filas.length} grupos evaluables`}
            accent="sky"
          />
        </section>
      )}

      {/* 2 Interactive ECharts */}
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
                Reducción Promedio vs. Meta Operativa ({instrumento})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Línea punteada marca el objetivo mínimo de ≥ {metaPts.toFixed(1)} puntos
              </p>
            </div>
            {evaluablesFilas.length > 0 ? (
              <EChartBox
                option={chartRankingOption}
                height={275}
                ariaLabel={`Ranking de reducción promedio por práctica en ${instrumento}`}
              />
            ) : (
              <SuppressedState context={facultad ? `la facultad ${facultad}` : 'el filtro seleccionado'} />
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="mb-3">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Comparativo Puntaje Inicial vs. Final ({instrumento})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Solo se grafican grupos que cumplen el umbral de privacidad estadística (n ≥ 5)
              </p>
            </div>
            {evaluablesFilas.length > 0 ? (
              <EChartBox
                option={chartPrePostOption}
                height={275}
                ariaLabel={`Comparativo de puntajes inicial y final por práctica en ${instrumento}`}
              />
            ) : (
              <SuppressedState context={facultad ? `la facultad ${facultad}` : 'el filtro seleccionado'} />
            )}
          </div>
        </section>
      )}

      {/* Detailed Table */}
      {loading && !data ? (
        <TableSkeleton rows={5} cols={7} />
      ) : (
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="w-1.5 h-5 rounded-full bg-teal-500 shrink-0" aria-hidden="true" />
              <h3 id={captionId} className="font-display text-sm font-bold text-slate-900 tracking-tight">
                {vista === 'practica'
                  ? `Ranking de efectividad por Práctica Principal — ${instrumento}`
                  : `Desglose de efectividad por Programa (Cohorte) — ${instrumento}`}
              </h3>
            </div>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {filas.length} {vista === 'practica' ? 'prácticas' : 'programas'}
            </span>
          </div>

          {!filas.length ? (
            <EmptyState
              title="Sin datos para este filtro"
              description="Cambia de facultad, semestre o instrumento para revisar el desempeño de las prácticas."
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
                  Comparativo de efectividad y cumplimiento de meta por práctica en {instrumento} al corte {formatFechaEs(corte)}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{vista === 'practica' ? 'Práctica principal' : 'Programa (Cohorte)'}</th>
                    {vista === 'programa' && <th scope="col">Práctica</th>}
                    <th scope="col">Pares (n)</th>
                    <th scope="col">Inicial</th>
                    <th scope="col">Final</th>
                    <th scope="col">
                      <button
                        type="button"
                        onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                        className="inline-flex items-center gap-1 hover:text-slate-900 uppercase tracking-wider"
                      >
                        Reducción
                        <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th scope="col">Meta</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((r: any) => (
                    <tr key={vista === 'practica' ? r.id_practica : r.id_programa}>
                      <th scope="row">
                        {vista === 'practica' ? (
                          <div>
                            <div className="font-bold text-slate-900">{r.codigo_practica}</div>
                            <div className="text-[11px] font-normal text-slate-500">
                              {r.nombre_practica}
                              {r.es_mixto !== undefined && <> · {r.es_mixto ? 'Mixto' : 'Unicomponente'}</>}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-slate-900">{compactPrograma(r.codigo_programa)}</div>
                            <div className="text-[11px] font-normal text-slate-500">{r.estado_programa}</div>
                          </div>
                        )}
                      </th>
                      {vista === 'programa' && (
                        <td data-label="Práctica">
                          <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200/80">
                            {r.codigo_practica}
                          </span>
                        </td>
                      )}
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
                          <span className={r.cumple_meta ? 'text-emerald-700' : 'text-amber-700'}>
                            {r.reduccion_promedio > 0 ? '+' : ''}
                            {r.reduccion_promedio.toFixed(2)} pts
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td data-label="Meta" className="tabular-nums text-slate-500 text-xs font-medium">
                        ≥ {metaPts.toFixed(1)} pts
                      </td>
                      <td data-label="Estado">
                        <CumpleMetaBadge cumple={r.cumple_meta} suprimido={r.suprimido} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <details className="rounded-2xl border border-slate-200/80 bg-white px-5 py-3 text-xs text-slate-600 shadow-card">
        <summary className="cursor-pointer font-semibold text-slate-700 inline-flex items-center gap-2 select-none">
          <Info className="w-4 h-4 text-teal-600" aria-hidden="true" />
          Reglas de cómputo aplicadas en RG-02 (KPI-05)
        </summary>
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 leading-relaxed">
          <div>
            <strong className="text-slate-900 block mb-0.5">Separación de escalas</strong>
            PSS-10 y PCL-5 se analizan siempre de forma independiente desde <code>dm.vw_HechoEfectividadPractica</code>.
          </div>
          <div>
            <strong className="text-slate-900 block mb-0.5">Filtro previo por Facultad</strong>
            Al filtrar por facultad/área, el umbral de <strong>n ≥ 5 pares válidos</strong> se recalcula sobre el subconjunto filtrado.
          </div>
          <div>
            <strong className="text-slate-900 block mb-0.5">Metas operativas</strong>
            PSS-10 exige <code>≥ 4.0 pts</code> de reducción; PCL-5 exige <code>≥ 10.0 pts</code> sobre el mismo evento índice.
          </div>
        </div>
      </details>
    </div>
  );
}
