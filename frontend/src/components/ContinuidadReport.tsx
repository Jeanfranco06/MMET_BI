'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  Info,
  LogOut,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { AiReportButton } from './AiReportButton';
import { KpiCard } from './KpiCard';
import { ChartCard } from './ChartCard';
import { DataBarCell, PowerDataTable } from './PowerDataTable';
import { CrossFilterBanner, PowerBiHintBadge, SlicerPills } from './PowerBiControls';
import { ChartSkeleton, KpiGridSkeleton, TableSkeleton } from './UiStates';
import { CHART_COLORS } from '@/lib/chartTheme';

interface ContinuidadReportProps {
  filtros: FiltrosResponse | null;
  corteInicial: string;
  semestre: string;
}

interface EstudianteContinuidadRow {
  id_asignacion: number;
  codigo_anonimizado: string;
  facultad_o_area: string;
  ciclo_academico: number;
  codigo_programa: string;
  codigo_practica: string;
  nombre_practica: string;
  sesiones_exigibles: number;
  asistencias: number;
  inasistencias: number;
  asistencia_pct: number;
  primera_asistencia: string | null;
  ultima_asistencia: string | null;
  es_evaluable: boolean;
  estado_continuidad: string;
}

type FunnelStage = 'TODOS' | 'EVALUABLES' | 'CONTINUAN' | 'ACTIVOS';

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

const ESTADO_LABELS: Record<string, string> = {
  ACTIVO: 'Activo',
  EN_RIESGO: 'En riesgo',
  ABANDONO: 'Abandono',
  RETIRADO: 'Retirado',
  NO_EVALUABLE: 'No evaluable',
};

