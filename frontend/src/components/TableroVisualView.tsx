'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  HeartPulse,
  Table2,
  Target,
  UserCheck,
  Users,
  UserX,
  XCircle,
} from 'lucide-react';
import {
  api,
  type FiltrosResponse,
  type ImpactoPracticaRow,
  type ImpactoPracticasResponse,
} from '@/lib/api';
import { AiReportButton } from './AiReportButton';
import { ChartCard } from './ChartCard';
import { KpiCard } from './KpiCard';
import { CrossFilterBanner, PowerBiHintBadge, SlicerPills } from './PowerBiControls';
import { ChartSkeleton, KpiGridSkeleton } from './UiStates';
import {
  CHART_COLORS,
  EXECUTIVE_AXIS_LABEL,
  EXECUTIVE_SPLIT_LINE,
  barGradient,
} from '@/lib/chartTheme';

type VisualTabId = 'evolucion' | 'practicas' | 'continuidad' | 'cumplimiento';
type ReportTarget = 'evolucion' | 'practicas' | 'continuidad' | 'cumplimiento';
type DirectionFilter = 'DISMINUYERON' | 'SIN_CAMBIO' | 'AUMENTARON';
type FunnelStage = 'TODOS' | 'EVALUABLES' | 'CONTINUAN' | 'ACTIVOS';

interface TableroVisualViewProps {
  filtros: FiltrosResponse | null;
  corte: string;
  semestre: string;
  facultadGlobal: string;
  practicaGlobal: string;
  programaGlobal: string;
  onNavigateReport: (target: ReportTarget) => void;
}

const VISUAL_TABS: Array<{
  id: VisualTabId;
  label: string;
  kpiBadge: string;
  reportCode: string;
  Icon: typeof Activity;
}> = [
  {
    id: 'evolucion',
    label: 'Evolución Estrés y Trauma',
    kpiBadge: 'KPI-01 · KPI-02',
    reportCode: 'RG-01',
    Icon: Activity,
  },
  {
    id: 'practicas',
    label: 'Efectividad por Práctica',
    kpiBadge: 'KPI-05',
    reportCode: 'RG-02',
    Icon: Award,
  },
  {
    id: 'continuidad',
    label: 'Continuidad Estudiantil',
    kpiBadge: 'KPI-03',
    reportCode: 'RO-01',
    Icon: Users,
  },
  {
    id: 'cumplimiento',
    label: 'Control de Evaluaciones',
    kpiBadge: 'KPI-04',
    reportCode: 'RO-02',
    Icon: ClipboardCheck,
  },
];

function formatFechaEs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function compactLabel(raw?: string): string {
  if (!raw) return '—';
  const match = raw.match(/(P-\d{2}|MIXTO)-(C\d{2})$/);
  if (match) return `${match[1]} · ${match[2]}`;
  return raw.length > 26 ? `${raw.slice(0, 24)}…` : raw;
}

