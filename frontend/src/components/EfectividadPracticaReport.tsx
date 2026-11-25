'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import {
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
import {
  api,
  type FiltrosResponse,
  type ImpactoPracticaRow,
  type ImpactoPracticasResponse,
} from '@/lib/api';
import { AiReportButton } from './AiReportButton';
import { KpiCard } from './KpiCard';
import { ChartCard } from './ChartCard';
import { SemaforoBadge } from './SemaforoBadge';
import { DataBarCell, PowerDataTable } from './PowerDataTable';
import { CrossFilterBanner, PowerBiHintBadge, SlicerPills } from './PowerBiControls';
import { ChartSkeleton, KpiGridSkeleton, TableSkeleton } from './UiStates';
import {
  EXECUTIVE_AXIS_LABEL,
  EXECUTIVE_SPLIT_LINE,
  barGradient,
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

function compactPrograma(codigo?: string): string {
  if (!codigo) return '—';
  const match = codigo.match(/(P-\d{2}|MIXTO)-(C\d{2})$/);
  if (match) return `${match[1]} · ${match[2]}`;
  return codigo;
}

function CumpleMetaBadge({ cumple, suprimido }: { cumple: boolean | null; suprimido: boolean }) {
  if (suprimido || cumple === null) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
        No evaluable (n &lt; 5)
      </span>
    );
  }
  return cumple ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Cumple meta
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
      <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Bajo meta
    </span>
  );
}

