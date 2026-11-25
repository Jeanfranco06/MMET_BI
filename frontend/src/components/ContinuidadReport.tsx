'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Filter,
  Info,
  LogOut,
  RotateCcw,
  UserX,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { AiReportButton } from './AiReportButton';
import { DataBarCell, PowerDataTable } from './PowerDataTable';
import { TableSkeleton } from './UiStates';

interface ContinuidadReportProps {
  filtros: FiltrosResponse | null;
  corteInicial: string;
  semestre: string;
}

interface EstudianteContinuidadRow {
  id_asignacion: number;
  codigo_estudiante: string;
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

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        page: 1,
        pageSize: 250,
      });
      setData(res);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el reporte RO-01.');
    } finally {
      setLoading(false);
    }
  }, [corte, semestre, idPrograma, idPractica, facultad, ciclo, estado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const rt = data?.resumen_total;
  const estudiantes: EstudianteContinuidadRow[] = data?.estudiantes || [];

  const programasFiltrados = (filtros?.programas || []).filter(
    (p) => !semestre || p.periodo_academico === semestre,
  );

  const columns = useMemo<ColumnDef<EstudianteContinuidadRow, any>[]>(
    () => [
      {
        accessorKey: 'codigo_estudiante',
        header: 'Estudiante',
        cell: ({ row }) => (
          <div>
            <div className="font-bold text-slate-900 tabular-nums">
              {row.original.codigo_estudiante}
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

  return (
    <div className="space-y-5">
      {/* Official Report Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold tracking-wider uppercase">
              RO-01 · Reporte Operativo
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
              Semestre: {semestre || 'Todos'}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
              KPI-03 · Meta ≥ 80.0%
            </span>
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              Corte: <strong className="text-slate-700">{formatFechaEs(data?.corte || corte)}</strong>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Continuidad, Asistencia y Alerta de Abandono
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Reporte nominal anonimizado de continuidad por estudiante evaluable (≥ 3 sesiones exigibles a la fecha de corte).
          </p>
        </div>

        <AiReportButton
          reporte="RO-01"
          corte={data?.corte || corte}
          filtros={{
            semestre: semestre || 'TODOS',
            facultad: facultad || 'TODAS',
            estado: estado || 'TODOS',
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

      {/* Compact Official Filter Panel */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            Filtros del Reporte RO-01
          </div>
          <button
            type="button"
            onClick={() => {
              setIdPrograma('');
              setIdPractica('');
              setFacultad('');
              setCiclo('');
              setEstado('');
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Limpiar filtros
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
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
              Práctica
            </label>
            <select
              value={idPractica}
              onChange={(e) => setIdPractica(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
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
              Ciclo académico
            </label>
            <select
              value={ciclo}
              onChange={(e) => setCiclo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="">Todos</option>
              {(filtros?.ciclos || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).map((c) => (
                <option key={c} value={String(c)}>
                  Ciclo {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Estado continuidad
            </label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="">Todos</option>
              <option value="ACTIVO">Activo</option>
              <option value="EN_RIESGO">En riesgo</option>
              <option value="ABANDONO">Abandono</option>
              <option value="RETIRADO">Retirado</option>
              <option value="NO_EVALUABLE">No evaluable</option>
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
          title="Matriz Oficial RO-01 · Seguimiento Nominal de Continuidad"
          subtitle="Ordena por % de asistencia o estado, busca por código anonimizado/facultad y exporta a Excel (CSV UTF-8)."
          caption="Tabla operativa RO-01 de continuidad y asistencia estudiantil"
          data={estudiantes}
          columns={columns}
          initialSorting={[{ id: 'asistencia_pct', desc: false }]}
          searchPlaceholder="Buscar código, facultad o programa..."
          csvFilename={`RO01_continuidad_${corte}.csv`}
          csvColumns={[
            { header: 'Código Estudiante', accessor: (r) => r.codigo_estudiante },
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

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs text-slate-600">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <strong>Criterio operativo KPI-03:</strong> Se consideran evaluables los estudiantes con al menos 3 sesiones exigibles al corte. Para explorar el embudo de retención y el anillo de estados, visita el <strong>Tablero Visual BI</strong>.
        </p>
      </div>
    </div>
  );
}
