'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Award,
  Calendar,
  ClipboardCheck,
  Database,
  HeartPulse,
  Layers,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api, type FiltrosResponse, type ResumenResponse } from '@/lib/api';
import { KpiCard } from './KpiCard';
import { EChartBox } from './EChartBox';
import { ChartSkeleton, KpiGridSkeleton } from './UiStates';
import {
  CHART_COLORS,
  EXECUTIVE_AXIS_LABEL,
  EXECUTIVE_SPLIT_LINE,
  barGradient,
  metaMarkLine,
} from '@/lib/chartTheme';

type NavTarget = 'evolucion' | 'practicas' | 'continuidad' | 'cumplimiento' | 'operacion';

interface ResumenEjecutivoViewProps {
  filtros: FiltrosResponse | null;
  corte: string;
  semestre: string;
  facultadGlobal: string;
  practicaGlobal: string;
  programaGlobal: string;
  onNavigate: (target: NavTarget) => void;
}

export function ResumenEjecutivoView({
  corte,
  semestre,
  facultadGlobal,
  practicaGlobal,
  programaGlobal,
  onNavigate,
}: ResumenEjecutivoViewProps) {
  const [resumen, setResumen] = useState<ResumenResponse | null>(null);
  const [impactoPss, setImpactoPss] = useState<any | null>(null);
  const [impactoPcl, setImpactoPcl] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      api.getResumen({
        corte,
        facultad: facultadGlobal || undefined,
        id_practica: practicaGlobal || undefined,
        id_programa: programaGlobal || undefined,
      }),
      api.getImpactoPracticas({
        instrumento: 'PSS-10',
        corte,
        semestre: semestre || undefined,
        facultad: facultadGlobal || undefined,
      }),
      api.getImpactoPracticas({
        instrumento: 'PCL-5',
        corte,
        semestre: semestre || undefined,
        facultad: facultadGlobal || undefined,
      }),
    ])
      .then(([res, pss, pcl]) => {
        if (!active) return;
        setResumen(res);
        setImpactoPss(pss);
        setImpactoPcl(pcl);
      })
      .catch((e: any) => {
        if (!active) return;
        setError(e.message || 'No se pudo cargar el resumen ejecutivo del Data Mart.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [corte, semestre, facultadGlobal, practicaGlobal, programaGlobal]);

  const kpi05Pss = impactoPss?.kpi05_meta_practicas;
  const kpi05Pcl = impactoPcl?.kpi05_meta_practicas;

  const chartPracticasPss = useMemo(() => {
    const rows = (impactoPss?.por_practica || []).filter((r: any) => !r.suprimido && r.reduccion_promedio != null);
    return {
      grid: { left: 16, right: 20, top: 28, bottom: 26, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const p = params[0];
          const item = rows[p.dataIndex];
          return `<div style="font-weight:700;margin-bottom:4px">${item.codigo_practica} · ${item.nombre_practica}</div>
            <div>Reducción PSS-10: <strong style="color:#5EEAD4">+${Number(item.reduccion_promedio).toFixed(2)} pts</strong></div>
            <div style="color:#94A3B8;font-size:11px">Pares válidos: n = ${item.pares_validos} · Meta: ≥ 4.0 pts</div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: rows.map((r: any) => r.codigo_practica),
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
          name: 'Reducción PSS-10',
          type: 'bar',
          barMaxWidth: 40,
          data: rows.map((r: any) => ({
            value: Number(r.reduccion_promedio.toFixed(2)),
            itemStyle: {
              borderRadius: [8, 8, 0, 0],
              color: r.cumple_meta
                ? barGradient('#14B8A6', '#0D9488')
                : barGradient('#F59E0B', '#D97706'),
            },
          })),
          markLine: metaMarkLine(4, 'Meta ≥ 4.0 pts', '#0D9488'),
        },
      ],
    };
  }, [impactoPss]);

  const chartContinuidadDonut = useMemo(() => {
    const c = resumen?.kpi03_continuidad;
    if (!c || c.suprimido) return null;
    const data = [
      { value: c.activos ?? 0, name: 'Activos', itemStyle: { color: CHART_COLORS.emerald } },
      { value: c.en_riesgo ?? 0, name: 'En riesgo', itemStyle: { color: CHART_COLORS.amber } },
      { value: c.abandono ?? 0, name: 'Abandono', itemStyle: { color: CHART_COLORS.rose } },
      { value: c.retirados ?? 0, name: 'Retirados', itemStyle: { color: CHART_COLORS.slate } },
    ].filter((d) => d.value > 0);

    return {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: <strong>{c}</strong> ({d}%)',
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
          name: 'Continuidad',
          type: 'pie',
          radius: ['52%', '76%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          data,
        },
      ],
    };
  }, [resumen]);

  return (
    <div className="space-y-6">
      {/* Executive Welcome Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-[#0B1220] text-white p-6 sm:p-7 shadow-card">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 right-10 w-72 h-72 rounded-full bg-teal-500/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-1/3 w-72 h-72 rounded-full bg-indigo-500/15 blur-3xl"
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/15 border border-teal-400/25 px-3 py-1 text-[11px] font-semibold text-teal-300">
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              Resumen Ejecutivo · Data Mart SQL Server (dm.*)
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Tablero Integral de Bienestar Universitario
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Monitoreo consolidado de los 5 indicadores oficiales (<strong className="text-white">KPI-01 a KPI-05</strong>) al corte{' '}
              <strong className="text-teal-300">{corte}</strong>. Haz clic en cualquier indicador para explorar el reporte detallado con análisis asistido por IA.
            </p>
          </div>

          {resumen?.totales && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full xl:w-auto">
              <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[11px] text-slate-400">Estudiantes</div>
                <div className="font-display text-xl font-bold text-white tabular-nums mt-0.5">
                  {resumen.totales.total_estudiantes.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[11px] text-slate-400">Programas</div>
                <div className="font-display text-xl font-bold text-white tabular-nums mt-0.5">
                  {resumen.totales.total_programas.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[11px] text-slate-400">Sesiones</div>
                <div className="font-display text-xl font-bold text-teal-300 tabular-nums mt-0.5">
                  {resumen.totales.sesiones_realizadas.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[11px] text-slate-400">Asistencias</div>
                <div className="font-display text-xl font-bold text-white tabular-nums mt-0.5">
                  {resumen.totales.total_asistencias.toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {error}
        </div>
      )}

      {/* 5 Interactive KPI Cards */}
      {loading && !resumen ? (
        <KpiGridSkeleton count={5} />
      ) : resumen ? (
        <section aria-label="Indicadores clave de gestión KPI-01 a KPI-05" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <KpiCard
            code="KPI-01"
            title="Reducción promedio PSS-10 (Estrés)"
            value={
              resumen.kpi01_pss10.suprimido
                ? 'Suprimido'
                : resumen.kpi01_pss10.reduccion_promedio != null
                  ? `${resumen.kpi01_pss10.reduccion_promedio > 0 ? '+' : ''}${resumen.kpi01_pss10.reduccion_promedio.toFixed(2)}`
                  : '—'
            }
            unit={!resumen.kpi01_pss10.suprimido ? 'pts' : undefined}
            semaforo={resumen.kpi01_pss10.semaforo}
            metaLabel="Meta: ≥ 4.0 pts"
            subtitle={`n = ${resumen.kpi01_pss10.pares_validos} pares`}
            progressPct={
              resumen.kpi01_pss10.reduccion_promedio != null
                ? (resumen.kpi01_pss10.reduccion_promedio / 6) * 100
                : null
            }
            accent="teal"
            Icon={Activity}
            onClick={() => onNavigate('evolucion')}
          />

          <KpiCard
            code="KPI-02"
            title="Reducción promedio PCL-5 (Trauma)"
            value={
              resumen.kpi02_pcl5.suprimido
                ? 'Suprimido'
                : resumen.kpi02_pcl5.reduccion_promedio != null
                  ? `${resumen.kpi02_pcl5.reduccion_promedio > 0 ? '+' : ''}${resumen.kpi02_pcl5.reduccion_promedio.toFixed(2)}`
                  : '—'
            }
            unit={!resumen.kpi02_pcl5.suprimido ? 'pts' : undefined}
            semaforo={resumen.kpi02_pcl5.semaforo}
            metaLabel="Meta: ≥ 10.0 pts"
            subtitle={`n = ${resumen.kpi02_pcl5.pares_validos} pares`}
            progressPct={
              resumen.kpi02_pcl5.reduccion_promedio != null
                ? (resumen.kpi02_pcl5.reduccion_promedio / 14) * 100
                : null
            }
            accent="sky"
            Icon={HeartPulse}
            onClick={() => onNavigate('evolucion')}
          />

          <KpiCard
            code="KPI-03"
            title="Tasa de continuidad estudiantil"
            value={
              resumen.kpi03_continuidad.suprimido
                ? 'Suprimido'
                : resumen.kpi03_continuidad.tasa_continuidad != null
                  ? `${resumen.kpi03_continuidad.tasa_continuidad.toFixed(1)}`
                  : '—'
            }
            unit={!resumen.kpi03_continuidad.suprimido ? '%' : undefined}
            semaforo={resumen.kpi03_continuidad.semaforo}
            metaLabel="Meta: ≥ 80%"
            subtitle={`n = ${resumen.kpi03_continuidad.evaluables} evaluables`}
            progressPct={resumen.kpi03_continuidad.tasa_continuidad}
            accent="emerald"
            Icon={Users}
            onClick={() => onNavigate('continuidad')}
          />

          <KpiCard
            code="KPI-04"
            title="Cumplimiento de evaluaciones"
            value={
              resumen.kpi04_cumplimiento.suprimido
                ? 'Suprimido'
                : resumen.kpi04_cumplimiento.tasa_cumplimiento != null
                  ? `${resumen.kpi04_cumplimiento.tasa_cumplimiento.toFixed(1)}`
                  : '—'
            }
            unit={!resumen.kpi04_cumplimiento.suprimido ? '%' : undefined}
            semaforo={resumen.kpi04_cumplimiento.semaforo}
            metaLabel="Meta: ≥ 90%"
            subtitle={`n = ${resumen.kpi04_cumplimiento.elegibles} elegibles`}
            progressPct={resumen.kpi04_cumplimiento.tasa_cumplimiento}
            accent="indigo"
            Icon={ClipboardCheck}
            onClick={() => onNavigate('cumplimiento')}
          />

          <KpiCard
            code="KPI-05"
            title="Prácticas en meta (PSS-10 / PCL-5)"
            value={
              kpi05Pss?.tasa_cumplimiento_meta != null
                ? `${Number(kpi05Pss.tasa_cumplimiento_meta).toFixed(0)}`
                : '—'
            }
            unit={kpi05Pss?.tasa_cumplimiento_meta != null ? '%' : undefined}
            semaforo={kpi05Pss?.semaforo || 'SIN_DATOS'}
            metaLabel="Meta: ≥ 80%"
            subtitle={
              kpi05Pss
                ? `PSS: ${kpi05Pss.practicas_cumplen_meta}/${kpi05Pss.practicas_evaluables} · PCL: ${kpi05Pcl?.practicas_cumplen_meta ?? 0}/${kpi05Pcl?.practicas_evaluables ?? 0}`
                : 'Evaluando prácticas'
            }
            progressPct={kpi05Pss?.tasa_cumplimiento_meta ?? null}
            accent="teal"
            Icon={Award}
            onClick={() => onNavigate('practicas')}
          />
        </section>
      ) : null}

      {/* Visual Overview Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {loading && !impactoPss ? (
          <>
            <div className="lg:col-span-7"><ChartSkeleton height={280} /></div>
            <div className="lg:col-span-5"><ChartSkeleton height={280} /></div>
          </>
        ) : (
          <>
            <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Reducción promedio PSS-10 por Práctica Principal
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Comparativo contra meta operativa de 4.0 puntos (solo prácticas con n ≥ 5 pares válidos)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('practicas')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 shrink-0"
                >
                  Ver RG-02 <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
              <EChartBox
                option={chartPracticasPss}
                height={270}
                ariaLabel="Gráfico de barras de reducción promedio PSS-10 por práctica principal"
              />
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Distribución de Continuidad Estudiantil
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Clasificación operativa al corte {corte} (RO-01 · KPI-03)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('continuidad')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 shrink-0"
                >
                  Ver RO-01 <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
              {chartContinuidadDonut ? (
                <EChartBox
                  option={chartContinuidadDonut}
                  height={270}
                  ariaLabel="Gráfico circular de distribución de estados de continuidad"
                />
              ) : (
                <div className="h-[270px] flex items-center justify-center text-xs text-slate-500">
                  Sin suficientes datos evaluables para mostrar distribución.
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Quick Access Report Cards */}
      <section aria-label="Acceso rápido a reportes BI" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            id: 'evolucion' as const,
            code: 'RG-01',
            title: 'Evolución Estrés y Trauma',
            desc: 'Pares válidos PSS-10 y PCL-5 estrictamente separados por programa, facultad o grupo etario.',
            Icon: Activity,
            badge: 'KPI-01 · KPI-02',
          },
          {
            id: 'practicas' as const,
            code: 'RG-02',
            title: 'Efectividad por Práctica',
            desc: 'Ranking P-01 a P-04 y MIXTO contra meta operativa (≥ 4 pts PSS-10, ≥ 10 pts PCL-5).',
            Icon: Award,
            badge: 'KPI-05',
          },
          {
            id: 'continuidad' as const,
            code: 'RO-01',
            title: 'Continuidad y Abandono',
            desc: 'Seguimiento nominal anonimizado de asistencia, riesgo, abandono y retiros al corte.',
            Icon: Users,
            badge: 'KPI-03',
          },
          {
            id: 'cumplimiento' as const,
            code: 'RO-02',
            title: 'Control de Evaluaciones',
            desc: 'Oportunidades elegibles en ventana, tardías, pendientes y vencidas con versionado.',
            Icon: ClipboardCheck,
            badge: 'KPI-04',
          },
        ].map(({ id, code, title, desc, Icon, badge }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            className="group text-left rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card hover:shadow-card-hover hover:border-teal-300/80 transition-all flex flex-col justify-between gap-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="w-9 h-9 rounded-xl bg-slate-900 text-teal-400 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  {badge}
                </span>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-teal-700">{code}</div>
                <h3 className="font-display text-sm font-bold text-slate-900 mt-0.5">{title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 group-hover:text-teal-700 transition-colors">
              <span>Abrir reporte</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </div>
          </button>
        ))}
      </section>

      {/* Governance / Privacy Strip */}
      <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 shadow-card">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" aria-hidden="true" />
          <span>
            <strong className="text-slate-900">Gobierno Analítico Activo:</strong> Identificadores anonimizados, supresión automática cuando <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">n &lt; 5</code>, y separación estricta de escalas PSS-10 y PCL-5.
          </span>
        </div>
        <div className="flex items-center gap-3 text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            Esquema Constelación
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
            Corte {corte}
          </span>
        </div>
      </div>
    </div>
  );
}