export function ContinuidadReport({ filtros, corteInicial, semestre }: ContinuidadReportProps) {
  const [corte, setCorte] = useState(corteInicial);
  const [idPrograma, setIdPrograma] = useState('');
  const [idPractica, setIdPractica] = useState('');
  const [facultad, setFacultad] = useState('');
  const [ciclo, setCiclo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Segmentador / Cross-filtering local instantáneo
  const [crossEstado, setCrossEstado] = useState<string>('');
  const [crossStage, setCrossStage] = useState<FunnelStage | null>(null);

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCrossEstado('');
    setCrossStage(null);
  }, [semestre, corte, idPrograma, idPractica, facultad, ciclo]);

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
        page: 1,
        pageSize: 250,
      });
      setData(res);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el reporte de continuidad y abandono.');
    } finally {
      setLoading(false);
    }
  }, [corte, semestre, idPrograma, idPractica, facultad, ciclo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const activeFilterCount = [idPrograma, idPractica, facultad, ciclo].filter(Boolean).length;
  const rt = data?.resumen_total;
  const estudiantesRaw: EstudianteContinuidadRow[] = data?.estudiantes || [];

  const programasFiltrados = (filtros?.programas || []).filter(
    (p) => !semestre || p.periodo_academico === semestre,
  );

  // Filas filtradas por Cross-Filtering (Donut / Embudo / Slicer)
  const estudiantesFiltrados = useMemo(() => {
    return estudiantesRaw.filter((e) => {
      if (crossEstado) {
        if (crossEstado === 'NO_EVALUABLE') {
          if (e.es_evaluable) return false;
        } else if (e.estado_continuidad !== crossEstado) {
          return false;
        }
      }
      if (crossStage) {
        if (crossStage === 'EVALUABLES' && !e.es_evaluable) return false;
        if (
          crossStage === 'CONTINUAN' &&
          !(e.estado_continuidad === 'ACTIVO' || e.estado_continuidad === 'EN_RIESGO')
        ) {
          return false;
        }
        if (crossStage === 'ACTIVOS' && e.estado_continuidad !== 'ACTIVO') return false;
      }
      return true;
    });
  }, [estudiantesRaw, crossEstado, crossStage]);

  // Visual 1: Embudo (Funnel) de Retención Estudiantil
  const chartFunnelOption = useMemo(() => {
    if (!rt) return null;
    const total = Number(rt.total_registros || 0);
    const evaluables = Number(rt.evaluables || 0);
    const continuan = Number(rt.continuan || 0);
    const activos = Number(rt.activos || 0);

    if (total === 0) return null;

    const pct = (v: number) => ((v / Math.max(1, total)) * 100).toFixed(1);
    const opacityFor = (stage: FunnelStage) => (!crossStage || crossStage === stage ? 1 : 0.28);

    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: any) =>
          `<div style="font-weight:700;margin-bottom:4px">${p.name}</div>
           <div>Estudiantes: <strong style="color:#5EEAD4">${p.value}</strong> (${pct(p.value)}% del total)</div>
           <div style="color:#94A3B8;font-size:11px;margin-top:3px">Clic para filtrar la tabla</div>`,
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
          label: {
            show: true,
            position: 'inside',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: 12,
            formatter: (p: any) => `${p.name}: ${p.value} (${pct(p.value)}%)`,
          },
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 2,
            borderRadius: 6,
          },
          data: [
            {
              value: total,
              name: 'Total registrados',
              itemStyle: { color: '#334155', opacity: opacityFor('TODOS') },
            },
            {
              value: evaluables,
              name: 'Evaluables (≥ 3 ses.)',
              itemStyle: { color: '#0284C7', opacity: opacityFor('EVALUABLES') },
            },
            {
              value: continuan,
              name: 'Continúan (Activos + En riesgo)',
              itemStyle: { color: '#0D9488', opacity: opacityFor('CONTINUAN') },
            },
            {
              value: activos,
              name: 'Activos',
              itemStyle: { color: '#059669', opacity: opacityFor('ACTIVOS') },
            },
          ],
        },
      ],
    };
  }, [rt, crossStage]);

  // Visual 2: Anillo (Donut) Interactivo de Estados
  const chartDonutOption = useMemo(() => {
    if (!rt) return null;
    const rawSlices = [
      { key: 'ACTIVO', name: 'Activo', value: Number(rt.activos ?? 0), color: CHART_COLORS.emerald },
      { key: 'EN_RIESGO', name: 'En riesgo', value: Number(rt.en_riesgo ?? 0), color: CHART_COLORS.amber },
      { key: 'ABANDONO', name: 'Abandono', value: Number(rt.abandono ?? 0), color: CHART_COLORS.rose },
      { key: 'RETIRADO', name: 'Retirado', value: Number(rt.retirados ?? 0), color: CHART_COLORS.slate },
      { key: 'NO_EVALUABLE', name: 'No evaluable', value: Number(rt.no_evaluables ?? 0), color: CHART_COLORS.sky },
    ].filter((s) => s.value > 0);

    if (rawSlices.length === 0) return null;

    return {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: <strong>{c}</strong> estudiantes ({d}%)<br/><span style="color:#94A3B8;font-size:11px">Clic para filtrar la tabla</span>',
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
          name: 'Estado continuidad',
          type: 'pie',
          radius: ['52%', '76%'],
          center: ['50%', '43%'],
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: {
            scale: true,
            scaleSize: 6,
            label: { show: true, fontSize: 13, fontWeight: 'bold', color: '#0F172A' },
          },
          data: rawSlices.map((s) => ({
            value: s.value,
            name: s.name,
            itemStyle: {
              color: s.color,
              opacity: !crossEstado || crossEstado === s.key ? 1 : 0.25,
            },
          })),
        },
      ],
    };
  }, [rt, crossEstado]);

  // Columnas PowerDataTable
  const columns = useMemo<ColumnDef<EstudianteContinuidadRow, any>[]>(
    () => [
      {
        accessorKey: 'codigo_anonimizado',
        header: 'Estudiante',
        cell: ({ row }) => (
          <div>
            <div className="font-bold text-slate-900 tabular-nums">
              {row.original.codigo_anonimizado}
            </div>
            <div className="text-[11px] text-slate-500">
              {row.original.facultad_o_area} · Ciclo {row.original.ciclo_academico}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'codigo_programa',
        header: 'Programa / Práctica',
        cell: ({ row }) => (
          <div>
            <div className="font-semibold text-slate-800">
              {compactPrograma(row.original.codigo_programa)}
            </div>
            <div className="text-[11px] text-slate-500">{row.original.nombre_practica}</div>
          </div>
        ),
      },
      {
        accessorKey: 'asistencias',
        header: 'Asist. / Exigibles',
        cell: ({ row }) => (
          <span className="tabular-nums font-semibold text-slate-800">
            {row.original.asistencias}{' '}
            <span className="text-slate-400 font-normal">/ {row.original.sesiones_exigibles}</span>
          </span>
        ),
      },
      {
        accessorKey: 'asistencia_pct',
        header: '% Asistencia',
        cell: ({ row }) => {
          const pct = Number(row.original.asistencia_pct || 0);
          return (
            <DataBarCell
              value={pct}
              max={100}
              display={`${pct.toFixed(1)}%`}
              tone={pct >= 75 ? 'emerald' : pct >= 50 ? 'amber' : 'rose'}
            />
          );
        },
      },
      {
        accessorKey: 'ultima_asistencia',
        header: 'Última asistencia',
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-slate-600">
            {formatFechaEs(row.original.ultima_asistencia)}
          </span>
        ),
      },
      {
        accessorKey: 'estado_continuidad',
        header: 'Estado',
        cell: ({ row }) => (
          <EstadoContinuidadBadge
            estado={row.original.es_evaluable ? row.original.estado_continuidad : 'NO_EVALUABLE'}
          />
        ),
      },
    ],
    [],
  );

  const crossFilterItems = useMemo(() => {
    const items: Array<{ label: string; value: string; onClear: () => void }> = [];
    if (crossEstado) {
      items.push({
        label: 'Estado',
        value: ESTADO_LABELS[crossEstado] || crossEstado,
        onClear: () => setCrossEstado(''),
      });
    }
    if (crossStage) {
      const stageLabels: Record<FunnelStage, string> = {
        TODOS: 'Total registrados',
        EVALUABLES: 'Evaluables (≥ 3 ses.)',
        CONTINUAN: 'Continúan (Activos + En riesgo)',
        ACTIVOS: 'Activos',
      };
      items.push({
        label: 'Etapa embudo',
        value: stageLabels[crossStage],
        onClear: () => setCrossStage(null),
      });
    }
    return items;
  }, [crossEstado, crossStage]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold tracking-wider uppercase">
              RO-01 · Reporte Operativo
            </span>
            <PowerBiHintBadge />
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              Corte: <strong className="text-slate-700">{formatFechaEs(data?.corte || corte)}</strong>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Continuidad, Asistencia y Alerta de Abandono
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Seguimiento de retención (KPI-03) por estudiante evaluable (≥ 3 sesiones exigibles). Haz clic en el embudo o el anillo para filtrar casos al instante.
          </p>
        </div>

        <AiReportButton
          reporte="RO-01"
          corte={data?.corte || corte}
          filtros={{
            semestre: semestre || 'TODOS',
            facultad: facultad || 'TODAS',
            estado_cruzado: crossEstado || 'TODOS',
          }}
          kpis={rt || null}
          grupos={(data?.por_programa || [])
            .filter((p: any) => !p.suprimido && Number(p.evaluables || 0) >= 5)
            .map((p: any) => ({
              nombre: p.codigo_programa,
              n: Number(p.evaluables || 0),
              valor: p.tasa_continuidad,
              semaforo: p.semaforo,
            }))}
          disabled={loading || !data}
        />
      </div>

      {/* Power BI Visual Slicers */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <SlicerPills
          label="Estado continuidad"
          value={crossEstado}
          onChange={(val) => setCrossEstado(val)}
          options={[
            { value: '', label: 'Todos', count: rt?.total_registros },
            { value: 'ACTIVO', label: 'Activo', count: rt?.activos },
            { value: 'EN_RIESGO', label: 'En riesgo', count: rt?.en_riesgo },
            { value: 'ABANDONO', label: 'Abandono', count: rt?.abandono },
            { value: 'RETIRADO', label: 'Retirado', count: rt?.retirados },
            { value: 'NO_EVALUABLE', label: 'No evaluable', count: rt?.no_evaluables },
          ]}
        />

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
              Práctica
            </label>
            <select
              value={idPractica}
              onChange={(e) => setIdPractica(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white"
            >
              <option value="">Todas</option>
              {(filtros?.practicas || []).map((p) => (
                <option key={p.id_practica} value={String(p.id_practica)}>
                  {p.codigo_practica} · {p.nombre_practica}
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
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setIdPrograma('');
                setIdPractica('');
                setFacultad('');
                setCiclo('');
                setCrossEstado('');
                setCrossStage(null);
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
          setCrossEstado('');
          setCrossStage(null);
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
            code="KPI-03 · CONTINUIDAD"
            title="Tasa de Continuidad"
            value={
              rt?.suprimido
                ? 'SUPRIMIDO'
                : rt?.tasa_continuidad != null
                  ? `${Number(rt.tasa_continuidad).toFixed(1)}%`
                  : '—'
            }
            subtitle={`${rt?.continuan ?? 0} de ${rt?.evaluables ?? 0} evaluables`}
            metaLabel="Meta ≥ 80.0%"
            semaforo={rt?.semaforo || 'SIN_DATOS'}
            accent="teal"
            Icon={UserCheck}
          />
          <KpiCard
            code="COBERTURA"
            title="Asistencia Acumulada"
            value={rt?.asistencia_pct != null ? `${Number(rt.asistencia_pct).toFixed(1)}%` : '—'}
            subtitle={`${rt?.asistencias ?? 0} de ${rt?.sesiones_exigibles ?? 0} sesiones exigibles`}
            accent="indigo"
            Icon={Users}
          />
          <KpiCard
            code="ALERTA TEMPRANA"
            title="Estudiantes En Riesgo"
            value={String(rt?.en_riesgo ?? 0)}
            subtitle="Requieren seguimiento preventivo"
            accent="amber"
            Icon={AlertTriangle}
          />
          <KpiCard
            code="DESERCIÓN"
            title="Abandono / Retiro"
            value={`${rt?.abandono ?? 0} / ${rt?.retirados ?? 0}`}
            subtitle={`No evaluables (< 3 ses.): ${rt?.no_evaluables ?? 0}`}
            accent="rose"
            Icon={UserX}
          />
        </section>
      )}

      {/* Visuals: Funnel de Retención + Donut de Estados */}
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
            title="Embudo de Retención Estudiantil"
            subtitle="Flujo desde el total de inscritos hasta estudiantes evaluables, que continúan y activos."
            contextBadge={`${rt?.total_registros ?? 0} registros`}
            option={chartFunnelOption}
            height={320}
            ariaLabel="Embudo de retención estudiantil"
            exportFilename={`RO01_embudo_retencion_${corte}.png`}
            interactiveHint
            onItemClick={(params) => {
              const mapStage: Record<string, FunnelStage> = {
                'Total registrados': 'TODOS',
                'Evaluables (≥ 3 ses.)': 'EVALUABLES',
                'Continúan (Activos + En riesgo)': 'CONTINUAN',
                Activos: 'ACTIVOS',
              };
              const target = mapStage[params.name];
              if (!target) return;
              if (target === 'TODOS') {
                setCrossStage(null);
              } else {
                setCrossStage((prev) => (prev === target ? null : target));
              }
            }}
          />

          <ChartCard
            className="lg:col-span-5"
            title="Distribución por Estado de Continuidad"
            subtitle="Haz clic en un segmento del anillo para filtrar los estudiantes en la tabla inferior."
            contextBadge={`${estudiantesFiltrados.length} visibles`}
            option={chartDonutOption}
            height={320}
            ariaLabel="Gráfico de anillo de estados de continuidad"
            exportFilename={`RO01_estados_continuidad_${corte}.png`}
            interactiveHint
            onItemClick={(params) => {
              const mapState: Record<string, string> = {
                Activo: 'ACTIVO',
                'En riesgo': 'EN_RIESGO',
                Abandono: 'ABANDONO',
                Retirado: 'RETIRADO',
                'No evaluable': 'NO_EVALUABLE',
              };
              const target = mapState[params.name];
              if (!target) return;
              setCrossEstado((prev) => (prev === target ? '' : target));
            }}
          />
        </section>
      )}

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs text-slate-600">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <strong>Criterio operativo KPI-03:</strong> Se consideran evaluables los estudiantes con al menos 3 sesiones exigibles a la fecha de corte. Los registros se identifican exclusivamente por código anonimizado.
        </p>
      </div>

      {/* PowerDataTable */}
      {loading && !data ? (
        <TableSkeleton rows={6} />
      ) : (
        <PowerDataTable
          title="Seguimiento Individual de Continuidad (Anonimizado)"
          subtitle="Ordena por % de asistencia o estado, filtra por código/facultad y exporta a Excel (CSV UTF-8)."
          caption="Tabla operativa de continuidad y asistencia estudiantil"
          data={estudiantesFiltrados}
          columns={columns}
          initialSorting={[{ id: 'asistencia_pct', desc: false }]}
          searchPlaceholder="Buscar código, facultad o programa..."
          csvFilename={`RO01_continuidad_${corte}.csv`}
          csvColumns={[
            { header: 'Código Anonimizado', accessor: (r) => r.codigo_anonimizado },
            { header: 'Facultad / Área', accessor: (r) => r.facultad_o_area },
            { header: 'Ciclo', accessor: (r) => r.ciclo_academico },
            { header: 'Programa', accessor: (r) => r.codigo_programa },
            { header: 'Práctica', accessor: (r) => r.nombre_practica },
            { header: 'Asistencias', accessor: (r) => r.asistencias },
            { header: 'Sesiones Exigibles', accessor: (r) => r.sesiones_exigibles },
            { header: '% Asistencia', accessor: (r) => r.asistencia_pct.toFixed(1) },
            { header: 'Última Asistencia', accessor: (r) => r.ultima_asistencia || '' },
            {
              header: 'Estado Continuidad',
              accessor: (r) => (r.es_evaluable ? r.estado_continuidad : 'NO_EVALUABLE'),
            },
          ]}
        />
      )}
    </div>
  );
}
