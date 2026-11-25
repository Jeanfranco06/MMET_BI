'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import {
  Activity,
  Calendar,
  ChevronDown,
  ChevronUp,
  Filter,
  HeartPulse,
  Info,
  X,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { AiReportButton } from './AiReportButton';
import { KpiCard } from './KpiCard';
import { ChartCard } from './ChartCard';
import { SemaforoBadge } from './SemaforoBadge';
import { DataBarCell, PowerDataTable } from './PowerDataTable';
import { CrossFilterBanner, PowerBiHintBadge, SlicerPills } from './PowerBiControls';
import { ChartSkeleton, KpiGridSkeleton, TableSkeleton } from './UiStates';
import {
  CHART_COLORS,
  EXECUTIVE_AXIS_LABEL,
  EXECUTIVE_SPLIT_LINE,
} from '@/lib/chartTheme';

interface EvolucionReportProps {
  filtros: FiltrosResponse | null;
  corteInicial: string;
  semestre: string;
}

interface EvolucionRow {
  codigo_instrumento: 'PSS-10' | 'PCL-5';
  dim_clave: string;
  dim_etiqueta?: string;
  pares_validos: number;
  suprimido: boolean;
  promedio_inicial: number | null;
  promedio_final: number | null;
  reduccion_promedio: number | null;
  disminuyeron: number | null;
  sin_cambio: number | null;
  aumentaron: number | null;
  meta_operativa: string;
  semaforo: 'BUENO' | 'REGULAR' | 'MALO' | 'SIN_DATOS' | 'SUPRIMIDO';
}

type DirectionFilter = 'DISMINUYERON' | 'SIN_CAMBIO' | 'AUMENTARON';

