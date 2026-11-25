'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Filter,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { AiReportButton } from './AiReportButton';
import { KpiCard } from './KpiCard';
import { ChartCard } from './ChartCard';
import { DataBarCell, PowerDataTable } from './PowerDataTable';
import { CrossFilterBanner, PowerBiHintBadge, SlicerPills } from './PowerBiControls';
import { ChartSkeleton, KpiGridSkeleton, TableSkeleton } from './UiStates';
import {
  CHART_COLORS,
  EXECUTIVE_AXIS_LABEL,
  EXECUTIVE_SPLIT_LINE,
} from '@/lib/chartTheme';

interface CumplimientoReportProps {
  filtros: FiltrosResponse | null;
  corteInicial: string;
  semestre: string;
}

interface OportunidadRow {
  id_oportunidad: number;
  codigo_anonimizado: string;
  facultad_o_area: string;
  codigo_programa: string;
  codigo_practica: string;
  codigo_instrumento: 'PSS-10' | 'PCL-5';
  momento: 'INICIAL' | 'FINAL';
  codigo_evento_local: string | null;
  categoria_evento: string | null;
  fecha_prevista: string | null;
  fecha_realizacion: string | null;
  puntaje_total: number | null;
  estado_evaluacion: string;
  es_elegible: boolean;
  es_completada_elegible: boolean;
  par_valido: boolean;
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

const ESTADO_LABELS: Record<string, string> = {
  COMPLETADA_EN_VENTANA: 'En ventana',
  COMPLETADA_TARDIA: 'Tardía',
  PENDIENTE_EN_VENTANA: 'Pendiente',
  VENCIDA: 'Vencida',
};

export function CumplimientoReport({ filtros, corteInicial, semestre }: CumplimientoReportProps) {
  const [corte, setCorte] = useState(corteInicial);
  const [idPrograma, setIdPrograma] = useState('');
  const [facultad, setFacultad] = useState('');
  const [instrumento, setInstrumento] = useState<'' | 'PSS-10' | 'PCL-5'>('');
  const [categoriaEvento, setCategoriaEvento] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Slicers + Cross-filtering local instantáneo
  const [crossMomento, setCrossMomento] = useState<'' | 'INICIAL' | 'FINAL'>('');
  const [crossEstado, setCrossEstado] = useState<string>('');

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCrossMomento('');
    setCrossEstado('');
  }, [semestre, corte, idPrograma, facultad, instrumento, categoriaEvento]);

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
        page: 1,
        pageSize: 300,
      });
      setData(res);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el control de cumplimiento de evaluaciones.');
    } finally {
      setLoading(false);
    }
  }, [corte, semestre, idPrograma, facultad, instrumento, categoriaEvento]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const activeFilterCount = [idPrograma, facultad, categoriaEvento].filter(Boolean).length;
  const rt = data?.resumen_total;
  const oportunidadesRaw: OportunidadRow[] = data?.oportunidades || [];

  const programasFiltrados = (filtros?.programas || []).filter(
    (p) => !semestre || p.periodo_academico === semestre,
  );

  // Oportunidades filtradas por Cross-Filtering (Momento / Estado)
  const oportunidadesFiltradas = useMemo(() => {
    return oportunidadesRaw.filter((o) => {
      if (crossMomento && o.momento !== crossMomento) return false;
      if (crossEstado && o.estado_evaluacion !== crossEstado) return false;
      return true;
    });
  }, [oportunidadesRaw, crossMomento, crossEstado]);

  // Recalcular KPI-04 si hay crossMomento activo (respetando n < 5)
  const effectiveKpi = useMemo(() => {
    if (!crossMomento) return rt;
    const subset = oportunidadesRaw.filter((o) => o.momento === crossMomento);
    const elegibles = subset.filter((o) => o.es_elegible).length;
    const completadasElegibles = subset.filter((o) => o.es_completada_elegible).length;
    const enVentana = subset.filter((o) => o.estado_evaluacion === 'COMPLETADA_EN_VENTANA').length;
    const tardias = subset.filter((o) => o.estado_evaluacion === 'COMPLETADA_TARDIA').length;
    const pendientes = subset.filter((o) => o.estado_evaluacion === 'PENDIENTE_EN_VENTANA').length;
    const vencidas = subset.filter((o) => o.estado_evaluacion === 'VENCIDA').length;
    const tasa = elegibles > 0 ? Number(((completadasElegibles / elegibles) * 100).toFixed(1)) : null;
    const semaforo =
      elegibles === 0
        ? 'SIN_DATOS'
        : elegibles < 5
          ? 'SUPRIMIDO'
          : (tasa ?? 0) >= 90
            ? 'BUENO'
            : (tasa ?? 0) >= 75
              ? 'REGULAR'
              : 'MALO';
    return {
      elegibles,
      elegibles_completadas: completadasElegibles,
      completadas_en_ventana: enVentana,
      completadas_tardias: tardias,
      pendientes_en_ventana: pendientes,
      vencidas,
      tasa_cumplimiento: elegibles >= 5 ? tasa : null,
      suprimido: elegibles > 0 && elegibles < 5,
      semaforo,
    };
  }, [crossMomento, oportunidadesRaw, rt]);

  // Visual 1: Barras Apiladas por Momento (INICIAL vs FINAL) segmentadas por Estado
  const chartMomentoStackedOption = useMemo(() => {
    if (oportunidadesRaw.length === 0) return null;
    const momentos: Array<'INICIAL' | 'FINAL'> = ['INICIAL', 'FINAL'];

    const countBy = (m: 'INICIAL' | 'FINAL', est: string) =>
      oportunidadesRaw.filter((o) => o.momento === m && o.estado_evaluacion === est).length;

    const cellOpacity = (m: 'INICIAL' | 'FINAL', est: string) => {
      const matchM = !crossMomento || crossMomento === m;
      const matchE = !crossEstado || crossEstado === est;
      return matchM && matchE ? 1 : 0.24;
    };

    const states = [
      { key: 'COMPLETADA_EN_VENTANA', name: 'En ventana', color: CHART_COLORS.emerald },
      { key: 'COMPLETADA_TARDIA', name: 'Tardía', color: CHART_COLORS.amber },
      { key: 'PENDIENTE_EN_VENTANA', name: 'Pendiente', color: CHART_COLORS.sky },
      { key: 'VENCIDA', name: 'Vencida', color: CHART_COLORS.rose },
    ];

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
      grid: { left: 16, right: 20, top: 38, bottom: 24, containLabel: true },
      xAxis: {
        type: 'category',
        data: ['INICIAL', 'FINAL'],
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisTick: { show: false },
        axisLabel: { ...EXECUTIVE_AXIS_LABEL, fontWeight: 700 },
      },
      yAxis: {
        type: 'value',
        name: 'Oportunidades',
        nameTextStyle: { color: '#64748B', fontSize: 11 },
        axisLabel: EXECUTIVE_AXIS_LABEL,
        splitLine: EXECUTIVE_SPLIT_LINE,
      },
      series: states.map((st) => ({
        name: st.name,
        type: 'bar',
        stack: 'momento',
        barMaxWidth: 68,
        label: {
          show: true,
          position: 'inside',
          color: '#ffffff',
          fontSize: 11,
          fontWeight: 700,
          formatter: (p: any) => (p.value > 0 ? String(p.value) : ''),
        },
        data: momentos.map((m) => ({
          value: countBy(m, st.key),
          itemStyle: {
            color: st.color,
            opacity: cellOpacity(m, st.key),
          },
        })),
      })),
    };
  }, [oportunidadesRaw, crossMomento, crossEstado]);

  // Visual 2: Gauge / Velocímetro de KPI-04 frente a meta operativa 90%
  const chartGaugeKpi04Option = useMemo(() => {
    if (!effectiveKpi) return null;
    const tasa = effectiveKpi.suprimido ? 0 : Number(effectiveKpi.tasa_cumplimiento ?? 0);

    return {
      tooltip: {
        formatter: () =>
          `<strong>KPI-04 · Cumplimiento</strong><br/>Completadas elegibles: <strong>${effectiveKpi.elegibles_completadas ?? 0} de ${effectiveKpi.elegibles ?? 0}</strong><br/>Meta operativa: ≥ 90.0%`,
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
                [0.75, '#F43F5E'],
                [0.9, '#F59E0B'],
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
              effectiveKpi.suprimido
                ? 'n < 5'
                : effectiveKpi.tasa_cumplimiento != null
                  ? `${Number(effectiveKpi.tasa_cumplimiento).toFixed(1)}%`
                  : 'N/A',
            color: '#0F172A',
            fontSize: 24,
            fontWeight: 800,
            offsetCenter: [0, '2%'],
          },
          data: [{ value: Number(tasa.toFixed(1)), name: 'Meta operativa ≥ 90%' }],
        },
      ],
    };
  }, [effectiveKpi]);

  // Columnas PowerDataTable
  const columns = useMemo<ColumnDef<OportunidadRow, any>[]>(
    () => [
      {
        accessorKey: 'codigo_anonimizado',
        header: 'Estudiante',
        cell: ({ row }) => (
          <div>
            <div className="font-bold text-slate-900 tabular-nums">
              {row.original.codigo_anonimizado}
            </div>
            <div className="text-[11px] text-slate-500">{row.original.facultad_o_area}</div>
          </div>
        ),
      },
      {
        accessorKey: 'codigo_programa',
        header: 'Programa',
        cell: ({ row }) => (
          <span className="font-semibold text-slate-800">
            {compactPrograma(row.original.codigo_programa)}
          </span>
        ),
      },
      {
        id: 'instrumento_momento',
        accessorFn: (r) => `${r.codigo_instrumento} ${r.momento}`,
        header: 'Instrumento / Momento',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span
              className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                row.original.codigo_instrumento === 'PSS-10'
                  ? 'bg-teal-50 text-teal-800 border border-teal-200'
                  : 'bg-sky-50 text-sky-800 border border-sky-200'
              }`}
            >
              {row.original.codigo_instrumento}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
              {row.original.momento}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'fecha_prevista',
        header: 'Prevista / Realizada',
        cell: ({ row }) => (
          <div className="text-xs tabular-nums">
            <div className="text-slate-600">Prev: {formatFechaEs(row.original.fecha_prevista)}</div>
            <div className="text-slate-900 font-semibold">
              Real: {formatFechaEs(row.original.fecha_realizacion)}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'puntaje_total',
        header: 'Puntaje',
        cell: ({ row }) => {
          const val = row.original.puntaje_total;
          const max = row.original.codigo_instrumento === 'PSS-10' ? 40 : 80;
          return (
            <DataBarCell
              value={val}
              max={max}
              display={val != null ? `${val} / ${max}` : '—'}
              tone={row.original.codigo_instrumento === 'PSS-10' ? 'teal' : 'indigo'}
            />
          );
        },
      },
      {
        accessorKey: 'par_valido',
        header: 'Par válido',
        cell: ({ getValue }) =>
          getValue() ? (
            <span className="inline-flex px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
              Sí
            </span>
          ) : (
            <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[11px] font-semibold">
              No
            </span>
          ),
      },
      {
        accessorKey: 'estado_evaluacion',
        header: 'Estado',
        cell: ({ getValue }) => <EstadoEvaluacionBadge estado={String(getValue())} />,
      },
    ],
    [],
  );

  const crossFilterItems = useMemo(() => {
    const items: Array<{ label: string; value: string; onClear: () => void }> = [];
    if (crossMomento) {
      items.push({
        label: 'Momento',
        value: crossMomento,
        onClear: () => setCrossMomento(''),
      });
    }
    if (crossEstado) {
      items.push({
        label: 'Estado',
        value: ESTADO_LABELS[crossEstado] || crossEstado,
        onClear: () => setCrossEstado(''),
      });
    }
    return items;
  }, [crossMomento, crossEstado]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold tracking-wider uppercase">
              RO-02 · Reporte Operativo
            </span>
            <PowerBiHintBadge />
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              Corte: <strong className="text-slate-700">{formatFechaEs(data?.corte || corte)}</strong>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Control de Evaluaciones y Cumplimiento en Ventana
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitoreo de oportunidades elegibles (KPI-04, meta ≥ 90%), detección de atrasos entre momento INICIAL y FINAL y trazabilidad de pares válidos.
          </p>
        </div>

        <AiReportButton
          reporte="RO-02"
          corte={data?.corte || corte}
          filtros={{
            semestre: semestre || 'TODOS',
            instrumento: instrumento || 'AMBOS',
            momento: crossMomento || 'AMBOS',
            estado: crossEstado || 'TODOS',
          }}
          kpis={effectiveKpi || null}
          grupos={
            effectiveKpi && Number(effectiveKpi.elegibles || 0) >= 5
              ? [
                  {
                    nombre: crossMomento ? `Cumplimiento ${crossMomento}` : 'Cumplimiento Global',
                    n: Number(effectiveKpi.elegibles || 0),
                    valor: effectiveKpi.tasa_cumplimiento,
                    semaforo: effectiveKpi.semaforo,
                  },
                ]
              : []
          }
          disabled={loading || !data}
        />
      </div>

      {/* Power BI Visual Slicers */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <SlicerPills
            label="Instrumento"
            value={instrumento}
            onChange={(val) => setInstrumento(val)}
            options={[
              { value: '', label: 'Ambos' },
              { value: 'PSS-10', label: 'PSS-10' },
              { value: 'PCL-5', label: 'PCL-5' },
            ]}
          />
          <div className="hidden sm:block h-5 w-px bg-slate-200" aria-hidden="true" />
          <SlicerPills
            label="Momento"
            accent="indigo"
            value={crossMomento}
            onChange={(val) => setCrossMomento(val)}
            options={[
              { value: '', label: 'Todos' },
              { value: 'INICIAL', label: 'INICIAL' },
              { value: 'FINAL', label: 'FINAL' },
            ]}
          />
          <div className="hidden sm:block h-5 w-px bg-slate-200" aria-hidden="true" />
          <SlicerPills
            label="Estado"
            accent="slate"
            value={crossEstado}
            onChange={(val) => setCrossEstado(val)}
            options={[
              { value: '', label: 'Todos' },
              { value: 'COMPLETADA_EN_VENTANA', label: 'En ventana' },
              { value: 'COMPLETADA_TARDIA', label: 'Tardía' },
              { value: 'PENDIENTE_EN_VENTANA', label: 'Pendiente' },
              { value: 'VENCIDA', label: 'Vencida' },
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
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-teal-600 text-white text-[10px] font-bold">
              {activeFilterCount}
            </span>
          )}
          {filtersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </section>

      {filtersOpen && (
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Fecha de corte
            </label>
            <input
              type="date"
              value={corte}
              onChange={(e) => setCorte(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Programa
            </label>
            <select
              value={idPrograma}
              onChange={(e) => setIdPrograma(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white"
            >
              <option value="">Todos</option>
              {programasFiltrados.map((p) => (
                <option key={p.id_programa} value={String(p.id_programa)}>
                  {p.codigo_programa}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Facultad
            </label>
            <select
              value={facultad}
              onChange={(e) => setFacultad(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white"
            >
              <option value="">Todas</option>
              {(filtros?.facultades || []).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Categoría evento (PCL-5)
            </label>
            <select
              value={categoriaEvento}
              onChange={(e) => setCategoriaEvento(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white"
            >
              <option value="">Todas</option>
              {(filtros?.categoriasEvento || []).map((c) => (
                <option key={c.id_categoria_evento} value={c.codigo_categoria}>
                  {c.codigo_categoria} · {c.nombre_categoria}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setIdPrograma('');
                setFacultad('');
                setInstrumento('');
                setCategoriaEvento('');
                setCrossMomento('');
                setCrossEstado('');
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Limpiar
            </button>
          </div>
        </section>
      )}

      {/* Cross-Filter Banner */}
      <CrossFilterBanner
        items={crossFilterItems}
        onClearAll={() => {
          setCrossMomento('');
          setCrossEstado('');
        }}
      />

      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* KPIs */}
      {loading && !data ? (
        <KpiGridSkeleton count={4} />
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            code="KPI-04 · CUMPLIMIENTO"
            title={crossMomento ? `Cumplimiento (${crossMomento})` : 'Tasa de Cumplimiento'}
            value={
              effectiveKpi?.suprimido
                ? 'SUPRIMIDO'
                : effectiveKpi?.tasa_cumplimiento != null
                  ? `${Number(effectiveKpi.tasa_cumplimiento).toFixed(1)}%`
                  : '—'
            }
            subtitle={`${effectiveKpi?.elegibles_completadas ?? 0} de ${effectiveKpi?.elegibles ?? 0} elegibles`}
            metaLabel="Meta ≥ 90.0%"
            semaforo={effectiveKpi?.semaforo || 'SIN_DATOS'}
            accent="indigo"
            Icon={ClipboardCheck}
          />
          <KpiCard
            code="EN VENTANA"
            title="Completadas en Ventana"
            value={String(effectiveKpi?.completadas_en_ventana ?? 0)}
            subtitle={`Tardías: ${effectiveKpi?.completadas_tardias ?? 0}`}
            accent="emerald"
            Icon={CheckCircle2}
          />
          <KpiCard
            code="PENDIENTES"
            title="Pendientes en Ventana"
            value={String(effectiveKpi?.pendientes_en_ventana ?? 0)}
            subtitle="Aún dentro de plazo operativo"
            accent="teal"
            Icon={Clock}
          />
          <KpiCard
            code="VENCIDAS"
            title="Oportunidades Vencidas"
            value={String(effectiveKpi?.vencidas ?? 0)}
            subtitle="Requieren gestión o reprogramación"
            accent="rose"
            Icon={XCircle}
          />
        </section>
      )}

      {/* Visuals: Barras Apiladas por Momento (INICIAL vs FINAL) + Gauge KPI-04 */}
      {loading && !data ? (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7">
            <ChartSkeleton height={320} />
          </div>
          <div className="lg:col-span-5">
            <ChartSkeleton height={320} />
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <ChartCard
            className="lg:col-span-7"
            title="Cumplimiento por Momento (INICIAL vs. FINAL)"
            subtitle="Barras apiladas por estado para detectar exactamente en qué momento se concentran atrasos o vencimientos."
            contextBadge={`${oportunidadesRaw.length} oportunidades`}
            option={chartMomentoStackedOption}
            height={320}
            ariaLabel="Barras apiladas de cumplimiento por momento INICIAL y FINAL"
            exportFilename={`RO02_momento_apilado_${corte}.png`}
            interactiveHint
            onItemClick={(params) => {
              const momentoClicked = params.name === 'INICIAL' || params.name === 'FINAL' ? params.name : '';
              const mapEstado: Record<string, string> = {
                'En ventana': 'COMPLETADA_EN_VENTANA',
                Tardía: 'COMPLETADA_TARDIA',
                Pendiente: 'PENDIENTE_EN_VENTANA',
                Vencida: 'VENCIDA',
              };
              const estadoClicked = params.seriesName ? mapEstado[params.seriesName] || '' : '';

              if (
                crossMomento === momentoClicked &&
                crossEstado === estadoClicked
              ) {
                setCrossMomento('');
                setCrossEstado('');
              } else {
                setCrossMomento(momentoClicked);
                setCrossEstado(estadoClicked);
              }
            }}
          />

          <ChartCard
            className="lg:col-span-5"
            title="Velocímetro KPI-04 vs. Meta (90%)"
            subtitle="Porcentaje de oportunidades elegibles completadas a la fecha de corte."
            contextBadge={crossMomento ? `Momento: ${crossMomento}` : 'Global'}
            option={chartGaugeKpi04Option}
            height={320}
            ariaLabel="Velocímetro de cumplimiento KPI-04"
            exportFilename={`RO02_gauge_kpi04_${corte}.png`}
          />
        </section>
      )}

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs text-slate-600">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <strong>Trazabilidad psicométrica:</strong> Solo las parejas con evaluación INICIAL y FINAL completadas en ventana (y mismo evento índice en PCL-5) conforman un <strong>Par válido</strong> para los reportes gerenciales RG-01 y RG-02.
        </p>
      </div>

      {/* PowerDataTable */}
      {loading && !data ? (
        <TableSkeleton rows={6} />
      ) : (
        <PowerDataTable
          title="Registro Detallado de Oportunidades de Evaluación"
          subtitle="Ordena por puntaje, fecha o estado, busca por estudiante y exporta la selección actual a Excel (CSV UTF-8)."
          caption="Tabla operativa de control de evaluaciones PSS-10 y PCL-5"
          data={oportunidadesFiltradas}
          columns={columns}
          initialSorting={[{ id: 'estado_evaluacion', desc: true }]}
          searchPlaceholder="Buscar código, facultad o programa..."
          csvFilename={`RO02_cumplimiento_${corte}.csv`}
          csvColumns={[
            { header: 'Código Anonimizado', accessor: (r) => r.codigo_anonimizado },
            { header: 'Facultad / Área', accessor: (r) => r.facultad_o_area },
            { header: 'Programa', accessor: (r) => r.codigo_programa },
            { header: 'Instrumento', accessor: (r) => r.codigo_instrumento },
            { header: 'Momento', accessor: (r) => r.momento },
            { header: 'Fecha Prevista', accessor: (r) => r.fecha_prevista || '' },
            { header: 'Fecha Realización', accessor: (r) => r.fecha_realizacion || '' },
            { header: 'Puntaje Total', accessor: (r) => r.puntaje_total ?? '' },
            { header: 'Par Válido', accessor: (r) => (r.par_valido ? 'SI' : 'NO') },
            { header: 'Estado Evaluación', accessor: (r) => r.estado_evaluacion },
          ]}
        />
      )}
    </div>
  );
}
