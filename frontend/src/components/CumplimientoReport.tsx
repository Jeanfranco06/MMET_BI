'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  Info,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { AiReportButton } from './AiReportButton';
import { DataBarCell, PowerDataTable } from './PowerDataTable';
import { TableSkeleton } from './UiStates';

interface CumplimientoReportProps {
  filtros: FiltrosResponse | null;
  corteInicial: string;
  semestre: string;
}

interface OportunidadRow {
  id_oportunidad: number;
  codigo_estudiante: string;
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

export function CumplimientoReport({ filtros, corteInicial, semestre }: CumplimientoReportProps) {
  const [corte, setCorte] = useState(corteInicial);
  const [idPrograma, setIdPrograma] = useState('');
  const [facultad, setFacultad] = useState('');
  const [instrumento, setInstrumento] = useState<'' | 'PSS-10' | 'PCL-5'>('');
  const [momento, setMomento] = useState<'' | 'INICIAL' | 'FINAL'>('');
  const [categoriaEvento, setCategoriaEvento] = useState('');
  const [estado, setEstado] = useState('');

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        page: 1,
        pageSize: 300,
      });
      setData(res);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el reporte RO-02.');
    } finally {
      setLoading(false);
    }
  }, [corte, semestre, idPrograma, facultad, instrumento, categoriaEvento, estado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const rt = data?.resumen_total;
  const oportunidadesRaw: OportunidadRow[] = data?.oportunidades || [];
  const oportunidades = useMemo(
    () => (momento ? oportunidadesRaw.filter((o) => o.momento === momento) : oportunidadesRaw),
    [oportunidadesRaw, momento],
  );

  const programasFiltrados = (filtros?.programas || []).filter(
    (p) => !semestre || p.periodo_academico === semestre,
  );

  const columns = useMemo<ColumnDef<OportunidadRow, any>[]>(
    () => [
      {
        accessorKey: 'codigo_estudiante',
        header: 'Estudiante',
        cell: ({ row }) => (
          <div>
            <div className="font-bold text-slate-900 tabular-nums">
              {row.original.codigo_estudiante}
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

  return (
    <div className="space-y-5">
      {/* Official Report Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold tracking-wider uppercase">
              RO-02 · Reporte Operativo
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
              Semestre: {semestre || 'Todos'}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
              KPI-04 · Meta ≥ 90.0%
            </span>
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              Corte: <strong className="text-slate-700">{formatFechaEs(data?.corte || corte)}</strong>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Control de Evaluaciones y Cumplimiento en Ventana
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Reporte nominal oficial de oportunidades de evaluación PSS-10 y PCL-5 (INICIAL / FINAL), ventana de aplicación y validación de pares.
          </p>
        </div>

        <AiReportButton
          reporte="RO-02"
          corte={data?.corte || corte}
          filtros={{
            semestre: semestre || 'TODOS',
            instrumento: instrumento || 'AMBOS',
            momento: momento || 'AMBOS',
            estado: estado || 'TODOS',
          }}
          kpis={rt || null}
          grupos={
            rt && Number(rt.elegibles || 0) >= 5
              ? [
                  {
                    nombre: momento ? `Cumplimiento ${momento}` : 'Cumplimiento Global',
                    n: Number(rt.elegibles || 0),
                    valor: rt.tasa_cumplimiento,
                    semaforo: rt.semaforo,
                  },
                ]
              : []
          }
          disabled={loading || !data}
        />
      </div>

      {/* Compact Official Filter Panel */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
            Filtros del Reporte RO-02
          </div>
          <button
            type="button"
            onClick={() => {
              setIdPrograma('');
              setFacultad('');
              setInstrumento('');
              setMomento('');
              setCategoriaEvento('');
              setEstado('');
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Limpiar filtros
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
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
              Instrumento
            </label>
            <select
              value={instrumento}
              onChange={(e) => setInstrumento(e.target.value as '' | 'PSS-10' | 'PCL-5')}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="">Ambos</option>
              <option value="PSS-10">PSS-10</option>
              <option value="PCL-5">PCL-5</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Momento
            </label>
            <select
              value={momento}
              onChange={(e) => setMomento(e.target.value as '' | 'INICIAL' | 'FINAL')}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="">Todos</option>
              <option value="INICIAL">INICIAL</option>
              <option value="FINAL">FINAL</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Estado
            </label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="">Todos</option>
              <option value="COMPLETADA_EN_VENTANA">En ventana</option>
              <option value="COMPLETADA_TARDIA">Tardía</option>
              <option value="PENDIENTE_EN_VENTANA">Pendiente</option>
              <option value="VENCIDA">Vencida</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Programa
            </label>
            <select
              value={idPrograma}
              onChange={(e) => setIdPrograma(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
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
              Facultad / Área
            </label>
            <select
              value={facultad}
              onChange={(e) => setFacultad(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
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
              Evento (PCL-5)
            </label>
            <select
              value={categoriaEvento}
              onChange={(e) => setCategoriaEvento(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="">Todas</option>
              {(filtros?.categoriasEvento || []).map((c) => (
                <option key={c.codigo_categoria} value={c.codigo_categoria}>
                  {c.codigo_categoria} · {c.nombre_categoria}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Main Analytical Table */}
      {loading && !data ? (
        <TableSkeleton rows={8} />
      ) : (
        <PowerDataTable
          title="Matriz Oficial RO-02 · Registro de Oportunidades de Evaluación"
          subtitle="Ordena por puntaje, fecha o estado, busca por estudiante y exporta la selección actual a Excel (CSV UTF-8)."
          caption="Tabla operativa RO-02 de control de evaluaciones PSS-10 y PCL-5"
          data={oportunidades}
          columns={columns}
          initialSorting={[{ id: 'estado_evaluacion', desc: true }]}
          searchPlaceholder="Buscar código, facultad o programa..."
          csvFilename={`RO02_cumplimiento_${corte}.csv`}
          csvColumns={[
            { header: 'Código Estudiante', accessor: (r) => r.codigo_estudiante },
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

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs text-slate-600">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <strong>Trazabilidad psicométrica:</strong> Solo las parejas con evaluación INICIAL y FINAL completadas en ventana conforman un <strong>Par válido</strong> para RG-01 y RG-02. Para ver el gráfico apilado por momento y el velocímetro KPI-04, visita el <strong>Tablero Visual BI</strong>.
        </p>
      </div>
    </div>
  );
}
