'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Calendar, CheckCircle2, Filter, Info, RotateCcw, XCircle } from 'lucide-react';
import {
  api,
  type FiltrosResponse,
  type ImpactoPracticaRow,
  type ImpactoPracticasResponse,
} from '@/lib/api';
import { AiReportButton } from './AiReportButton';
import { SemaforoBadge } from './SemaforoBadge';
import { DataBarCell, PowerDataTable } from './PowerDataTable';
import { TableSkeleton } from './UiStates';

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

  const [data, setData] = useState<ImpactoPracticasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(e.message || 'No se pudo cargar el reporte RG-02.');
    } finally {
      setLoading(false);
    }
  }, [instrumento, corte, semestre, facultad]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filas: ImpactoPracticaRow[] = useMemo(
    () => (vista === 'practica' ? data?.por_practica || [] : data?.por_programa || []),
    [data, vista],
  );

  const kpi05 = data?.kpi05_meta_practicas;
  const metaPts = data?.meta_operativa_pts ?? (instrumento === 'PSS-10' ? 4 : 10);

  const maxPares = useMemo(
    () => Math.max(10, ...filas.map((r) => Number(r.pares_validos || 0))),
    [filas],
  );

  const columns = useMemo<ColumnDef<ImpactoPracticaRow, any>[]>(
    () => [
      {
        id: 'entidad',
        accessorFn: (r) =>
          vista === 'practica' ? `${r.codigo_practica} ${r.nombre_practica}` : r.codigo_programa || '',
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
        accessorFn: (r) =>
          vista === 'practica'
            ? r.tipo_practica || (r.es_mixto ? 'Mixto' : 'Unicomponente')
            : r.estado_programa || '—',
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
      {/* Official Report Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold tracking-wider uppercase">
              RG-02 · Reporte Gerencial
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
              Semestre: {semestre || 'Todos'}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
              {instrumento} · Meta ≥ {metaPts.toFixed(1)} pts
            </span>
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              Corte: <strong className="text-slate-700">{formatFechaEs(data?.corte || corte)}</strong>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Efectividad Comparativa por Práctica de Bienestar
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Reporte tabular oficial de desempeño por técnica (P-01 a P-04 y MIXTO) frente a la meta operativa de KPI-05.
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
          }}
          kpis={{
            kpi05_meta_practicas: kpi05 || null,
            meta_operativa_pts: metaPts,
          }}
          grupos={filas
            .filter((r) => !r.suprimido && r.pares_validos >= 5)
            .map((r) => ({
              nombre:
                vista === 'practica'
                  ? `${r.codigo_practica} · ${r.nombre_practica}`
                  : r.codigo_programa || r.codigo_practica,
              n: r.pares_validos,
              instrumento,
              valor: r.reduccion_promedio,
              semaforo: r.semaforo,
            }))}
          disabled={loading || !data}
        />
      </div>

      {/* Compact Official Filter Panel */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            Filtros del Reporte RG-02
          </div>
          <button
            type="button"
            onClick={() => {
              setInstrumento('PSS-10');
              setFacultad('');
              setVista('practica');
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Restablecer
          </button>
        </div>

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
              Instrumento
            </label>
            <select
              value={instrumento}
              onChange={(e) => setInstrumento(e.target.value as 'PSS-10' | 'PCL-5')}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="PSS-10">PSS-10 (Meta ≥ 4.0 pts)</option>
              <option value="PCL-5">PCL-5 (Meta ≥ 10.0 pts)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Nivel de desglose
            </label>
            <select
              value={vista}
              onChange={(e) => setVista(e.target.value as 'practica' | 'programa')}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="practica">Por Práctica Principal</option>
              <option value="programa">Por Programa / Cohorte</option>
            </select>
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
        </div>
      </section>

      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Main Analytical Table */}
      {loading && !data ? (
        <TableSkeleton rows={6} />
      ) : (
        <PowerDataTable
          title={
            vista === 'practica'
              ? `Matriz Oficial RG-02 · Efectividad por Práctica (${instrumento})`
              : `Matriz Oficial RG-02 · Efectividad por Programa / Cohorte (${instrumento})`
          }
          subtitle="Ordena por reducción o evidencia muestral, busca rápidamente o exporta a PDF, Word, Excel o CSV."
          caption={`Tabla oficial RG-02 comparativa de efectividad por ${vista} en ${instrumento}`}
          data={filas}
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

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs text-slate-600">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <strong>Lectura gerencial:</strong> Los resultados reflejan asociaciones observadas por práctica y exigen <code>ParesValidos ≥ 5</code> tras aplicar el filtro de Facultad/Área. Para ver el ranking visual, velocímetro KPI-05 y dispersión, visita el <strong>Tablero Visual BI</strong>.
        </p>
      </div>
    </div>
  );
}