function formatFechaEs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function compactLabel(raw: string): string {
  const match = raw.match(/(P-\d{2}|MIXTO)-(C\d{2})$/);
  if (match) return `${match[1]} · ${match[2]}`;
  return raw.length > 26 ? `${raw.slice(0, 24)}…` : raw;
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
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Selector de escala para Dumbbell (evita mezclar 0–40 y 0–80 cuando instrumento = Todos)
  const [dumbbellInst, setDumbbellInst] = useState<'PSS-10' | 'PCL-5'>('PSS-10');

  // Cross-filtering local instantáneo estilo Power BI
  const [crossDimKey, setCrossDimKey] = useState<string | null>(null);
  const [crossDirection, setCrossDirection] = useState<DirectionFilter | null>(null);

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (instrumento === 'PSS-10' || instrumento === 'PCL-5') {
      setDumbbellInst(instrumento);
    }
  }, [instrumento]);

  useEffect(() => {
    setCrossDimKey(null);
    setCrossDirection(null);
  }, [agruparPor, semestre, corte, instrumento]);

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
        page: 1,
        pageSize: 100,
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
    setCrossDimKey(null);
    setCrossDirection(null);
  };

  const activeFilterCount = [
    facultad,
    idPractica,
    idPrograma,
    grupoEtario,
    sexo,
    categoriaEvento,
  ].filter(Boolean).length;

  const programasFiltrados = (filtros?.programas || []).filter(
    (p) => !semestre || p.periodo_academico === semestre,
  );

  const filasRaw: EvolucionRow[] = data?.filas || [];
  const totalesRaw: EvolucionRow[] = data?.totales_por_instrumento || [];

  // Filas filtradas por Cross-Filtering
  const filasCrossFiltradas = useMemo(() => {
    return filasRaw.filter((r) => {
      if (crossDimKey && r.dim_clave !== crossDimKey) return false;
      if (crossDirection) {
        if (r.suprimido) return false;
        if (crossDirection === 'DISMINUYERON' && Number(r.disminuyeron || 0) <= 0) return false;
        if (crossDirection === 'SIN_CAMBIO' && Number(r.sin_cambio || 0) <= 0) return false;
        if (crossDirection === 'AUMENTARON' && Number(r.aumentaron || 0) <= 0) return false;
      }
      return true;
    });
  }, [filasRaw, crossDimKey, crossDirection]);

  // Recalcular KPIs si existe crossDimKey activo (respetando estrictamente n >= 5)
  const effectiveTotals = useMemo(() => {
    if (!crossDimKey) return totalesRaw;
    return (['PSS-10', 'PCL-5'] as const)
      .map((inst) => filasRaw.find((r) => r.codigo_instrumento === inst && r.dim_clave === crossDimKey))
      .filter((x): x is EvolucionRow => Boolean(x));
  }, [crossDimKey, totalesRaw, filasRaw]);

  const pssTotal = effectiveTotals.find((t) => t.codigo_instrumento === 'PSS-10');
  const pclTotal = effectiveTotals.find((t) => t.codigo_instrumento === 'PCL-5');

  const etiquetaDimension =
    agruparPor === 'facultad'
      ? 'Facultad / Área'
      : agruparPor === 'grupo_etario'
        ? 'Grupo etario'
        : 'Programa';

  // Visual 1: Gráfico Dumbbell / Pre–Post (Inicial vs. Final por grupo)
  const dumbbellRows = useMemo(() => {
    const activeInst = instrumento || dumbbellInst;
    return filasRaw
      .filter(
        (r) =>
          r.codigo_instrumento === activeInst &&
          !r.suprimido &&
          r.promedio_inicial != null &&
          r.promedio_final != null,
      )
      .sort((a, b) => Number(b.reduccion_promedio ?? 0) - Number(a.reduccion_promedio ?? 0))
      .slice(0, 12);
  }, [filasRaw, instrumento, dumbbellInst]);

  const chartDumbbellOption = useMemo(() => {
    if (dumbbellRows.length === 0) return null;
    const activeInst = instrumento || dumbbellInst;
    const maxScale = activeInst === 'PSS-10' ? 40 : 80;
    const categories = dumbbellRows.map((r) => compactLabel(r.dim_clave));

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const idx = params?.[0]?.dataIndex ?? 0;
          const row = dumbbellRows[idx];
          if (!row) return '';
          const delta = Number(row.reduccion_promedio ?? 0);
          return `<div style="font-weight:700;margin-bottom:4px">${row.dim_clave} (${row.codigo_instrumento})</div>
            <div>Promedio Inicial: <strong>${Number(row.promedio_inicial).toFixed(2)}</strong> pts</div>
            <div>Promedio Final: <strong style="color:#5EEAD4">${Number(row.promedio_final).toFixed(2)}</strong> pts</div>
            <div>Reducción: <strong style="color:${delta >= 0 ? '#34D399' : '#FB7185'}">${delta > 0 ? '+' : ''}${delta.toFixed(2)} pts</strong></div>
            <div style="color:#94A3B8;font-size:11px;margin-top:3px">n = ${row.pares_validos} pares válidos · Clic para filtrar</div>`;
        },
      },
      legend: {
        top: 0,
        right: 0,
        icon: 'circle',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: '#475569', fontSize: 11 },
        data: ['Promedio Inicial', 'Promedio Final'],
      },
      grid: { left: 16, right: 32, top: 34, bottom: 24, containLabel: true },
      xAxis: {
        type: 'value',
        min: 0,
        max: maxScale,
        name: `Puntaje ${activeInst} (0–${maxScale})`,
        nameLocation: 'middle',
        nameGap: 22,
        nameTextStyle: { color: '#64748B', fontSize: 11 },
        axisLabel: EXECUTIVE_AXIS_LABEL,
        splitLine: EXECUTIVE_SPLIT_LINE,
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: categories,
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisTick: { show: false },
        axisLabel: { ...EXECUTIVE_AXIS_LABEL, width: 135, overflow: 'truncate' },
      },
      series: [
        // Conector Dumbbell (línea entre Inicial y Final)
        {
          name: 'Cambio',
          type: 'custom',
          silent: false,
          z: 1,
          renderItem: (_params: any, apiChart: any) => {
            const yIdx = apiChart.value(0);
            const xIni = apiChart.value(1);
            const xFin = apiChart.value(2);
            const start = apiChart.coord([xIni, yIdx]);
            const end = apiChart.coord([xFin, yIdx]);
            const row = dumbbellRows[yIdx];
            const isSelected = !crossDimKey || row?.dim_clave === crossDimKey;
            const improved = xFin <= xIni;

            return {
              type: 'line',
              shape: { x1: start[0], y1: start[1], x2: end[0], y2: end[1] },
              style: {
                stroke: improved ? '#14B8A6' : '#F43F5E',
                lineWidth: isSelected ? 4 : 2,
                opacity: isSelected ? 0.85 : 0.2,
              },
            };
          },
          data: dumbbellRows.map((r, i) => [
            i,
            Number(r.promedio_inicial),
            Number(r.promedio_final),
          ]),
        },
        // Punto Inicial
        {
          name: 'Promedio Inicial',
          type: 'scatter',
          symbolSize: 11,
          z: 3,
          data: dumbbellRows.map((r, i) => {
            const isSelected = !crossDimKey || r.dim_clave === crossDimKey;
            return {
              name: r.dim_clave,
              value: [Number(r.promedio_inicial), i],
              itemStyle: {
                color: '#64748B',
                borderColor: '#ffffff',
                borderWidth: 2,
                opacity: isSelected ? 1 : 0.25,
              },
            };
          }),
        },
        // Punto Final
        {
          name: 'Promedio Final',
          type: 'scatter',
          symbolSize: 13,
          z: 4,
          label: {
            show: true,
            position: 'left',
            distance: 8,
            fontSize: 10,
            fontWeight: 700,
            formatter: (p: any) => {
              const row = dumbbellRows[p.dataIndex];
              if (!row || row.reduccion_promedio == null) return '';
              const d = Number(row.reduccion_promedio);
              return d >= 0 ? `-${d.toFixed(1)}` : `+${Math.abs(d).toFixed(1)}`;
            },
          },
          data: dumbbellRows.map((r, i) => {
            const isSelected = !crossDimKey || r.dim_clave === crossDimKey;
            const improved = Number(r.reduccion_promedio ?? 0) >= 0;
            return {
              name: r.dim_clave,
              value: [Number(r.promedio_final), i],
              itemStyle: {
                color: improved ? '#0D9488' : '#E11D48',
                borderColor: '#ffffff',
                borderWidth: 2,
                opacity: isSelected ? 1 : 0.25,
              },
              label: {
                color: improved ? '#0F766E' : '#BE123C',
                opacity: isSelected ? 1 : 0.3,
              },
            };
          }),
        },
      ],
    };
  }, [dumbbellRows, instrumento, dumbbellInst, crossDimKey]);

  // Visual 2: Barra Apilada al 100 % (Disminuyeron / Sin cambio / Aumentaron)
  const chartStacked100Option = useMemo(() => {
    const validTotals = effectiveTotals.filter((t) => !t.suprimido && t.pares_validos >= 5);
    if (validTotals.length === 0) return null;

    const toPct = (val: number | null, total: number) =>
      total > 0 ? Number((((val || 0) / total) * 100).toFixed(1)) : 0;

    const opacityFor = (dir: DirectionFilter) =>
      !crossDirection || crossDirection === dir ? 1 : 0.28;

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const idx = params?.[0]?.dataIndex ?? 0;
          const row = validTotals[idx];
          if (!row) return '';
          const total = Math.max(1, row.pares_validos);
          return `<div style="font-weight:700;margin-bottom:4px">${row.codigo_instrumento} (n = ${row.pares_validos})</div>
            <div><span style="color:#34D399">●</span> Disminuyeron: <strong>${row.disminuyeron}</strong> (${toPct(row.disminuyeron, total)}%)</div>
            <div><span style="color:#94A3B8">●</span> Sin cambio: <strong>${row.sin_cambio}</strong> (${toPct(row.sin_cambio, total)}%)</div>
            <div><span style="color:#FB7185">●</span> Aumentaron: <strong>${row.aumentaron}</strong> (${toPct(row.aumentaron, total)}%)</div>
            <div style="color:#94A3B8;font-size:11px;margin-top:3px">Clic en un segmento para filtrar la tabla</div>`;
        },
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
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { ...EXECUTIVE_AXIS_LABEL, formatter: '{value}%' },
        splitLine: EXECUTIVE_SPLIT_LINE,
      },
      yAxis: {
        type: 'category',
        data: validTotals.map((t) => `${t.codigo_instrumento}\n(n=${t.pares_validos})`),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisTick: { show: false },
        axisLabel: { ...EXECUTIVE_AXIS_LABEL, fontWeight: 700 },
      },
      series: [
        {
          name: 'Disminuyeron',
          type: 'bar',
          stack: 'pct',
          barMaxWidth: 38,
          itemStyle: {
            color: CHART_COLORS.emerald,
            opacity: opacityFor('DISMINUYERON'),
            borderRadius: [6, 0, 0, 6],
          },
          label: {
            show: true,
            position: 'inside',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            formatter: (p: any) => (p.value >= 8 ? `${p.value}%` : ''),
          },
          data: validTotals.map((t) => toPct(t.disminuyeron, t.pares_validos)),
        },
        {
          name: 'Sin cambio',
          type: 'bar',
          stack: 'pct',
          barMaxWidth: 38,
          itemStyle: {
            color: CHART_COLORS.slate,
            opacity: opacityFor('SIN_CAMBIO'),
          },
          label: {
            show: true,
            position: 'inside',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            formatter: (p: any) => (p.value >= 8 ? `${p.value}%` : ''),
          },
          data: validTotals.map((t) => toPct(t.sin_cambio, t.pares_validos)),
        },
        {
          name: 'Aumentaron',
          type: 'bar',
          stack: 'pct',
          barMaxWidth: 38,
          itemStyle: {
            color: CHART_COLORS.rose,
            opacity: opacityFor('AUMENTARON'),
            borderRadius: [0, 6, 6, 0],
          },
          label: {
            show: true,
            position: 'inside',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            formatter: (p: any) => (p.value >= 8 ? `${p.value}%` : ''),
          },
          data: validTotals.map((t) => toPct(t.aumentaron, t.pares_validos)),
        },
      ],
    };
  }, [effectiveTotals, crossDirection]);

  // Columnas PowerDataTable
  const maxPares = useMemo(
    () => Math.max(10, ...filasCrossFiltradas.map((r) => Number(r.pares_validos || 0))),
    [filasCrossFiltradas],
  );

  const columns = useMemo<ColumnDef<EvolucionRow, any>[]>(
    () => [
      {
        accessorKey: 'dim_clave',
        header: etiquetaDimension,
        cell: ({ row }) => (
          <div>
            <div className="font-bold text-slate-900">{row.original.dim_clave}</div>
            {row.original.dim_etiqueta && row.original.dim_etiqueta !== row.original.dim_clave && (
              <div className="text-[11px] text-slate-500">{row.original.dim_etiqueta}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'codigo_instrumento',
        header: 'Instrumento',
        cell: ({ getValue }) => {
          const val = getValue() as string;
          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${
                val === 'PSS-10'
                  ? 'bg-teal-50 text-teal-800 border border-teal-200'
                  : 'bg-sky-50 text-sky-800 border border-sky-200'
              }`}
            >
              {val}
            </span>
          );
        },
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
            <span className="text-xs text-slate-400 italic">Suprimido (n&lt;5)</span>
          ) : (
            <span className="tabular-nums font-medium text-slate-700">
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
            return <span className="text-xs text-slate-400 italic">Suprimido</span>;
          }
          const red = row.original.reduccion_promedio;
          const maxScale = row.original.codigo_instrumento === 'PSS-10' ? 12 : 25;
          const meta = row.original.codigo_instrumento === 'PSS-10' ? 4 : 10;
          return (
            <DataBarCell
              value={red}
              max={maxScale}
              display={`${red > 0 ? '+' : ''}${red.toFixed(2)} pts`}
              tone={red >= meta ? 'emerald' : red > 0 ? 'amber' : 'rose'}
            />
          );
        },
      },
      {
        id: 'distribucion',
        header: 'Dismin. / Igual / Aum.',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.suprimido ? (
            <span className="text-xs text-slate-400">—</span>
          ) : (
            <div className="flex items-center gap-1.5 text-xs tabular-nums">
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                ↓{row.original.disminuyeron ?? 0}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                ={row.original.sin_cambio ?? 0}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold">
                ↑{row.original.aumentaron ?? 0}
              </span>
            </div>
          ),
      },
      {
        accessorKey: 'semaforo',
        header: 'Semáforo',
        cell: ({ getValue }) => <SemaforoBadge estado={getValue()} />,
      },
    ],
    [etiquetaDimension, maxPares],
  );

  const crossFilterItems = useMemo(() => {
    const list: Array<{ label: string; value: string; onClear: () => void }> = [];
    if (crossDimKey) {
      list.push({
        label: etiquetaDimension,
        value: crossDimKey,
        onClear: () => setCrossDimKey(null),
      });
    }
    if (crossDirection) {
      const dirLabel =
        crossDirection === 'DISMINUYERON'
          ? 'Disminuyeron'
          : crossDirection === 'SIN_CAMBIO'
            ? 'Sin cambio'
            : 'Aumentaron';
      list.push({
        label: 'Dirección del cambio',
        value: dirLabel,
        onClear: () => setCrossDirection(null),
      });
    }
    return list;
  }, [crossDimKey, crossDirection, etiquetaDimension]);

  return (
    <div className="space-y-5">
      {/* Header + AI Assistant */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 text-[11px] font-bold tracking-wider uppercase">
              RG-01 · Reporte Gerencial
            </span>
            <PowerBiHintBadge />
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              Corte: <strong className="text-slate-700">{formatFechaEs(data?.corte || corte)}</strong>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Evolución de Estrés Percibido (PSS-10) y Trauma (PCL-5)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Comparación pre–post de pares válidos en ventana. Escalas estrictamente separadas y supresión estadística cuando n &lt; 5.
          </p>
        </div>

        <AiReportButton
          reporte="RG-01"
          corte={data?.corte || corte}
          filtros={{
            semestre: semestre || 'TODOS',
            facultad: facultad || 'TODAS',
            instrumento: instrumento || 'AMBOS',
            agrupar_por: agruparPor,
            filtro_cruzado: crossDimKey || 'NINGUNO',
          }}
          kpis={{
            pss10: pssTotal || null,
            pcl5: pclTotal || null,
          }}
          grupos={filasCrossFiltradas
            .filter((r) => !r.suprimido && r.pares_validos >= 5)
            .slice(0, 12)
            .map((r) => ({
              nombre: `${r.dim_clave} (${r.codigo_instrumento})`,
              n: r.pares_validos,
              instrumento: r.codigo_instrumento,
              valor: r.reduccion_promedio,
              semaforo: r.semaforo,
            }))}
          disabled={loading || !data}
        />
      </div>

      {/* Power BI Visual Slicers Bar */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <SlicerPills
            label="Instrumento"
            value={instrumento}
            onChange={(val) => setInstrumento(val)}
            options={[
              { value: '', label: 'Todos (Separados)' },
              { value: 'PSS-10', label: 'PSS-10 (0–40)' },
              { value: 'PCL-5', label: 'PCL-5 (0–80)' },
            ]}
          />
          <div className="hidden sm:block h-5 w-px bg-slate-200" aria-hidden="true" />
          <SlicerPills
            label="Agrupar por"
            accent="slate"
            value={agruparPor}
            onChange={(val) => setAgruparPor(val)}
            options={[
              { value: 'programa', label: 'Programa' },
              { value: 'facultad', label: 'Facultad / Área' },
              { value: 'grupo_etario', label: 'Grupo etario' },
            ]}
          />
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold transition-colors self-start xl:self-auto"
        >
          <Filter className="w-3.5 h-3.5" aria-hidden="true" />
          Filtros avanzados
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-teal-600 text-white text-[10px] font-bold">
              {activeFilterCount}
            </span>
          )}
          {filtersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </section>

      {/* Advanced Filters Drawer */}
      {filtersOpen && (
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                Facultad / Área
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
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                Práctica principal
              </label>
              <select
                value={idPractica}
                onChange={(e) => setIdPractica(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              >
                <option value="">Todas las prácticas</option>
                {(filtros?.practicas || []).map((p) => (
                  <option key={p.id_practica} value={String(p.id_practica)}>
                    {p.codigo_practica} · {p.nombre_practica}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                Programa / Cohorte
              </label>
              <select
                value={idPrograma}
                onChange={(e) => setIdPrograma(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              >
                <option value="">Todos los programas</option>
                {programasFiltrados.map((p) => (
                  <option key={p.id_programa} value={String(p.id_programa)}>
                    {p.codigo_programa}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                Grupo etario
              </label>
              <select
                value={grupoEtario}
                onChange={(e) => setGrupoEtario(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              >
                <option value="">Todos</option>
                {(filtros?.gruposEtarios || []).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                Sexo
              </label>
              <select
                value={sexo}
                onChange={(e) => setSexo(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              >
                <option value="">Todos</option>
                {(filtros?.sexos || []).map((s) => (
                  <option key={s} value={s}>
                    {s}
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
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
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
                onClick={limpiarFiltros}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                Restablecer filtros
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Active Cross-Filter Banner */}
      <CrossFilterBanner
        items={crossFilterItems}
        onClearAll={() => {
          setCrossDimKey(null);
          setCrossDirection(null);
        }}
      />

      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {loading && !data ? (
        <KpiGridSkeleton count={2} />
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <KpiCard
            code="KPI-01 · PSS-10 (0–40)"
            title={
              crossDimKey
                ? `Reducción Estrés · ${crossDimKey}`
                : 'Reducción Promedio de Estrés Percibido'
            }
            value={
              pssTotal?.suprimido
                ? 'SUPRIMIDO'
                : pssTotal?.reduccion_promedio != null
                  ? `${pssTotal.reduccion_promedio > 0 ? '+' : ''}${pssTotal.reduccion_promedio.toFixed(2)}`
                  : '—'
            }
            unit={!pssTotal?.suprimido && pssTotal?.reduccion_promedio != null ? 'pts' : undefined}
            subtitle={
              pssTotal
                ? `n = ${pssTotal.pares_validos} pares · Inicial ${pssTotal.promedio_inicial?.toFixed(1) ?? '—'} → Final ${pssTotal.promedio_final?.toFixed(1) ?? '—'}`
                : 'Sin pares PSS-10 en este filtro'
            }
            metaLabel="Meta ≥ 4.0 pts"
            semaforo={pssTotal?.semaforo || 'SIN_DATOS'}
            accent="teal"
            Icon={Activity}
          />
          <KpiCard
            code="KPI-02 · PCL-5 (0–80)"
            title={
              crossDimKey
                ? `Reducción Trauma · ${crossDimKey}`
                : 'Reducción Promedio de Síntomas de Trauma'
            }
            value={
              pclTotal?.suprimido
                ? 'SUPRIMIDO'
                : pclTotal?.reduccion_promedio != null
                  ? `${pclTotal.reduccion_promedio > 0 ? '+' : ''}${pclTotal.reduccion_promedio.toFixed(2)}`
                  : '—'
            }
            unit={!pclTotal?.suprimido && pclTotal?.reduccion_promedio != null ? 'pts' : undefined}
            subtitle={
              pclTotal
                ? `n = ${pclTotal.pares_validos} pares · Inicial ${pclTotal.promedio_inicial?.toFixed(1) ?? '—'} → Final ${pclTotal.promedio_final?.toFixed(1) ?? '—'}`
                : 'Sin pares PCL-5 en este filtro'
            }
            metaLabel="Meta ≥ 10.0 pts"
            semaforo={pclTotal?.semaforo || 'SIN_DATOS'}
            accent="indigo"
            Icon={HeartPulse}
          />
        </section>
      )}

      {/* Power BI Visuals: Dumbbell Pre–Post + 100% Stacked Bar */}
      {loading && !data ? (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7">
            <ChartSkeleton height={340} />
          </div>
          <div className="lg:col-span-5">
            <ChartSkeleton height={340} />
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <ChartCard
            className="lg:col-span-7"
            title={`Dumbbell Pre–Post (${instrumento || dumbbellInst}) por ${etiquetaDimension}`}
            subtitle="Línea de reducción desde el Promedio Inicial (gris) al Promedio Final (teal). Escala independiente por instrumento."
            contextBadge={`${dumbbellRows.length} grupos evaluables`}
            option={chartDumbbellOption}
            height={340}
            ariaLabel={`Gráfico Dumbbell Pre-Post ${instrumento || dumbbellInst} por ${etiquetaDimension}`}
            exportFilename={`RG01_dumbbell_${instrumento || dumbbellInst}_${corte}.png`}
            interactiveHint
            extraHeader={
              !instrumento ? (
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 mr-1">
                  {(['PSS-10', 'PCL-5'] as const).map((inst) => (
                    <button
                      key={inst}
                      type="button"
                      onClick={() => setDumbbellInst(inst)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                        dumbbellInst === inst
                          ? 'bg-white text-teal-700 shadow-xs'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {inst}
                    </button>
                  ))}
                </div>
              ) : null
            }
            onItemClick={(params) => {
              const row = dumbbellRows[params.dataIndex];
              if (!row) return;
              setCrossDimKey((prev) => (prev === row.dim_clave ? null : row.dim_clave));
            }}
          />

          <ChartCard
            className="lg:col-span-5"
            title="Dirección del Cambio (Apilada al 100 %)"
            subtitle="Distribución porcentual de pares que disminuyeron, mantuvieron igual o aumentaron puntaje."
            contextBadge={crossDimKey ? `Filtrado: ${compactLabel(crossDimKey)}` : 'Total periodo'}
            option={chartStacked100Option}
            height={340}
            ariaLabel="Gráfico de barras apiladas al 100% de dirección del cambio"
            exportFilename={`RG01_direccion_100pct_${corte}.png`}
            interactiveHint
            onItemClick={(params) => {
              const mapDir: Record<string, DirectionFilter> = {
                Disminuyeron: 'DISMINUYERON',
                'Sin cambio': 'SIN_CAMBIO',
                Aumentaron: 'AUMENTARON',
              };
              const target = params.seriesName ? mapDir[params.seriesName] : undefined;
              if (!target) return;
              setCrossDirection((prev) => (prev === target ? null : target));
            }}
          />
        </section>
      )}

      {/* Privacy / BI Note */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs text-slate-600">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <strong>Regla de privacidad y rigor BI:</strong> Los promedios y distribuciones se calculan únicamente sobre pares válidos (inicial y final en ventana del mismo estudiante, programa, instrumento y evento índice en PCL-5). Los grupos con <code>n &lt; 5</code> se marcan automáticamente como <strong>SUPRIMIDO</strong>.
        </p>
      </div>

      {/* PowerDataTable */}
      {loading && !data ? (
        <TableSkeleton rows={6} />
      ) : (
        <PowerDataTable
          title={`Matriz Detallada de Evolución por ${etiquetaDimension}`}
          subtitle="Ordena por cualquier columna, busca en tiempo real o exporta los grupos visibles a Excel (CSV UTF-8)."
          caption={`Tabla de evolución PSS-10 y PCL-5 agrupada por ${etiquetaDimension}`}
          data={filasCrossFiltradas}
          columns={columns}
          initialSorting={[{ id: 'reduccion_promedio', desc: true }]}
          searchPlaceholder={`Buscar ${etiquetaDimension.toLowerCase()} o instrumento...`}
          csvFilename={`RG01_evolucion_${agruparPor}_${corte}.csv`}
          csvColumns={[
            { header: etiquetaDimension, accessor: (r) => r.dim_clave },
            { header: 'Instrumento', accessor: (r) => r.codigo_instrumento },
            { header: 'Pares Válidos', accessor: (r) => r.pares_validos },
            { header: 'Suprimido', accessor: (r) => (r.suprimido ? 'SI' : 'NO') },
            { header: 'Promedio Inicial', accessor: (r) => (r.suprimido ? 'SUPRIMIDO' : r.promedio_inicial) },
            { header: 'Promedio Final', accessor: (r) => (r.suprimido ? 'SUPRIMIDO' : r.promedio_final) },
            { header: 'Reducción Promedio (pts)', accessor: (r) => (r.suprimido ? 'SUPRIMIDO' : r.reduccion_promedio) },
            { header: 'Disminuyeron', accessor: (r) => (r.suprimido ? 'SUPRIMIDO' : r.disminuyeron) },
            { header: 'Sin Cambio', accessor: (r) => (r.suprimido ? 'SUPRIMIDO' : r.sin_cambio) },
            { header: 'Aumentaron', accessor: (r) => (r.suprimido ? 'SUPRIMIDO' : r.aumentaron) },
            { header: 'Semáforo', accessor: (r) => r.semaforo },
          ]}
        />
      )}
    </div>
  );
}