export function EfectividadPracticaReport({
  filtros,
  corteInicial,
  semestre,
}: EfectividadPracticaReportProps) {
  const [corte, setCorte] = useState(corteInicial);
  const [instrumento, setInstrumento] = useState<'PSS-10' | 'PCL-5'>('PSS-10');
  const [facultad, setFacultad] = useState('');
  const [vista, setVista] = useState<'practica' | 'programa'>('practica');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Cross-filtering local instantáneo
  const [crossKey, setCrossKey] = useState<string | null>(null);

  const [data, setData] = useState<ImpactoPracticasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCrossKey(null);
  }, [instrumento, vista, facultad, semestre, corte]);

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

  const rowKey = useCallback(
    (r: ImpactoPracticaRow) => (vista === 'practica' ? r.codigo_practica : r.codigo_programa || r.codigo_practica),
    [vista],
  );

  const filasRaw: ImpactoPracticaRow[] = useMemo(
    () => (vista === 'practica' ? data?.por_practica || [] : data?.por_programa || []),
    [data, vista],
  );

  const filasCrossFiltradas = useMemo(() => {
    if (!crossKey) return filasRaw;
    return filasRaw.filter((r) => rowKey(r) === crossKey);
  }, [filasRaw, crossKey, rowKey]);

  const kpi05 = data?.kpi05_meta_practicas;
  const metaPts = data?.meta_operativa_pts ?? (instrumento === 'PSS-10' ? 4 : 10);

  const evaluablesFilas = useMemo(
    () =>
      filasRaw
        .filter(
          (r): r is ImpactoPracticaRow & { reduccion_promedio: number } =>
            !r.suprimido && r.reduccion_promedio != null,
        )
        .sort((a, b) => Number(b.reduccion_promedio) - Number(a.reduccion_promedio)),
    [filasRaw],
  );

  const selectedRow = useMemo(
    () => (crossKey ? filasRaw.find((r) => rowKey(r) === crossKey) || null : null),
    [crossKey, filasRaw, rowKey],
  );

  const mejorPractica = selectedRow && !selectedRow.suprimido ? selectedRow : evaluablesFilas[0] || null;

  // Visual 1: Barras Horizontales con markLine vertical de Meta Operativa
  const chartHorizontalOption = useMemo(() => {
    const items = evaluablesFilas.slice(0, 12);
    if (items.length === 0) return null;

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const p = params[0];
          const r = items[p.dataIndex];
          if (!r) return '';
          const label =
            vista === 'practica'
              ? `${r.codigo_practica} · ${r.nombre_practica}`
              : `${r.codigo_programa} (${r.codigo_practica})`;
          return `<div style="font-weight:700;margin-bottom:4px">${label}</div>
            <div>Reducción ${instrumento}: <strong style="color:#5EEAD4">${r.reduccion_promedio > 0 ? '+' : ''}${r.reduccion_promedio.toFixed(2)} pts</strong></div>
            <div>Inicial → Final: <strong>${Number(r.promedio_inicial ?? 0).toFixed(1)} → ${Number(r.promedio_final ?? 0).toFixed(1)}</strong></div>
            <div style="color:#94A3B8;font-size:11px;margin-top:3px">n = ${r.pares_validos} pares · Meta ≥ ${metaPts.toFixed(1)} pts · Clic para filtrar</div>`;
        },
      },
      grid: { left: 16, right: 38, top: 28, bottom: 26, containLabel: true },
      xAxis: {
        type: 'value',
        name: `Reducción ${instrumento} (pts)`,
        nameLocation: 'middle',
        nameGap: 22,
        nameTextStyle: { color: '#64748B', fontSize: 11 },
        axisLabel: EXECUTIVE_AXIS_LABEL,
        splitLine: EXECUTIVE_SPLIT_LINE,
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: items.map((r) =>
          vista === 'practica'
            ? `${r.codigo_practica} · ${r.nombre_practica.slice(0, 18)}`
            : compactPrograma(r.codigo_programa),
        ),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisTick: { show: false },
        axisLabel: EXECUTIVE_AXIS_LABEL,
      },
      series: [
        {
          name: `Reducción ${instrumento}`,
          type: 'bar',
          barMaxWidth: 28,
          label: {
            show: true,
            position: 'right',
            fontSize: 11,
            fontWeight: 700,
            color: '#334155',
            formatter: (p: any) => `+${Number(p.value).toFixed(1)}`,
          },
          data: items.map((r) => {
            const key = rowKey(r);
            const isSelected = !crossKey || crossKey === key;
            const color =
              r.reduccion_promedio >= metaPts
                ? barGradient('#10B981', '#059669')
                : r.reduccion_promedio > 0
                  ? barGradient('#F59E0B', '#D97706')
                  : barGradient('#F43F5E', '#E11D48');
            return {
              name: key,
              value: Number(r.reduccion_promedio.toFixed(2)),
              itemStyle: {
                borderRadius: [0, 8, 8, 0],
                color,
                opacity: isSelected ? 1 : 0.25,
              },
            };
          }),
          markLine: {
            symbol: ['none', 'none'],
            silent: true,
            lineStyle: { color: '#0F766E', type: 'dashed', width: 2 },
            label: {
              formatter: `Meta ≥ ${metaPts.toFixed(1)} pts`,
              position: 'insideEndTop',
              color: '#0F766E',
              fontSize: 11,
              fontWeight: 700,
              backgroundColor: 'rgba(240,253,250,0.95)',
              padding: [3, 6],
              borderRadius: 6,
            },
            data: [{ xAxis: metaPts }],
          },
        },
      ],
    };
  }, [evaluablesFilas, instrumento, metaPts, vista, crossKey, rowKey]);

  // Visual 2A: Velocímetro (Gauge) de KPI-05 (% prácticas que cumplen meta ≥ 80%)
  const chartGaugeKpi05Option = useMemo(() => {
    if (!kpi05) return null;
    const tasa = kpi05.tasa_cumplimiento_meta ?? 0;
    return {
      tooltip: {
        formatter: () =>
          `<strong>KPI-05 (${instrumento})</strong><br/>Cumplen meta: <strong>${kpi05.practicas_cumplen_meta} de ${kpi05.practicas_evaluables}</strong> (${kpi05.tasa_cumplimiento_meta != null ? `${kpi05.tasa_cumplimiento_meta.toFixed(1)}%` : 'Sin datos'})<br/>Meta operativa: ≥ 80.0%`,
      },
      series: [
        {
          type: 'gauge',
          startAngle: 205,
          endAngle: -25,
          min: 0,
          max: 100,
          splitNumber: 5,
          radius: '92%',
          center: ['50%', '62%'],
          axisLine: {
            lineStyle: {
              width: 16,
              color: [
                [0.5, '#F43F5E'],
                [0.8, '#F59E0B'],
                [1, '#10B981'],
              ],
            },
          },
          pointer: {
            icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
            length: '52%',
            width: 8,
            offsetCenter: [0, '-18%'],
            itemStyle: { color: '#0F172A' },
          },
          axisTick: { distance: -16, length: 5, lineStyle: { color: '#fff', width: 1 } },
          splitLine: { distance: -16, length: 16, lineStyle: { color: '#fff', width: 2 } },
          axisLabel: { color: '#64748B', distance: 22, fontSize: 10, formatter: '{value}%' },
          title: { offsetCenter: [0, '24%'], fontSize: 11, color: '#64748B', fontWeight: 600 },
          detail: {
            valueAnimation: true,
            formatter: () =>
              kpi05.tasa_cumplimiento_meta != null
                ? `${kpi05.tasa_cumplimiento_meta.toFixed(1)}%`
                : 'N/A',
            color: '#0F172A',
            fontSize: 24,
            fontWeight: 800,
            offsetCenter: [0, '2%'],
          },
          data: [{ value: Number(tasa.toFixed(1)), name: 'Meta ≥ 80% prácticas' }],
        },
      ],
    };
  }, [kpi05, instrumento]);

  // Visual 2B: Dispersión (Scatter) Pares Válidos (X) vs. Reducción en pts (Y)
  const chartScatterOption = useMemo(() => {
    if (evaluablesFilas.length === 0) return null;
    const maxN = Math.max(15, ...evaluablesFilas.map((r) => r.pares_validos));

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const r = evaluablesFilas[params.dataIndex];
          if (!r) return '';
          const title = vista === 'practica' ? `${r.codigo_practica} · ${r.nombre_practica}` : r.codigo_programa;
          return `<div style="font-weight:700;margin-bottom:4px">${title}</div>
            <div>Pares válidos: <strong>n = ${r.pares_validos}</strong></div>
            <div>Reducción ${instrumento}: <strong style="color:#5EEAD4">+${r.reduccion_promedio.toFixed(2)} pts</strong></div>
            <div>Meta operativa: <strong>${r.cumple_meta ? 'Cumple' : 'Bajo meta'} (≥ ${metaPts.toFixed(1)} pts)</strong></div>
            <div style="color:#94A3B8;font-size:11px;margin-top:3px">Clic para filtrar la matriz</div>`;
        },
      },
      grid: { left: 18, right: 26, top: 28, bottom: 32, containLabel: true },
      xAxis: {
        type: 'value',
        name: 'Evidencia (Pares válidos n)',
        nameLocation: 'middle',
        nameGap: 22,
        min: 0,
        max: Math.ceil(maxN * 1.15),
        nameTextStyle: { color: '#64748B', fontSize: 11 },
        axisLabel: EXECUTIVE_AXIS_LABEL,
        splitLine: EXECUTIVE_SPLIT_LINE,
      },
      yAxis: {
        type: 'value',
        name: `Reducción ${instrumento} (pts)`,
        nameTextStyle: { color: '#64748B', fontSize: 11 },
        axisLabel: EXECUTIVE_AXIS_LABEL,
        splitLine: EXECUTIVE_SPLIT_LINE,
      },
      series: [
        {
          name: 'Evidencia vs Reducción',
          type: 'scatter',
          symbolSize: (val: number[]) => Math.max(16, Math.min(44, 10 + (val[0] || 0) * 1.4)),
          label: {
            show: true,
            position: 'top',
            fontSize: 10,
            fontWeight: 700,
            color: '#334155',
            formatter: (p: any) => {
              const r = evaluablesFilas[p.dataIndex];
              return r ? (vista === 'practica' ? r.codigo_practica : compactPrograma(r.codigo_programa)) : '';
            },
          },
          data: evaluablesFilas.map((r) => {
            const key = rowKey(r);
            const isSelected = !crossKey || crossKey === key;
            return {
              name: key,
              value: [r.pares_validos, Number(r.reduccion_promedio.toFixed(2))],
              itemStyle: {
                color: r.cumple_meta ? '#10B981' : '#F59E0B',
                borderColor: isSelected ? '#0F172A' : '#ffffff',
                borderWidth: crossKey === key ? 3 : 1.5,
                opacity: isSelected ? 0.9 : 0.22,
              },
            };
          }),
          markLine: {
            symbol: ['none', 'none'],
            silent: true,
            data: [
              {
                yAxis: metaPts,
                lineStyle: { color: '#0F766E', type: 'dashed', width: 1.5 },
                label: { formatter: `Meta ≥ ${metaPts.toFixed(1)} pts`, color: '#0F766E', fontSize: 10 },
              },
              {
                xAxis: 5,
                lineStyle: { color: '#94A3B8', type: 'dotted', width: 1.5 },
                label: { formatter: 'n = 5', color: '#64748B', fontSize: 10 },
              },
            ],
          },
        },
      ],
    };
  }, [evaluablesFilas, instrumento, metaPts, vista, crossKey, rowKey]);

  const maxPares = useMemo(
    () => Math.max(10, ...filasCrossFiltradas.map((r) => Number(r.pares_validos || 0))),
    [filasCrossFiltradas],
  );

  const columns = useMemo<ColumnDef<ImpactoPracticaRow, any>[]>(
    () => [
      {
        id: 'entidad',
        accessorFn: (r) => (vista === 'practica' ? `${r.codigo_practica} ${r.nombre_practica}` : r.codigo_programa || ''),
        header: vista === 'practica' ? 'Práctica principal' : 'Programa / Cohorte',
        cell: ({ row }) =>
          vista === 'practica' ? (
            <div>
              <div className="font-bold text-slate-900">{row.original.codigo_practica}</div>
              <div className="text-[11px] text-slate-500">{row.original.nombre_practica}</div>
            </div>
          ) : (
            <div>
              <div className="font-bold text-slate-900">{compactPrograma(row.original.codigo_programa)}</div>
              <div className="text-[11px] text-slate-500">
                {row.original.codigo_practica} · {row.original.nombre_practica}
              </div>
            </div>
          ),
      },
      {
        id: 'tipo',
        accessorFn: (r) => (vista === 'practica' ? r.tipo_practica || (r.es_mixto ? 'Mixto' : 'Unicomponente') : r.estado_programa || '—'),
        header: vista === 'practica' ? 'Tipo' : 'Estado',
        cell: ({ getValue }) => (
          <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
            {String(getValue())}
          </span>
        ),
      },
      {
        accessorKey: 'pares_validos',
        header: 'Pares válidos',
        cell: ({ row }) => (
          <DataBarCell
            value={row.original.pares_validos}
            max={maxPares}
            display={`n = ${row.original.pares_validos}`}
            tone="indigo"
          />
        ),
      },
      {
        accessorKey: 'promedio_inicial',
        header: 'Prom. Inicial',
        cell: ({ row }) =>
          row.original.suprimido ? (
            <span className="text-xs text-slate-400 italic">Suprimido</span>
          ) : (
            <span className="tabular-nums text-slate-700">
              {row.original.promedio_inicial != null ? row.original.promedio_inicial.toFixed(2) : '—'}
            </span>
          ),
      },
      {
        accessorKey: 'promedio_final',
        header: 'Prom. Final',
        cell: ({ row }) =>
          row.original.suprimido ? (
            <span className="text-xs text-slate-400 italic">Suprimido</span>
          ) : (
            <span className="tabular-nums font-semibold text-slate-900">
              {row.original.promedio_final != null ? row.original.promedio_final.toFixed(2) : '—'}
            </span>
          ),
      },
      {
        accessorKey: 'reduccion_promedio',
        header: 'Reducción (pts)',
        cell: ({ row }) => {
          if (row.original.suprimido || row.original.reduccion_promedio == null) {
            return <span className="text-xs text-slate-400 italic">Suprimido (n&lt;5)</span>;
          }
          const red = row.original.reduccion_promedio;
          return (
            <DataBarCell
              value={red}
              max={instrumento === 'PSS-10' ? 12 : 25}
              display={`${red > 0 ? '+' : ''}${red.toFixed(2)} pts`}
              tone={red >= metaPts ? 'emerald' : red > 0 ? 'amber' : 'rose'}
            />
          );
        },
      },
      {
        accessorKey: 'cumple_meta',
        header: 'Meta operativa',
        cell: ({ row }) => (
          <CumpleMetaBadge cumple={row.original.cumple_meta} suprimido={row.original.suprimido} />
        ),
      },
      {
        accessorKey: 'semaforo',
        header: 'Semáforo',
        cell: ({ getValue }) => <SemaforoBadge estado={getValue()} />,
      },
    ],
    [vista, maxPares, instrumento, metaPts],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold tracking-wider uppercase">
              RG-02 · Reporte Gerencial
            </span>
            <PowerBiHintBadge />
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              Corte: <strong className="text-slate-700">{formatFechaEs(data?.corte || corte)}</strong>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Efectividad Comparativa por Práctica de Bienestar
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Evaluación de reducción promedio por técnica ({instrumento}) frente a meta operativa (≥ {metaPts.toFixed(1)} pts) y evidencia muestral (n ≥ 5).
          </p>
        </div>

        <AiReportButton
          reporte="RG-02"
          corte={data?.corte || corte}
          filtros={{
            instrumento,
            semestre: semestre || 'TODOS',
            facultad: facultad || 'TODAS',
            vista,
            seleccion_cruzada: crossKey || 'NINGUNA',
          }}
          kpis={{
            kpi05_meta_practicas: kpi05 || null,
            meta_operativa_pts: metaPts,
          }}
          grupos={filasCrossFiltradas
            .filter((r) => !r.suprimido && r.pares_validos >= 5)
            .map((r) => ({
              nombre: vista === 'practica' ? `${r.codigo_practica} · ${r.nombre_practica}` : r.codigo_programa || r.codigo_practica,
              n: r.pares_validos,
              instrumento,
              valor: r.reduccion_promedio,
              semaforo: r.semaforo,
            }))}
          disabled={loading || !data}
        />
      </div>

      {/* Power BI Slicers */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <SlicerPills
            label="Instrumento"
            value={instrumento}
            onChange={(val) => setInstrumento(val)}
            options={[
              { value: 'PSS-10', label: 'PSS-10 (Meta ≥ 4.0 pts)' },
              { value: 'PCL-5', label: 'PCL-5 (Meta ≥ 10.0 pts)' },
            ]}
          />
          <div className="hidden sm:block h-5 w-px bg-slate-200" aria-hidden="true" />
          <SlicerPills
            label="Nivel de análisis"
            accent="slate"
            value={vista}
            onChange={(val) => setVista(val)}
            options={[
              { value: 'practica', label: 'Por Práctica' },
              { value: 'programa', label: 'Por Programa / Cohorte' },
            ]}
          />
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold transition-colors self-start xl:self-auto"
        >
          <Filter className="w-3.5 h-3.5" aria-hidden="true" />
          Filtros
          {facultad && (
            <span className="px-1.5 py-0.2 rounded-full bg-teal-600 text-white text-[10px] font-bold">
              1
            </span>
          )}
          {filtersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </section>

      {filtersOpen && (
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Fecha de corte
            </label>
            <input
              type="date"
              value={corte}
              onChange={(e) => setCorte(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Facultad / Área (recalcula n ≥ 5)
            </label>
            <select
              value={facultad}
              onChange={(e) => setFacultad(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="">Todas las facultades</option>
              {(filtros?.facultades || []).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setFacultad('');
                setCrossKey(null);
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Limpiar filtros
            </button>
          </div>
        </section>
      )}

      {/* Cross-Filter Banner */}
      <CrossFilterBanner
        items={
          crossKey
            ? [
                {
                  label: vista === 'practica' ? 'Práctica' : 'Programa',
                  value: crossKey,
                  onClear: () => setCrossKey(null),
                },
              ]
            : []
        }
        onClearAll={() => setCrossKey(null)}
      />

      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {loading && !data ? (
        <KpiGridSkeleton count={3} />
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard
            code="KPI-05 · EFECTIVIDAD"
            title={`Prácticas que cumplen meta (${instrumento})`}
            value={
              kpi05?.tasa_cumplimiento_meta != null
                ? `${kpi05.tasa_cumplimiento_meta.toFixed(1)}%`
                : '—'
            }
            subtitle={`${kpi05?.practicas_cumplen_meta ?? 0} de ${kpi05?.practicas_evaluables ?? 0} prácticas evaluables (n ≥ 5)`}
            metaLabel="Meta ≥ 80.0%"
            semaforo={kpi05?.semaforo || 'SIN_DATOS'}
            accent="teal"
            Icon={Award}
          />
          <KpiCard
            code="META OPERATIVA"
            title={`Umbral mínimo requerido (${instrumento})`}
            value={`≥ ${metaPts.toFixed(1)}`}
            unit="pts"
            subtitle={
              instrumento === 'PSS-10'
                ? 'Reducción estrés percibido (escala 0–40)'
                : 'Cambio relevante síntomas trauma (0–80)'
            }
            accent="indigo"
            Icon={Target}
          />
          <KpiCard
            code={selectedRow ? 'SELECCIÓN CRUZADA' : 'MEJOR DESEMPEÑO'}
            title={
              selectedRow
                ? `Detalle de ${rowKey(selectedRow)}`
                : vista === 'practica'
                  ? 'Práctica líder en reducción'
                  : 'Cohorte líder en reducción'
            }
            value={
              mejorPractica && mejorPractica.reduccion_promedio != null
                ? `+${Number(mejorPractica.reduccion_promedio).toFixed(2)}`
                : 'n < 5'
            }
            unit={mejorPractica && mejorPractica.reduccion_promedio != null ? 'pts' : undefined}
            subtitle={
              mejorPractica
                ? vista === 'practica'
                  ? `${mejorPractica.codigo_practica} · n = ${mejorPractica.pares_validos} pares`
                  : `${compactPrograma(mejorPractica.codigo_programa)} · n = ${mejorPractica.pares_validos} pares`
                : 'Sin grupos evaluables (n ≥ 5)'
            }
            accent="emerald"
          />
        </section>
      )}

      {/* Visual 1: Barras Horizontales con markLine de Meta Operativa */}
      {loading && !data ? (
        <ChartSkeleton height={320} />
      ) : (
        <ChartCard
          title={`Ranking de Reducción (${instrumento}) vs. Meta Operativa (≥ ${metaPts.toFixed(1)} pts)`}
          subtitle="Barras horizontales ordenadas por reducción promedio con línea punteada de meta operativa."
          contextBadge={`${evaluablesFilas.length} evaluables`}
          option={chartHorizontalOption}
          height={320}
          ariaLabel={`Ranking horizontal de reducción ${instrumento}`}
          exportFilename={`RG02_ranking_horizontal_${instrumento}_${corte}.png`}
          interactiveHint
          onItemClick={(params) => {
            const target = evaluablesFilas[params.dataIndex];
            if (!target) return;
            const key = rowKey(target);
            setCrossKey((prev) => (prev === key ? null : key));
          }}
        />
      )}

      {/* Visual 2: Gauge KPI-05 + Scatter Evidencia vs Reducción */}
      {loading && !data ? (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4">
            <ChartSkeleton height={310} />
          </div>
          <div className="lg:col-span-8">
            <ChartSkeleton height={310} />
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <ChartCard
            className="lg:col-span-4"
            title="Velocímetro KPI-05"
            subtitle="% de prácticas evaluables que superan la meta operativa."
            contextBadge={`${kpi05?.practicas_cumplen_meta ?? 0}/${kpi05?.practicas_evaluables ?? 0}`}
            option={chartGaugeKpi05Option}
            height={300}
            ariaLabel={`Velocímetro KPI-05 para ${instrumento}`}
            exportFilename={`RG02_gauge_kpi05_${instrumento}_${corte}.png`}
          />

          <ChartCard
            className="lg:col-span-8"
            title="Matriz Evidencia vs. Efectividad (Dispersión)"
            subtitle="Pares válidos (eje X) vs. Reducción en pts (eje Y). Distingue técnicas con alta evidencia de grupos pequeños."
            contextBadge={`n ≥ 5 · Meta ≥ ${metaPts.toFixed(1)} pts`}
            option={chartScatterOption}
            height={300}
            ariaLabel={`Dispersión de pares válidos vs reducción ${instrumento}`}
            exportFilename={`RG02_scatter_evidencia_${instrumento}_${corte}.png`}
            interactiveHint
            onItemClick={(params) => {
              const target = evaluablesFilas[params.dataIndex];
              if (!target) return;
              const key = rowKey(target);
              setCrossKey((prev) => (prev === key ? null : key));
            }}
          />
        </section>
      )}

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs text-slate-600">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <strong>Lectura gerencial:</strong> Los resultados comparan asociaciones observadas por práctica en el corte actual y no implican causalidad experimental. Al filtrar por Facultad/Área se recalcula automáticamente la elegibilidad <code>ParesValidos ≥ 5</code>.
        </p>
      </div>

      {/* PowerDataTable */}
      {loading && !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <PowerDataTable
          title={
            vista === 'practica'
              ? `Matriz de Efectividad por Práctica (${instrumento})`
              : `Matriz de Efectividad por Programa / Cohorte (${instrumento})`
          }
          subtitle="Ordena por reducción o evidencia muestral, busca rápidamente o exporta la vista filtrada a Excel."
          caption={`Tabla comparativa de efectividad por ${vista} en ${instrumento}`}
          data={filasCrossFiltradas}
          columns={columns}
          initialSorting={[{ id: 'reduccion_promedio', desc: true }]}
          searchPlaceholder="Buscar práctica o programa..."
          csvFilename={`RG02_efectividad_${vista}_${instrumento}_${corte}.csv`}
          csvColumns={[
            {
              header: vista === 'practica' ? 'Código Práctica' : 'Código Programa',
              accessor: (r) => (vista === 'practica' ? r.codigo_practica : r.codigo_programa),
            },
            { header: 'Nombre Práctica', accessor: (r) => r.nombre_practica },
            { header: 'Pares Válidos', accessor: (r) => r.pares_validos },
            { header: 'Promedio Inicial', accessor: (r) => (r.suprimido ? 'SUPRIMIDO' : r.promedio_inicial) },
            { header: 'Promedio Final', accessor: (r) => (r.suprimido ? 'SUPRIMIDO' : r.promedio_final) },
            { header: 'Reducción Promedio (pts)', accessor: (r) => (r.suprimido ? 'SUPRIMIDO' : r.reduccion_promedio) },
            { header: 'Cumple Meta', accessor: (r) => (r.suprimido ? 'NO EVALUABLE' : r.cumple_meta ? 'SI' : 'NO') },
            { header: 'Semáforo', accessor: (r) => r.semaforo },
          ]}
        />
      )}
    </div>
  );
}