export function TableroVisualView({
  corte,
  semestre,
  facultadGlobal,
  practicaGlobal,
  programaGlobal,
  onNavigateReport,
}: TableroVisualViewProps) {
  const [activeTab, setActiveTab] = useState<VisualTabId>('evolucion');
  const tabBaseId = useId();
  const tabRefs = useRef<Record<VisualTabId, HTMLButtonElement | null>>({
    evolucion: null,
    practicas: null,
    continuidad: null,
    cumplimiento: null,
  });

  // =========================================================================
  // TAB 1 STATE: EVOLUCIÓN (RG-01)
  // =========================================================================
  const [evInst, setEvInst] = useState<'' | 'PSS-10' | 'PCL-5'>('');
  const [evAgrupar, setEvAgrupar] = useState<'programa' | 'facultad' | 'grupo_etario'>('programa');
  const [evDumbbellInst, setEvDumbbellInst] = useState<'PSS-10' | 'PCL-5'>('PSS-10');
  const [evCrossDim, setEvCrossDim] = useState<string | null>(null);
  const [evCrossDir, setEvCrossDir] = useState<DirectionFilter | null>(null);
  const [evData, setEvData] = useState<any | null>(null);
  const [evLoading, setEvLoading] = useState(false);

  // =========================================================================
  // TAB 2 STATE: EFECTIVIDAD POR PRÁCTICA (RG-02)
  // =========================================================================
  const [prInst, setPrInst] = useState<'PSS-10' | 'PCL-5'>('PSS-10');
  const [prVista, setPrVista] = useState<'practica' | 'programa'>('practica');
  const [prCrossKey, setPrCrossKey] = useState<string | null>(null);
  const [prData, setPrData] = useState<ImpactoPracticasResponse | null>(null);
  const [prLoading, setPrLoading] = useState(false);

  // =========================================================================
  // TAB 3 STATE: CONTINUIDAD (RO-01)
  // =========================================================================
  const [coCrossEstado, setCoCrossEstado] = useState<string>('');
  const [coCrossStage, setCoCrossStage] = useState<FunnelStage | null>(null);
  const [coData, setCoData] = useState<any | null>(null);
  const [coLoading, setCoLoading] = useState(false);

  // =========================================================================
  // TAB 4 STATE: CUMPLIMIENTO (RO-02)
  // =========================================================================
  const [cuInst, setCuInst] = useState<'' | 'PSS-10' | 'PCL-5'>('');
  const [cuCrossMomento, setCuCrossMomento] = useState<'' | 'INICIAL' | 'FINAL'>('');
  const [cuCrossEstado, setCuCrossEstado] = useState<string>('');
  const [cuData, setCuData] = useState<any | null>(null);
  const [cuLoading, setCuLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (evInst === 'PSS-10' || evInst === 'PCL-5') setEvDumbbellInst(evInst);
  }, [evInst]);

  // Fetchers per tab (lazy on activeTab)
  useEffect(() => {
    if (activeTab !== 'evolucion') return;
    let mounted = true;
    setEvLoading(true);
    setError(null);
    setEvCrossDim(null);
    setEvCrossDir(null);
    api
      .getEvolucion({
        corte,
        semestre: semestre || undefined,
        facultad: facultadGlobal || undefined,
        id_practica: practicaGlobal || undefined,
        id_programa: programaGlobal || undefined,
        instrumento: evInst || undefined,
        agrupar_por: evAgrupar,
        page: 1,
        pageSize: 100,
      })
      .then((res) => {
        if (mounted) setEvData(res);
      })
      .catch((e: any) => {
        if (mounted) setError(e.message || 'Error al cargar Evolución.');
      })
      .finally(() => {
        if (mounted) setEvLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, corte, semestre, facultadGlobal, practicaGlobal, programaGlobal, evInst, evAgrupar]);

  useEffect(() => {
    if (activeTab !== 'practicas') return;
    let mounted = true;
    setPrLoading(true);
    setError(null);
    setPrCrossKey(null);
    api
      .getImpactoPracticas({
        instrumento: prInst,
        corte,
        semestre: semestre || undefined,
        facultad: facultadGlobal || undefined,
      })
      .then((res) => {
        if (mounted) setPrData(res);
      })
      .catch((e: any) => {
        if (mounted) setError(e.message || 'Error al cargar Efectividad por Práctica.');
      })
      .finally(() => {
        if (mounted) setPrLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, corte, semestre, facultadGlobal, prInst]);

  useEffect(() => {
    if (activeTab !== 'continuidad') return;
    let mounted = true;
    setCoLoading(true);
    setError(null);
    setCoCrossEstado('');
    setCoCrossStage(null);
    api
      .getContinuidad({
        corte,
        semestre: semestre || undefined,
        facultad: facultadGlobal || undefined,
        id_practica: practicaGlobal || undefined,
        id_programa: programaGlobal || undefined,
        page: 1,
        pageSize: 250,
      })
      .then((res) => {
        if (mounted) setCoData(res);
      })
      .catch((e: any) => {
        if (mounted) setError(e.message || 'Error al cargar Continuidad.');
      })
      .finally(() => {
        if (mounted) setCoLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, corte, semestre, facultadGlobal, practicaGlobal, programaGlobal]);

  useEffect(() => {
    if (activeTab !== 'cumplimiento') return;
    let mounted = true;
    setCuLoading(true);
    setError(null);
    setCuCrossMomento('');
    setCuCrossEstado('');
    api
      .getCumplimiento({
        corte,
        semestre: semestre || undefined,
        facultad: facultadGlobal || undefined,
        id_programa: programaGlobal || undefined,
        instrumento: cuInst || undefined,
        page: 1,
        pageSize: 300,
      })
      .then((res) => {
        if (mounted) setCuData(res);
      })
      .catch((e: any) => {
        if (mounted) setError(e.message || 'Error al cargar Control de Evaluaciones.');
      })
      .finally(() => {
        if (mounted) setCuLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, corte, semestre, facultadGlobal, programaGlobal, cuInst]);

  // Keyboard navigation for tabs (modern-web-guidance: tabs — selection by activation)
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % VISUAL_TABS.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + VISUAL_TABS.length) % VISUAL_TABS.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = VISUAL_TABS.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      const targetTab = VISUAL_TABS[nextIdx];
      const btn = tabRefs.current[targetTab.id];
      btn?.focus();
      btn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  // =========================================================================
  // TAB 1 COMPUTATIONS & CHARTS (EVOLUCIÓN)
  // =========================================================================
  const evFilas: any[] = evData?.filas || [];
  const evTotalesRaw: any[] = evData?.totales_por_instrumento || [];
  const evEffectiveTotals = useMemo(() => {
    if (!evCrossDim) return evTotalesRaw;
    return (['PSS-10', 'PCL-5'] as const)
      .map((inst) => evFilas.find((r) => r.codigo_instrumento === inst && r.dim_clave === evCrossDim))
      .filter(Boolean);
  }, [evCrossDim, evTotalesRaw, evFilas]);

  const evPssTotal = evEffectiveTotals.find((t) => t.codigo_instrumento === 'PSS-10');
  const evPclTotal = evEffectiveTotals.find((t) => t.codigo_instrumento === 'PCL-5');

  const evDumbbellRows = useMemo(() => {
    const activeInst = evInst || evDumbbellInst;
    return evFilas
      .filter(
        (r) =>
          r.codigo_instrumento === activeInst &&
          !r.suprimido &&
          r.promedio_inicial != null &&
          r.promedio_final != null,
      )
      .sort((a, b) => Number(b.reduccion_promedio ?? 0) - Number(a.reduccion_promedio ?? 0))
      .slice(0, 12);
  }, [evFilas, evInst, evDumbbellInst]);

  const evChartDumbbell = useMemo(() => {
    if (evDumbbellRows.length === 0) return null;
    const activeInst = evInst || evDumbbellInst;
    const maxScale = activeInst === 'PSS-10' ? 40 : 80;

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const idx = params?.[0]?.dataIndex ?? 0;
          const row = evDumbbellRows[idx];
          if (!row) return '';
          const delta = Number(row.reduccion_promedio ?? 0);
          return `<div style="font-weight:700;margin-bottom:4px">${row.dim_clave} (${row.codigo_instrumento})</div>
            <div>Promedio Inicial: <strong>${Number(row.promedio_inicial).toFixed(2)}</strong> pts</div>
            <div>Promedio Final: <strong style="color:#5EEAD4">${Number(row.promedio_final).toFixed(2)}</strong> pts</div>
            <div>Reducción: <strong style="color:${delta >= 0 ? '#34D399' : '#FB7185'}">${delta > 0 ? '+' : ''}${delta.toFixed(2)} pts</strong></div>
            <div style="color:#94A3B8;font-size:11px;margin-top:3px">n = ${row.pares_validos} pares · Clic para filtrar</div>`;
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
      grid: { left: 16, right: 32, top: 34, bottom: 26, containLabel: true },
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
        data: evDumbbellRows.map((r) => compactLabel(r.dim_clave)),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisTick: { show: false },
        axisLabel: { ...EXECUTIVE_AXIS_LABEL, width: 135, overflow: 'truncate' },
      },
      series: [
        {
          name: 'Cambio',
          type: 'custom',
          z: 1,
          renderItem: (_params: any, apiChart: any) => {
            const yIdx = apiChart.value(0);
            const xIni = apiChart.value(1);
            const xFin = apiChart.value(2);
            const start = apiChart.coord([xIni, yIdx]);
            const end = apiChart.coord([xFin, yIdx]);
            const row = evDumbbellRows[yIdx];
            const isSelected = !evCrossDim || row?.dim_clave === evCrossDim;
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
          data: evDumbbellRows.map((r, i) => [i, Number(r.promedio_inicial), Number(r.promedio_final)]),
        },
        {
          name: 'Promedio Inicial',
          type: 'scatter',
          symbolSize: 11,
          z: 3,
          data: evDumbbellRows.map((r, i) => {
            const isSelected = !evCrossDim || r.dim_clave === evCrossDim;
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
              const row = evDumbbellRows[p.dataIndex];
              if (!row || row.reduccion_promedio == null) return '';
              const d = Number(row.reduccion_promedio);
              return d >= 0 ? `-${d.toFixed(1)}` : `+${Math.abs(d).toFixed(1)}`;
            },
          },
          data: evDumbbellRows.map((r, i) => {
            const isSelected = !evCrossDim || r.dim_clave === evCrossDim;
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
              label: { color: improved ? '#0F766E' : '#BE123C', opacity: isSelected ? 1 : 0.3 },
            };
          }),
        },
      ],
    };
  }, [evDumbbellRows, evInst, evDumbbellInst, evCrossDim]);

  const evChartStacked100 = useMemo(() => {
    const validTotals = evEffectiveTotals.filter((t) => !t.suprimido && t.pares_validos >= 5);
    if (validTotals.length === 0) return null;
    const toPct = (val: number | null, total: number) =>
      total > 0 ? Number((((val || 0) / total) * 100).toFixed(1)) : 0;
    const op = (dir: DirectionFilter) => (!evCrossDir || evCrossDir === dir ? 1 : 0.28);

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
            <div><span style="color:#FB7185">●</span> Aumentaron: <strong>${row.aumentaron}</strong> (${toPct(row.aumentaron, total)}%)</div>`;
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
          itemStyle: { color: CHART_COLORS.emerald, opacity: op('DISMINUYERON'), borderRadius: [6, 0, 0, 6] },
          label: { show: true, position: 'inside', color: '#fff', fontSize: 11, fontWeight: 700, formatter: (p: any) => (p.value >= 8 ? `${p.value}%` : '') },
          data: validTotals.map((t) => toPct(t.disminuyeron, t.pares_validos)),
        },
        {
          name: 'Sin cambio',
          type: 'bar',
          stack: 'pct',
          barMaxWidth: 38,
          itemStyle: { color: CHART_COLORS.slate, opacity: op('SIN_CAMBIO') },
          label: { show: true, position: 'inside', color: '#fff', fontSize: 11, fontWeight: 700, formatter: (p: any) => (p.value >= 8 ? `${p.value}%` : '') },
          data: validTotals.map((t) => toPct(t.sin_cambio, t.pares_validos)),
        },
        {
          name: 'Aumentaron',
          type: 'bar',
          stack: 'pct',
          barMaxWidth: 38,
          itemStyle: { color: CHART_COLORS.rose, opacity: op('AUMENTARON'), borderRadius: [0, 6, 6, 0] },
          label: { show: true, position: 'inside', color: '#fff', fontSize: 11, fontWeight: 700, formatter: (p: any) => (p.value >= 8 ? `${p.value}%` : '') },
          data: validTotals.map((t) => toPct(t.aumentaron, t.pares_validos)),
        },
      ],
    };
  }, [evEffectiveTotals, evCrossDir]);

  // =========================================================================
  // TAB 2 COMPUTATIONS & CHARTS (EFECTIVIDAD POR PRÁCTICA)
  // =========================================================================
  const prRowKey = useCallback(
    (r: ImpactoPracticaRow) => (prVista === 'practica' ? r.codigo_practica : r.codigo_programa || r.codigo_practica),
    [prVista],
  );
  const prFilasRaw = useMemo(
    () => (prVista === 'practica' ? prData?.por_practica || [] : prData?.por_programa || []),
    [prData, prVista],
  );
  const prEvaluables = useMemo(
    () =>
      prFilasRaw
        .filter(
          (r): r is ImpactoPracticaRow & { reduccion_promedio: number } =>
            !r.suprimido && r.reduccion_promedio != null,
        )
        .sort((a, b) => Number(b.reduccion_promedio) - Number(a.reduccion_promedio)),
    [prFilasRaw],
  );
  const prMetaPts = prData?.meta_operativa_pts ?? (prInst === 'PSS-10' ? 4 : 10);
  const prKpi05 = prData?.kpi05_meta_practicas;
  const prSelectedRow = prCrossKey ? prFilasRaw.find((r) => prRowKey(r) === prCrossKey) || null : null;
  const prLider = prSelectedRow && !prSelectedRow.suprimido ? prSelectedRow : prEvaluables[0] || null;

  const prChartHorizontal = useMemo(() => {
    const items = prEvaluables.slice(0, 12);
    if (items.length === 0) return null;
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const r = items[params[0].dataIndex];
          if (!r) return '';
          return `<div style="font-weight:700;margin-bottom:4px">${prVista === 'practica' ? `${r.codigo_practica} · ${r.nombre_practica}` : r.codigo_programa}</div>
            <div>Reducción ${prInst}: <strong style="color:#5EEAD4">+${r.reduccion_promedio.toFixed(2)} pts</strong></div>
            <div style="color:#94A3B8;font-size:11px">n = ${r.pares_validos} pares · Meta ≥ ${prMetaPts.toFixed(1)} pts · Clic para resaltar</div>`;
        },
      },
      grid: { left: 16, right: 38, top: 28, bottom: 26, containLabel: true },
      xAxis: {
        type: 'value',
        name: `Reducción ${prInst} (pts)`,
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
          prVista === 'practica' ? `${r.codigo_practica} · ${r.nombre_practica.slice(0, 18)}` : compactLabel(r.codigo_programa),
        ),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisTick: { show: false },
        axisLabel: EXECUTIVE_AXIS_LABEL,
      },
      series: [
        {
          name: `Reducción ${prInst}`,
          type: 'bar',
          barMaxWidth: 28,
          label: { show: true, position: 'right', fontSize: 11, fontWeight: 700, color: '#334155', formatter: (p: any) => `+${Number(p.value).toFixed(1)}` },
          data: items.map((r) => {
            const key = prRowKey(r);
            const isSelected = !prCrossKey || prCrossKey === key;
            return {
              name: key,
              value: Number(r.reduccion_promedio.toFixed(2)),
              itemStyle: {
                borderRadius: [0, 8, 8, 0],
                color:
                  r.reduccion_promedio >= prMetaPts
                    ? barGradient('#10B981', '#059669')
                    : r.reduccion_promedio > 0
                      ? barGradient('#F59E0B', '#D97706')
                      : barGradient('#F43F5E', '#E11D48'),
                opacity: isSelected ? 1 : 0.25,
              },
            };
          }),
          markLine: {
            symbol: ['none', 'none'],
            silent: true,
            lineStyle: { color: '#0F766E', type: 'dashed', width: 2 },
            label: {
              formatter: `Meta ≥ ${prMetaPts.toFixed(1)} pts`,
              position: 'insideEndTop',
              color: '#0F766E',
              fontSize: 11,
              fontWeight: 700,
              backgroundColor: 'rgba(240,253,250,0.95)',
              padding: [3, 6],
              borderRadius: 6,
            },
            data: [{ xAxis: prMetaPts }],
          },
        },
      ],
    };
  }, [prEvaluables, prInst, prMetaPts, prVista, prCrossKey, prRowKey]);

  const prChartGauge = useMemo(() => {
    if (!prKpi05) return null;
    const tasa = prKpi05.tasa_cumplimiento_meta ?? 0;
    return {
      tooltip: {
        formatter: () =>
          `<strong>KPI-05 (${prInst})</strong><br/>Cumplen meta: <strong>${prKpi05.practicas_cumplen_meta} de ${prKpi05.practicas_evaluables}</strong>`,
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
          axisLine: { lineStyle: { width: 16, color: [[0.5, '#F43F5E'], [0.8, '#F59E0B'], [1, '#10B981']] } },
          pointer: { icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z', length: '52%', width: 8, offsetCenter: [0, '-18%'], itemStyle: { color: '#0F172A' } },
          axisTick: { distance: -16, length: 5, lineStyle: { color: '#fff', width: 1 } },
          splitLine: { distance: -16, length: 16, lineStyle: { color: '#fff', width: 2 } },
          axisLabel: { color: '#64748B', distance: 22, fontSize: 10, formatter: '{value}%' },
          title: { offsetCenter: [0, '24%'], fontSize: 11, color: '#64748B', fontWeight: 600 },
          detail: {
            valueAnimation: true,
            formatter: () => (prKpi05.tasa_cumplimiento_meta != null ? `${prKpi05.tasa_cumplimiento_meta.toFixed(1)}%` : 'N/A'),
            color: '#0F172A',
            fontSize: 24,
            fontWeight: 800,
            offsetCenter: [0, '2%'],
          },
          data: [{ value: Number(tasa.toFixed(1)), name: 'Meta ≥ 80% prácticas' }],
        },
      ],
    };
  }, [prKpi05, prInst]);

  const prChartScatter = useMemo(() => {
    if (prEvaluables.length === 0) return null;
    const maxN = Math.max(15, ...prEvaluables.map((r) => r.pares_validos));
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const r = prEvaluables[params.dataIndex];
          if (!r) return '';
          return `<div style="font-weight:700;margin-bottom:4px">${prVista === 'practica' ? `${r.codigo_practica} · ${r.nombre_practica}` : r.codigo_programa}</div>
            <div>Pares válidos: <strong>n = ${r.pares_validos}</strong></div>
            <div>Reducción ${prInst}: <strong style="color:#5EEAD4">+${r.reduccion_promedio.toFixed(2)} pts</strong></div>`;
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
        name: `Reducción ${prInst} (pts)`,
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
              const r = prEvaluables[p.dataIndex];
              return r ? (prVista === 'practica' ? r.codigo_practica : compactLabel(r.codigo_programa)) : '';
            },
          },
          data: prEvaluables.map((r) => {
            const key = prRowKey(r);
            const isSelected = !prCrossKey || prCrossKey === key;
            return {
              name: key,
              value: [r.pares_validos, Number(r.reduccion_promedio.toFixed(2))],
              itemStyle: {
                color: r.cumple_meta ? '#10B981' : '#F59E0B',
                borderColor: isSelected ? '#0F172A' : '#ffffff',
                borderWidth: prCrossKey === key ? 3 : 1.5,
                opacity: isSelected ? 0.9 : 0.22,
              },
            };
          }),
          markLine: {
            symbol: ['none', 'none'],
            silent: true,
            data: [
              { yAxis: prMetaPts, lineStyle: { color: '#0F766E', type: 'dashed', width: 1.5 }, label: { formatter: `Meta ≥ ${prMetaPts.toFixed(1)} pts`, color: '#0F766E', fontSize: 10 } },
              { xAxis: 5, lineStyle: { color: '#94A3B8', type: 'dotted', width: 1.5 }, label: { formatter: 'n = 5', color: '#64748B', fontSize: 10 } },
            ],
          },
        },
      ],
    };
  }, [prEvaluables, prInst, prMetaPts, prVista, prCrossKey, prRowKey]);

  // =========================================================================
  // TAB 3 COMPUTATIONS & CHARTS (CONTINUIDAD)
  // =========================================================================
  const coRt = coData?.resumen_total;
  const coChartFunnel = useMemo(() => {
    if (!coRt || coRt.suprimido || Number(coRt.total_registros || 0) === 0) return null;
    const total = Number(coRt.total_registros || 0);
    const pct = (v: number) => ((v / Math.max(1, total)) * 100).toFixed(1);
    const op = (st: FunnelStage) => (!coCrossStage || coCrossStage === st ? 1 : 0.28);

    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: any) =>
          `<div style="font-weight:700;margin-bottom:4px">${p.name}</div>
           <div>Estudiantes: <strong style="color:#5EEAD4">${p.value}</strong> (${pct(p.value)}%)</div>`,
      },
      series: [
        {
          name: 'Flujo de retención',
          type: 'funnel',
          left: '8%',
          right: '8%',
          top: 16,
          bottom: 16,
          minSize: '28%',
          maxSize: '96%',
          sort: 'none',
          gap: 6,
          label: { show: true, position: 'inside', color: '#ffffff', fontWeight: 700, fontSize: 12, formatter: (p: any) => `${p.name}: ${p.value} (${pct(p.value)}%)` },
          itemStyle: { borderColor: '#ffffff', borderWidth: 2, borderRadius: 6 },
          data: [
            { value: total, name: 'Total registrados', itemStyle: { color: '#334155', opacity: op('TODOS') } },
            { value: Number(coRt.evaluables || 0), name: 'Evaluables (≥ 3 ses.)', itemStyle: { color: '#0284C7', opacity: op('EVALUABLES') } },
            { value: Number(coRt.continuan || 0), name: 'Continúan (Activos + En riesgo)', itemStyle: { color: '#0D9488', opacity: op('CONTINUAN') } },
            { value: Number(coRt.activos || 0), name: 'Activos', itemStyle: { color: '#059669', opacity: op('ACTIVOS') } },
          ],
        },
      ],
    };
  }, [coRt, coCrossStage]);

  const coChartDonut = useMemo(() => {
    if (!coRt || coRt.suprimido) return null;
    const slices = [
      { key: 'ACTIVO', name: 'Activo', value: Number(coRt.activos ?? 0), color: CHART_COLORS.emerald },
      { key: 'EN_RIESGO', name: 'En riesgo', value: Number(coRt.en_riesgo ?? 0), color: CHART_COLORS.amber },
      { key: 'ABANDONO', name: 'Abandono', value: Number(coRt.abandono ?? 0), color: CHART_COLORS.rose },
      { key: 'RETIRADO', name: 'Retirado', value: Number(coRt.retirados ?? 0), color: CHART_COLORS.slate },
      { key: 'NO_EVALUABLE', name: 'No evaluable', value: Number(coRt.no_evaluables ?? 0), color: CHART_COLORS.sky },
    ].filter((s) => s.value > 0);
    if (slices.length === 0) return null;

    return {
      tooltip: { trigger: 'item', formatter: '{b}: <strong>{c}</strong> estudiantes ({d}%)' },
      legend: { bottom: 0, icon: 'circle', itemWidth: 9, itemHeight: 9, textStyle: { color: '#475569', fontSize: 11 } },
      series: [
        {
          name: 'Estado continuidad',
          type: 'pie',
          radius: ['52%', '76%'],
          center: ['50%', '43%'],
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 6, label: { show: true, fontSize: 13, fontWeight: 'bold', color: '#0F172A' } },
          data: slices.map((s) => ({
            value: s.value,
            name: s.name,
            itemStyle: { color: s.color, opacity: !coCrossEstado || coCrossEstado === s.key ? 1 : 0.25 },
          })),
        },
      ],
    };
  }, [coRt, coCrossEstado]);

  // =========================================================================
  // TAB 4 COMPUTATIONS & CHARTS (CUMPLIMIENTO)
  // =========================================================================
  const cuRt = cuData?.resumen_total;
  const cuOps: any[] = cuData?.oportunidades || [];
  const cuEffectiveKpi = useMemo(() => {
    if (!cuCrossMomento) return cuRt;
    const subset = cuOps.filter((o) => o.momento === cuCrossMomento);
    const elegibles = subset.filter((o) => o.es_elegible).length;
    const completadasElegibles = subset.filter((o) => o.es_completada_elegible).length;
    const tasa = elegibles > 0 ? Number(((completadasElegibles / elegibles) * 100).toFixed(1)) : null;
    const semaforo =
      elegibles === 0 ? 'SIN_DATOS' : elegibles < 5 ? 'SUPRIMIDO' : (tasa ?? 0) >= 90 ? 'BUENO' : (tasa ?? 0) >= 75 ? 'REGULAR' : 'MALO';
    return {
      elegibles,
      elegibles_completadas: completadasElegibles,
      completadas_en_ventana: subset.filter((o) => o.estado_evaluacion === 'COMPLETADA_EN_VENTANA').length,
      completadas_tardias: subset.filter((o) => o.estado_evaluacion === 'COMPLETADA_TARDIA').length,
      pendientes_en_ventana: subset.filter((o) => o.estado_evaluacion === 'PENDIENTE_EN_VENTANA').length,
      vencidas: subset.filter((o) => o.estado_evaluacion === 'VENCIDA').length,
      tasa_cumplimiento: elegibles >= 5 ? tasa : null,
      suprimido: elegibles > 0 && elegibles < 5,
      semaforo,
    };
  }, [cuCrossMomento, cuOps, cuRt]);

  const cuChartStacked = useMemo(() => {
    if (cuOps.length === 0 || cuEffectiveKpi?.suprimido) return null;
    const momentos: Array<'INICIAL' | 'FINAL'> = ['INICIAL', 'FINAL'];
    const countBy = (m: 'INICIAL' | 'FINAL', est: string) =>
      cuOps.filter((o) => o.momento === m && o.estado_evaluacion === est).length;
    const op = (m: 'INICIAL' | 'FINAL', est: string) =>
      (!cuCrossMomento || cuCrossMomento === m) && (!cuCrossEstado || cuCrossEstado === est) ? 1 : 0.24;

    const states = [
      { key: 'COMPLETADA_EN_VENTANA', name: 'En ventana', color: CHART_COLORS.emerald },
      { key: 'COMPLETADA_TARDIA', name: 'Tardía', color: CHART_COLORS.amber },
      { key: 'PENDIENTE_EN_VENTANA', name: 'Pendiente', color: CHART_COLORS.sky },
      { key: 'VENCIDA', name: 'Vencida', color: CHART_COLORS.rose },
    ];

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: '#475569', fontSize: 11 } },
      grid: { left: 16, right: 20, top: 38, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: ['INICIAL', 'FINAL'], axisLine: { lineStyle: { color: '#E2E8F0' } }, axisTick: { show: false }, axisLabel: { ...EXECUTIVE_AXIS_LABEL, fontWeight: 700 } },
      yAxis: { type: 'value', name: 'Oportunidades', nameTextStyle: { color: '#64748B', fontSize: 11 }, axisLabel: EXECUTIVE_AXIS_LABEL, splitLine: EXECUTIVE_SPLIT_LINE },
      series: states.map((st) => ({
        name: st.name,
        type: 'bar',
        stack: 'momento',
        barMaxWidth: 68,
        label: { show: true, position: 'inside', color: '#fff', fontSize: 11, fontWeight: 700, formatter: (p: any) => (p.value > 0 ? String(p.value) : '') },
        data: momentos.map((m) => ({
          value: countBy(m, st.key),
          itemStyle: { color: st.color, opacity: op(m, st.key) },
        })),
      })),
    };
  }, [cuOps, cuCrossMomento, cuCrossEstado]);

  const cuChartGauge = useMemo(() => {
    if (!cuEffectiveKpi) return null;
    const tasa = cuEffectiveKpi.suprimido ? 0 : Number(cuEffectiveKpi.tasa_cumplimiento ?? 0);
    return {
      tooltip: {
        formatter: () =>
          `<strong>KPI-04 · Cumplimiento</strong><br/>Completadas elegibles: <strong>${cuEffectiveKpi.elegibles_completadas ?? 0} de ${cuEffectiveKpi.elegibles ?? 0}</strong>`,
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
          axisLine: { lineStyle: { width: 16, color: [[0.75, '#F43F5E'], [0.9, '#F59E0B'], [1, '#10B981']] } },
          pointer: { icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z', length: '52%', width: 8, offsetCenter: [0, '-18%'], itemStyle: { color: '#0F172A' } },
          axisTick: { distance: -16, length: 5, lineStyle: { color: '#fff', width: 1 } },
          splitLine: { distance: -16, length: 16, lineStyle: { color: '#fff', width: 2 } },
          axisLabel: { color: '#64748B', distance: 22, fontSize: 10, formatter: '{value}%' },
          title: { offsetCenter: [0, '24%'], fontSize: 11, color: '#64748B', fontWeight: 600 },
          detail: {
            valueAnimation: true,
            formatter: () =>
              cuEffectiveKpi.suprimido
                ? 'n < 5'
                : cuEffectiveKpi.tasa_cumplimiento != null
                  ? `${Number(cuEffectiveKpi.tasa_cumplimiento).toFixed(1)}%`
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
  }, [cuEffectiveKpi]);

  const currentTabMeta = VISUAL_TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-teal-300 text-[11px] font-bold tracking-wider uppercase">
              Tablero Visual BI
            </span>
            <PowerBiHintBadge />
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              Corte: <strong className="text-slate-700">{formatFechaEs(corte)}</strong>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Visualización Analítica Interactiva · MindMetrics BI
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Explora gráficos interactivos con filtrado cruzado, Modo Enfoque y descarga PNG. Cambia de pestaña para analizar cada proceso.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateReport(activeTab)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-teal-300 hover:bg-teal-50/50 text-slate-700 hover:text-teal-800 text-xs font-semibold shadow-xs transition-colors"
          >
            <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
            Ver tabla fuente en Reporte {currentTabMeta.reportCode}
          </button>

          {activeTab === 'evolucion' && (
            <AiReportButton
              reporte="RG-01"
              corte={evData?.corte || corte}
              filtros={{ semestre: semestre || 'TODOS', instrumento: evInst || 'AMBOS', agrupar_por: evAgrupar }}
              kpis={{ pss10: evPssTotal || null, pcl5: evPclTotal || null }}
              grupos={evFilas
                .filter((r) => !r.suprimido && r.pares_validos >= 5)
                .slice(0, 12)
                .map((r) => ({ nombre: `${r.dim_clave} (${r.codigo_instrumento})`, n: r.pares_validos, instrumento: r.codigo_instrumento, valor: r.reduccion_promedio, semaforo: r.semaforo }))}
              disabled={evLoading || !evData}
            />
          )}
          {activeTab === 'practicas' && (
            <AiReportButton
              reporte="RG-02"
              corte={prData?.corte || corte}
              filtros={{ instrumento: prInst, semestre: semestre || 'TODOS', vista: prVista }}
              kpis={{ kpi05_meta_practicas: prKpi05 || null, meta_operativa_pts: prMetaPts }}
              grupos={prEvaluables.map((r) => ({ nombre: prRowKey(r), n: r.pares_validos, instrumento: prInst, valor: r.reduccion_promedio, semaforo: r.semaforo }))}
              disabled={prLoading || !prData}
            />
          )}
          {activeTab === 'continuidad' && (
            <AiReportButton
              reporte="RO-01"
              corte={coData?.corte || corte}
              filtros={{ semestre: semestre || 'TODOS', estado: coCrossEstado || 'TODOS' }}
              kpis={coRt || null}
              grupos={(coData?.por_programa || [])
                .filter((p: any) => !p.suprimido && Number(p.evaluables || 0) >= 5)
                .map((p: any) => ({ nombre: p.codigo_programa, n: Number(p.evaluables || 0), valor: p.tasa_continuidad, semaforo: p.semaforo }))}
              disabled={coLoading || !coData}
            />
          )}
          {activeTab === 'cumplimiento' && (
            <AiReportButton
              reporte="RO-02"
              corte={cuData?.corte || corte}
              filtros={{ semestre: semestre || 'TODOS', instrumento: cuInst || 'AMBOS', momento: cuCrossMomento || 'AMBOS' }}
              kpis={cuEffectiveKpi || null}
              grupos={
                cuEffectiveKpi && Number(cuEffectiveKpi.elegibles || 0) >= 5
                  ? [{ nombre: cuCrossMomento ? `Cumplimiento ${cuCrossMomento}` : 'Cumplimiento Global', n: Number(cuEffectiveKpi.elegibles || 0), valor: cuEffectiveKpi.tasa_cumplimiento, semaforo: cuEffectiveKpi.semaforo }]
                  : []
              }
              disabled={cuLoading || !cuData}
            />
          )}
        </div>
      </div>

      {/* Accessible Single-Row Scrollable Tablist (modern-web-guidance: tabs) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-2 pt-1.5">
        <div
          role="tablist"
          aria-label="Secciones del Tablero Visual BI"
          className="flex items-center gap-1 overflow-x-auto scroll-smooth"
        >
          {VISUAL_TABS.map((tab, idx) => {
            const selected = activeTab === tab.id;
            const Icon = tab.Icon;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                id={`${tabBaseId}-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={`relative flex-none inline-flex items-center gap-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500 rounded-t-xl ${
                  selected ? 'text-teal-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                    selected ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {tab.kpiBadge}
                </span>
                {/* Non-color-only active shape indicator (border underline, WCAG 1.4.1) */}
                {selected && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 bottom-0 border-b-[3px] border-teal-600 rounded-t-full"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* =================================================================== */}
      {/* PANEL 1: EVOLUCIÓN ESTRÉS Y TRAUMA (KPI-01 · KPI-02)                */}
      {/* =================================================================== */}
      {activeTab === 'evolucion' && (
        <div role="tabpanel" aria-labelledby={`${tabBaseId}-tab-evolucion`} className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-3.5 flex flex-wrap items-center gap-4">
            <SlicerPills
              label="Instrumento"
              value={evInst}
              onChange={(v) => setEvInst(v)}
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
              value={evAgrupar}
              onChange={(v) => setEvAgrupar(v)}
              options={[
                { value: 'programa', label: 'Programa' },
                { value: 'facultad', label: 'Facultad / Área' },
                { value: 'grupo_etario', label: 'Grupo etario' },
              ]}
            />
          </div>

          <CrossFilterBanner
            items={[
              ...(evCrossDim ? [{ label: 'Grupo', value: evCrossDim, onClear: () => setEvCrossDim(null) }] : []),
              ...(evCrossDir ? [{ label: 'Dirección', value: evCrossDir, onClear: () => setEvCrossDir(null) }] : []),
            ]}
            onClearAll={() => {
              setEvCrossDim(null);
              setEvCrossDir(null);
            }}
          />

          {evLoading && !evData ? (
            <>
              <KpiGridSkeleton count={2} />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7"><ChartSkeleton height={340} /></div>
                <div className="lg:col-span-5"><ChartSkeleton height={340} /></div>
              </div>
            </>
          ) : (
            <>
              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <KpiCard
                  code="KPI-01 · PSS-10"
                  title={evCrossDim ? `Estrés Percibido · ${evCrossDim}` : 'Reducción Promedio PSS-10'}
                  value={
                    evPssTotal?.suprimido
                      ? 'SUPRIMIDO'
                      : evPssTotal?.reduccion_promedio != null
                        ? `${evPssTotal.reduccion_promedio > 0 ? '+' : ''}${evPssTotal.reduccion_promedio.toFixed(2)}`
                        : '—'
                  }
                  unit={!evPssTotal?.suprimido && evPssTotal?.reduccion_promedio != null ? 'pts' : undefined}
                  subtitle={
                    evPssTotal
                      ? evPssTotal.suprimido
                        ? 'n < 5 (Suprimido)'
                        : `n = ${evPssTotal.pares_validos} pares · ${evPssTotal.promedio_inicial?.toFixed(1) ?? '—'} → ${evPssTotal.promedio_final?.toFixed(1) ?? '—'}`
                      : 'Sin pares PSS-10'
                  }
                  metaLabel="Meta ≥ 4.0 pts"
                  semaforo={evPssTotal?.semaforo || 'SIN_DATOS'}
                  accent="teal"
                  Icon={Activity}
                />
                <KpiCard
                  code="KPI-02 · PCL-5"
                  title={evCrossDim ? `Síntomas Trauma · ${evCrossDim}` : 'Reducción Promedio PCL-5'}
                  value={
                    evPclTotal?.suprimido
                      ? 'SUPRIMIDO'
                      : evPclTotal?.reduccion_promedio != null
                        ? `${evPclTotal.reduccion_promedio > 0 ? '+' : ''}${evPclTotal.reduccion_promedio.toFixed(2)}`
                        : '—'
                  }
                  unit={!evPclTotal?.suprimido && evPclTotal?.reduccion_promedio != null ? 'pts' : undefined}
                  subtitle={
                    evPclTotal
                      ? evPclTotal.suprimido
                        ? 'n < 5 (Suprimido)'
                        : `n = ${evPclTotal.pares_validos} pares · ${evPclTotal.promedio_inicial?.toFixed(1) ?? '—'} → ${evPclTotal.promedio_final?.toFixed(1) ?? '—'}`
                      : 'Sin pares PCL-5'
                  }
                  metaLabel="Meta ≥ 10.0 pts"
                  semaforo={evPclTotal?.semaforo || 'SIN_DATOS'}
                  accent="indigo"
                  Icon={HeartPulse}
                />
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <ChartCard
                  className="lg:col-span-7"
                  title={`Dumbbell Pre–Post (${evInst || evDumbbellInst})`}
                  subtitle="Promedio Inicial (gris) → Promedio Final (teal). Escala independiente por instrumento."
                  contextBadge={`${evDumbbellRows.length} grupos`}
                  option={evChartDumbbell}
                  height={350}
                  ariaLabel="Gráfico Dumbbell Pre-Post"
                  exportFilename={`tablero_dumbbell_${evInst || evDumbbellInst}_${corte}.png`}
                  interactiveHint
                  extraHeader={
                    !evInst ? (
                      <div className="inline-flex rounded-lg bg-slate-100 p-0.5 mr-1">
                        {(['PSS-10', 'PCL-5'] as const).map((inst) => (
                          <button
                            key={inst}
                            type="button"
                            onClick={() => setEvDumbbellInst(inst)}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                              evDumbbellInst === inst ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500'
                            }`}
                          >
                            {inst}
                          </button>
                        ))}
                      </div>
                    ) : null
                  }
                  onItemClick={(params) => {
                    const row = evDumbbellRows[params.dataIndex];
                    if (row) setEvCrossDim((prev) => (prev === row.dim_clave ? null : row.dim_clave));
                  }}
                />
                <ChartCard
                  className="lg:col-span-5"
                  title="Dirección del Cambio (100 % Apilada)"
                  subtitle="Proporción de pares que disminuyeron, quedaron igual o aumentaron."
                  contextBadge={evCrossDim ? compactLabel(evCrossDim) : 'Global'}
                  option={evChartStacked100}
                  height={350}
                  ariaLabel="Barra apilada al 100% de dirección del cambio"
                  exportFilename={`tablero_direccion_100pct_${corte}.png`}
                  interactiveHint
                  onItemClick={(params) => {
                    const map: Record<string, DirectionFilter> = {
                      Disminuyeron: 'DISMINUYERON',
                      'Sin cambio': 'SIN_CAMBIO',
                      Aumentaron: 'AUMENTARON',
                    };
                    const dir = params.seriesName ? map[params.seriesName] : undefined;
                    if (dir) setEvCrossDir((prev) => (prev === dir ? null : dir));
                  }}
                />
              </section>
            </>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* PANEL 2: EFECTIVIDAD POR PRÁCTICA (KPI-05)                          */}
      {/* =================================================================== */}
      {activeTab === 'practicas' && (
        <div role="tabpanel" aria-labelledby={`${tabBaseId}-tab-practicas`} className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-3.5 flex flex-wrap items-center gap-4">
            <SlicerPills
              label="Instrumento"
              value={prInst}
              onChange={(v) => setPrInst(v)}
              options={[
                { value: 'PSS-10', label: 'PSS-10 (Meta ≥ 4.0 pts)' },
                { value: 'PCL-5', label: 'PCL-5 (Meta ≥ 10.0 pts)' },
              ]}
            />
            <div className="hidden sm:block h-5 w-px bg-slate-200" aria-hidden="true" />
            <SlicerPills
              label="Nivel"
              accent="slate"
              value={prVista}
              onChange={(v) => setPrVista(v)}
              options={[
                { value: 'practica', label: 'Por Práctica' },
                { value: 'programa', label: 'Por Programa / Cohorte' },
              ]}
            />
          </div>

          <CrossFilterBanner
            items={prCrossKey ? [{ label: prVista === 'practica' ? 'Práctica' : 'Programa', value: prCrossKey, onClear: () => setPrCrossKey(null) }] : []}
            onClearAll={() => setPrCrossKey(null)}
          />

          {prLoading && !prData ? (
            <>
              <KpiGridSkeleton count={3} />
              <ChartSkeleton height={320} />
            </>
          ) : (
            <>
              <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard
                  code="KPI-05 · EFECTIVIDAD"
                  title={`Prácticas que cumplen meta (${prInst})`}
                  value={prKpi05?.tasa_cumplimiento_meta != null ? `${prKpi05.tasa_cumplimiento_meta.toFixed(1)}%` : '—'}
                  subtitle={`${prKpi05?.practicas_cumplen_meta ?? 0} de ${prKpi05?.practicas_evaluables ?? 0} evaluables`}
                  metaLabel="Meta ≥ 80.0%"
                  semaforo={prKpi05?.semaforo || 'SIN_DATOS'}
                  accent="teal"
                  Icon={Award}
                />
                <KpiCard
                  code="META OPERATIVA"
                  title={`Umbral mínimo (${prInst})`}
                  value={`≥ ${prMetaPts.toFixed(1)}`}
                  unit="pts"
                  subtitle={prInst === 'PSS-10' ? 'Reducción estrés percibido' : 'Reducción síntomas de trauma'}
                  accent="indigo"
                  Icon={Target}
                />
                <KpiCard
                  code={prSelectedRow ? 'SELECCIÓN CRUZADA' : 'MEJOR DESEMPEÑO'}
                  title={prSelectedRow ? prRowKey(prSelectedRow) : 'Práctica líder en reducción'}
                  value={prLider && prLider.reduccion_promedio != null ? `+${Number(prLider.reduccion_promedio).toFixed(2)}` : 'n < 5'}
                  unit={prLider && prLider.reduccion_promedio != null ? 'pts' : undefined}
                  subtitle={prLider ? `${prRowKey(prLider)} · n = ${prLider.pares_validos} pares` : 'Sin grupos evaluables'}
                  accent="emerald"
                />
              </section>

              <ChartCard
                title={`Ranking Horizontal (${prInst}) vs. Meta Operativa (≥ ${prMetaPts.toFixed(1)} pts)`}
                subtitle="Barras horizontales ordenadas por reducción promedio con línea punteada de meta."
                contextBadge={`${prEvaluables.length} evaluables`}
                option={prChartHorizontal}
                height={320}
                ariaLabel={`Ranking horizontal ${prInst}`}
                exportFilename={`tablero_ranking_${prInst}_${corte}.png`}
                interactiveHint
                onItemClick={(params) => {
                  const row = prEvaluables[params.dataIndex];
                  if (!row) return;
                  const key = prRowKey(row);
                  setPrCrossKey((prev) => (prev === key ? null : key));
                }}
              />

              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <ChartCard
                  className="lg:col-span-4"
                  title="Velocímetro KPI-05"
                  subtitle="% de prácticas que superan la meta operativa."
                  contextBadge={`${prKpi05?.practicas_cumplen_meta ?? 0}/${prKpi05?.practicas_evaluables ?? 0}`}
                  option={prChartGauge}
                  height={300}
                  ariaLabel="Velocímetro KPI-05"
                  exportFilename={`tablero_gauge_kpi05_${prInst}_${corte}.png`}
                />
                <ChartCard
                  className="lg:col-span-8"
                  title="Dispersión: Evidencia (n) vs. Reducción (pts)"
                  subtitle="Distingue técnicas con alta evidencia muestral de grupos pequeños."
                  contextBadge={`n ≥ 5 · Meta ≥ ${prMetaPts.toFixed(1)} pts`}
                  option={prChartScatter}
                  height={300}
                  ariaLabel="Gráfico de dispersión pares válidos vs reducción"
                  exportFilename={`tablero_scatter_${prInst}_${corte}.png`}
                  interactiveHint
                  onItemClick={(params) => {
                    const row = prEvaluables[params.dataIndex];
                    if (!row) return;
                    const key = prRowKey(row);
                    setPrCrossKey((prev) => (prev === key ? null : key));
                  }}
                />
              </section>
            </>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* PANEL 3: CONTINUIDAD ESTUDIANTIL (KPI-03)                           */}
      {/* =================================================================== */}
      {activeTab === 'continuidad' && (
        <div role="tabpanel" aria-labelledby={`${tabBaseId}-tab-continuidad`} className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-3.5">
            <SlicerPills
              label="Estado continuidad"
              value={coCrossEstado}
              onChange={(v) => setCoCrossEstado(v)}
              options={[
                { value: '', label: 'Todos', count: coRt?.suprimido ? undefined : coRt?.total_registros },
                { value: 'ACTIVO', label: 'Activo', count: coRt?.suprimido ? undefined : coRt?.activos },
                { value: 'EN_RIESGO', label: 'En riesgo', count: coRt?.suprimido ? undefined : coRt?.en_riesgo },
                { value: 'ABANDONO', label: 'Abandono', count: coRt?.suprimido ? undefined : coRt?.abandono },
                { value: 'RETIRADO', label: 'Retirado', count: coRt?.suprimido ? undefined : coRt?.retirados },
                { value: 'NO_EVALUABLE', label: 'No evaluable', count: coRt?.suprimido ? undefined : coRt?.no_evaluables },
              ]}
            />
          </div>

          <CrossFilterBanner
            items={[
              ...(coCrossEstado ? [{ label: 'Estado', value: coCrossEstado, onClear: () => setCoCrossEstado('') }] : []),
              ...(coCrossStage ? [{ label: 'Etapa', value: coCrossStage, onClear: () => setCoCrossStage(null) }] : []),
            ]}
            onClearAll={() => {
              setCoCrossEstado('');
              setCoCrossStage(null);
            }}
          />

          {coLoading && !coData ? (
            <>
              <KpiGridSkeleton count={4} />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7"><ChartSkeleton height={330} /></div>
                <div className="lg:col-span-5"><ChartSkeleton height={330} /></div>
              </div>
            </>
          ) : (
            <>
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  code="KPI-03 · CONTINUIDAD"
                  title="Tasa de Continuidad"
                  value={coRt?.suprimido ? 'SUPRIMIDO' : coRt?.tasa_continuidad != null ? `${Number(coRt.tasa_continuidad).toFixed(1)}%` : '—'}
                  subtitle={coRt?.suprimido ? 'n < 5 (Suprimido)' : `${coRt?.continuan ?? 0} de ${coRt?.evaluables ?? 0} evaluables`}
                  metaLabel="Meta ≥ 80.0%"
                  semaforo={coRt?.semaforo || 'SIN_DATOS'}
                  accent="teal"
                  Icon={UserCheck}
                />
                <KpiCard
                  code="COBERTURA"
                  title="Asistencia Acumulada"
                  value={coRt?.suprimido ? 'SUPRIMIDO' : coRt?.asistencia_pct != null ? `${Number(coRt.asistencia_pct).toFixed(1)}%` : '—'}
                  subtitle={coRt?.suprimido ? 'n < 5 (Suprimido)' : `${coRt?.asistencias ?? 0} de ${coRt?.sesiones_exigibles ?? 0} sesiones`}
                  accent="indigo"
                  Icon={Users}
                />
                <KpiCard
                  code="ALERTA TEMPRANA"
                  title="En Riesgo"
                  value={coRt?.suprimido ? 'Suprimido' : String(coRt?.en_riesgo ?? 0)}
                  subtitle={coRt?.suprimido ? 'n < 5' : 'Seguimiento preventivo'}
                  accent="amber"
                  Icon={AlertTriangle}
                />
                <KpiCard
                  code="DESERCIÓN"
                  title="Abandono / Retiro"
                  value={coRt?.suprimido ? 'Suprimido' : `${coRt?.abandono ?? 0} / ${coRt?.retirados ?? 0}`}
                  subtitle={coRt?.suprimido ? 'n < 5' : `No evaluables: ${coRt?.no_evaluables ?? 0}`}
                  accent="rose"
                  Icon={UserX}
                />
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <ChartCard
                  className="lg:col-span-7"
                  title="Embudo de Retención Estudiantil"
                  subtitle="Flujo de inscritos → evaluables (≥ 3 ses.) → continúan → activos."
                  contextBadge={`${coRt?.total_registros ?? 0} registros`}
                  option={coChartFunnel}
                  height={330}
                  ariaLabel="Embudo de retención estudiantil"
                  exportFilename={`tablero_embudo_retencion_${corte}.png`}
                  interactiveHint
                  onItemClick={(params) => {
                    const map: Record<string, FunnelStage> = {
                      'Total registrados': 'TODOS',
                      'Evaluables (≥ 3 ses.)': 'EVALUABLES',
                      'Continúan (Activos + En riesgo)': 'CONTINUAN',
                      Activos: 'ACTIVOS',
                    };
                    const st = map[params.name];
                    if (st === 'TODOS') setCoCrossStage(null);
                    else if (st) setCoCrossStage((prev) => (prev === st ? null : st));
                  }}
                />
                <ChartCard
                  className="lg:col-span-5"
                  title="Distribución por Estado (Donut)"
                  subtitle="Clic en un segmento para resaltar estado."
                  contextBadge={coRt?.suprimido ? 'n < 5 (Suprimido)' : `${coRt?.evaluables ?? 0} evaluables`}
                  option={coChartDonut}
                  height={330}
                  ariaLabel="Anillo de estados de continuidad"
                  exportFilename={`tablero_donut_continuidad_${corte}.png`}
                  interactiveHint
                  onItemClick={(params) => {
                    const map: Record<string, string> = {
                      Activo: 'ACTIVO',
                      'En riesgo': 'EN_RIESGO',
                      Abandono: 'ABANDONO',
                      Retirado: 'RETIRADO',
                      'No evaluable': 'NO_EVALUABLE',
                    };
                    const target = map[params.name];
                    if (target) setCoCrossEstado((prev) => (prev === target ? '' : target));
                  }}
                />
              </section>
            </>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* PANEL 4: CONTROL DE EVALUACIONES (KPI-04)                           */}
      {/* =================================================================== */}
      {activeTab === 'cumplimiento' && (
        <div role="tabpanel" aria-labelledby={`${tabBaseId}-tab-cumplimiento`} className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-3.5 flex flex-wrap items-center gap-4">
            <SlicerPills
              label="Instrumento"
              value={cuInst}
              onChange={(v) => setCuInst(v)}
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
              value={cuCrossMomento}
              onChange={(v) => setCuCrossMomento(v)}
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
              value={cuCrossEstado}
              onChange={(v) => setCuCrossEstado(v)}
              options={[
                { value: '', label: 'Todos' },
                { value: 'COMPLETADA_EN_VENTANA', label: 'En ventana' },
                { value: 'COMPLETADA_TARDIA', label: 'Tardía' },
                { value: 'PENDIENTE_EN_VENTANA', label: 'Pendiente' },
                { value: 'VENCIDA', label: 'Vencida' },
              ]}
            />
          </div>

          <CrossFilterBanner
            items={[
              ...(cuCrossMomento ? [{ label: 'Momento', value: cuCrossMomento, onClear: () => setCuCrossMomento('') }] : []),
              ...(cuCrossEstado ? [{ label: 'Estado', value: cuCrossEstado, onClear: () => setCuCrossEstado('') }] : []),
            ]}
            onClearAll={() => {
              setCuCrossMomento('');
              setCuCrossEstado('');
            }}
          />

          {cuLoading && !cuData ? (
            <>
              <KpiGridSkeleton count={4} />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7"><ChartSkeleton height={330} /></div>
                <div className="lg:col-span-5"><ChartSkeleton height={330} /></div>
              </div>
            </>
          ) : (
            <>
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  code="KPI-04 · CUMPLIMIENTO"
                  title={cuCrossMomento ? `Cumplimiento (${cuCrossMomento})` : 'Tasa de Cumplimiento'}
                  value={cuEffectiveKpi?.suprimido ? 'SUPRIMIDO' : cuEffectiveKpi?.tasa_cumplimiento != null ? `${Number(cuEffectiveKpi.tasa_cumplimiento).toFixed(1)}%` : '—'}
                  subtitle={cuEffectiveKpi?.suprimido ? 'n < 5 (Suprimido)' : `${cuEffectiveKpi?.elegibles_completadas ?? 0} de ${cuEffectiveKpi?.elegibles ?? 0} elegibles`}
                  metaLabel="Meta ≥ 90.0%"
                  semaforo={cuEffectiveKpi?.semaforo || 'SIN_DATOS'}
                  accent="indigo"
                  Icon={ClipboardCheck}
                />
                <KpiCard
                  code="EN VENTANA"
                  title="Completadas en Ventana"
                  value={cuEffectiveKpi?.suprimido ? 'Suprimido' : String(cuEffectiveKpi?.completadas_en_ventana ?? 0)}
                  subtitle={cuEffectiveKpi?.suprimido ? 'n < 5' : `Tardías: ${cuEffectiveKpi?.completadas_tardias ?? 0}`}
                  accent="emerald"
                  Icon={CheckCircle2}
                />
                <KpiCard
                  code="PENDIENTES"
                  title="Pendientes en Ventana"
                  value={cuEffectiveKpi?.suprimido ? 'Suprimido' : String(cuEffectiveKpi?.pendientes_en_ventana ?? 0)}
                  subtitle={cuEffectiveKpi?.suprimido ? 'n < 5' : 'Dentro de plazo'}
                  accent="teal"
                  Icon={Clock}
                />
                <KpiCard
                  code="VENCIDAS"
                  title="Oportunidades Vencidas"
                  value={cuEffectiveKpi?.suprimido ? 'Suprimido' : String(cuEffectiveKpi?.vencidas ?? 0)}
                  subtitle={cuEffectiveKpi?.suprimido ? 'n < 5' : 'Requieren gestión'}
                  accent="rose"
                  Icon={XCircle}
                />
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <ChartCard
                  className="lg:col-span-7"
                  title="Cumplimiento por Momento (INICIAL vs. FINAL)"
                  subtitle="Barras apiladas por estado para detectar atrasos por etapa."
                  contextBadge={`${cuOps.length} oportunidades`}
                  option={cuChartStacked}
                  height={330}
                  ariaLabel="Barras apiladas por momento INICIAL y FINAL"
                  exportFilename={`tablero_momento_apilado_${corte}.png`}
                  interactiveHint
                  onItemClick={(params) => {
                    const m = params.name === 'INICIAL' || params.name === 'FINAL' ? params.name : '';
                    const map: Record<string, string> = {
                      'En ventana': 'COMPLETADA_EN_VENTANA',
                      Tardía: 'COMPLETADA_TARDIA',
                      Pendiente: 'PENDIENTE_EN_VENTANA',
                      Vencida: 'VENCIDA',
                    };
                    const e = params.seriesName ? map[params.seriesName] || '' : '';
                    if (cuCrossMomento === m && cuCrossEstado === e) {
                      setCuCrossMomento('');
                      setCuCrossEstado('');
                    } else {
                      setCuCrossMomento(m);
                      setCuCrossEstado(e);
                    }
                  }}
                />
                <ChartCard
                  className="lg:col-span-5"
                  title="Velocímetro KPI-04 vs. Meta (90%)"
                  subtitle="Cumplimiento de oportunidades elegibles al corte."
                  contextBadge={cuCrossMomento || 'Global'}
                  option={cuChartGauge}
                  height={330}
                  ariaLabel="Velocímetro KPI-04"
                  exportFilename={`tablero_gauge_kpi04_${corte}.png`}
                />
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
