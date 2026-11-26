'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Calendar, Filter, Info, RotateCcw } from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { AiReportButton } from './AiReportButton';
import { SemaforoBadge } from './SemaforoBadge';
import { DataBarCell, PowerDataTable } from './PowerDataTable';
import { TableSkeleton } from './UiStates';

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

function formatFechaEs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
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

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(e.message || 'No se pudo cargar el reporte RG-01.');
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
  };

  const programasFiltrados = (filtros?.programas || []).filter(
    (p) => !semestre || p.periodo_academico === semestre,
  );

  const filas: EvolucionRow[] = data?.filas || [];
  const totales: EvolucionRow[] = data?.totales_por_instrumento || [];
  const pssTotal = totales.find((t) => t.codigo_instrumento === 'PSS-10') || null;
  const pclTotal = totales.find((t) => t.codigo_instrumento === 'PCL-5') || null;

  const etiquetaDimension =
    agruparPor === 'facultad'
      ? 'Facultad / Área'
      : agruparPor === 'grupo_etario'
        ? 'Grupo etario'
        : 'Programa';

  const maxPares = useMemo(
    () => Math.max(10, ...filas.map((r) => Number(r.pares_validos || 0))),
    [filas],
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
        cell: ({ row }) =>
          row.original.suprimido ? (
            <span className="text-xs font-semibold text-slate-500 italic">&lt; 5 (Suprimido)</span>
          ) : (
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

  return (
    <div className="space-y-5">
      {/* Official Report Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 text-[11px] font-bold tracking-wider uppercase">
              RG-01 · Reporte Gerencial
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
              Semestre: {semestre || 'Todos'}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
              Metas: PSS-10 ≥ 4.0 pts · PCL-5 ≥ 10.0 pts
            </span>
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              Corte: <strong className="text-slate-700">{formatFechaEs(data?.corte || corte)}</strong>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Evolución de Estrés Percibido (PSS-10) y Trauma (PCL-5)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Reporte tabular oficial de pares válidos pre–post en ventana. Escalas estrictamente separadas y supresión estadística cuando n &lt; 5.
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
          }}
          kpis={{ pss10: pssTotal, pcl5: pclTotal }}
          grupos={filas
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

      {/* Compact Official Filter Panel */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
            Filtros del Reporte RG-01
          </div>
          <button
            type="button"
            onClick={limpiarFiltros}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Limpiar filtros
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
              <option value="">Ambos (Separados)</option>
              <option value="PSS-10">PSS-10 (0–40)</option>
              <option value="PCL-5">PCL-5 (0–80)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Agrupar por
            </label>
            <select
              value={agruparPor}
              onChange={(e) => setAgruparPor(e.target.value as 'programa' | 'facultad' | 'grupo_etario')}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="programa">Programa</option>
              <option value="facultad">Facultad / Área</option>
              <option value="grupo_etario">Grupo etario</option>
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
              Práctica principal
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
              Programa / Cohorte
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
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Evento índice (PCL-5)
            </label>
            <select
              value={categoriaEvento}
              onChange={(e) => setCategoriaEvento(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="">Todas las categorías</option>
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
          title={`Matriz Oficial RG-01 por ${etiquetaDimension}`}
          subtitle="Pares válidos en ventana (PSS-10 y PCL-5 estrictamente separados). Ordena por cualquier columna o exporta a PDF, Word, Excel o CSV."
          caption={`Tabla oficial RG-01 de evolución PSS-10 y PCL-5 agrupada por ${etiquetaDimension}`}
          data={filas}
          columns={columns}
          initialSorting={[{ id: 'reduccion_promedio', desc: true }]}
          searchPlaceholder={`Buscar ${etiquetaDimension.toLowerCase()} o instrumento...`}
          csvFilename={`RG01_evolucion_${agruparPor}_${corte}.csv`}
          csvColumns={[
            { header: etiquetaDimension, accessor: (r) => r.dim_clave },
            { header: 'Instrumento', accessor: (r) => r.codigo_instrumento },
            { header: 'Pares Válidos', accessor: (r) => (r.suprimido ? '< 5' : r.pares_validos) },
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

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs text-slate-600">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <strong>Regla BI de confidencialidad:</strong> Los grupos con <code>n &lt; 5</code> pares válidos se muestran como <strong>SUPRIMIDO</strong>. Para explorar los gráficos Dumbbell y barras apiladas al 100 %, visita el <strong>Tablero Visual BI</strong>.
        </p>
      </div>
    </div>
  );
}
