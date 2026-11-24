'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';

interface CumplimientoReportProps {
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

function compactPrograma(codigo: string): string {
  const match = codigo.match(/(P-\d{2}|MIXTO)-(C\d{2})$/);
  if (match) return `${match[1]} · ${match[2]}`;
  return codigo;
}

function EstadoEvaluacionBadge({ estado }: { estado: string }) {
  switch (estado) {
    case 'COMPLETADA_EN_VENTANA':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          En ventana
        </span>
      );
    case 'COMPLETADA_TARDIA':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Tardía
        </span>
      );
    case 'VENCIDA':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Vencida
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
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
  const [categoriaEvento, setCategoriaEvento] = useState('');
  const [estado, setEstado] = useState('');
  const [buscarInput, setBuscarInput] = useState('');
  const [buscar, setBuscar] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const captionId = useId();

  useEffect(() => {
    const t = setTimeout(() => {
      setBuscar(buscarInput.trim());
      setPage(1);
    }, 260);
    return () => clearTimeout(t);
  }, [buscarInput]);

  useEffect(() => {
    setPage(1);
  }, [semestre]);

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
        buscar: buscar || undefined,
        page,
        pageSize,
      });
      setData(res);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el control de evaluaciones psicológicas.');
    } finally {
      setLoading(false);
    }
  }, [corte, semestre, idPrograma, facultad, instrumento, categoriaEvento, estado, buscar, page, pageSize]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiarFiltros = () => {
    setIdPrograma('');
    setFacultad('');
    setInstrumento('');
    setCategoriaEvento('');
    setEstado('');
    setBuscarInput('');
    setBuscar('');
    setPage(1);
  };

  const hayFiltrosActivos = Boolean(
    idPrograma || facultad || instrumento || categoriaEvento || estado || buscar,
  );
  const rt = data?.resumen_total;
  const pag = data?.paginacion;

  const programasFiltrados = (filtros?.programas || []).filter(
    (p) => !semestre || p.periodo_academico === semestre,
  );
  const programaSeleccionado = programasFiltrados.find((p) => String(p.id_programa) === idPrograma);

  return (
    <div className="space-y-5">
      {/* Encabezado y filtros propios del reporte */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Control de Evaluaciones Psicológicas Pendientes y Completadas
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Semestre: <strong className="text-slate-700">{semestre || 'Todos'}</strong> · Programa:{' '}
            <strong className="text-slate-700">
              {programaSeleccionado ? programaSeleccionado.codigo_programa : 'Todos los programas'}
            </strong>{' '}
            · Corte: <strong className="text-slate-700">{formatFechaEs(corte)}</strong>
          </p>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Fecha de corte</span>
            <div className="relative">
              <Calendar
                className="w-3.5 h-3.5 text-teal-700 absolute left-2.5 top-2.5 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="date"
                value={corte}
                onChange={(e) => {
                  setCorte(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 pl-8 pr-2.5 py-1.5 text-sm bg-white"
              />
            </div>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Instrumento</span>
            <select
              value={instrumento}
              onChange={(e) => {
                setInstrumento(e.target.value as '' | 'PSS-10' | 'PCL-5');
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Todos (PSS-10 y PCL-5)</option>
              <option value="PSS-10">PSS-10</option>
              <option value="PCL-5">PCL-5</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Programa</span>
            <select
              value={idPrograma}
              onChange={(e) => {
                setIdPrograma(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Todos los programas</option>
              {programasFiltrados.map((p) => (
                <option key={p.id_programa} value={p.id_programa}>
                  {p.codigo_programa}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Estado de evaluación</span>
            <select
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Todos los estados</option>
              <option value="COMPLETADA_EN_VENTANA">Completada en ventana</option>
              <option value="COMPLETADA_TARDIA">Completada tardía</option>
              <option value="PENDIENTE_EN_VENTANA">Pendiente en ventana</option>
              <option value="VENCIDA">Vencida</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Facultad / Área</span>
            <select
              value={facultad}
              onChange={(e) => {
                setFacultad(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Todas las facultades</option>
              {filtros?.facultades.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Evento índice (PCL-5)</span>
            <select
              value={categoriaEvento}
              onChange={(e) => {
                setCategoriaEvento(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Todos los eventos</option>
              {(filtros?.categoriasEvento || []).map((c) => (
                <option key={c.codigo_categoria} value={c.codigo_categoria}>
                  {c.codigo_categoria} · {c.nombre_categoria}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="block text-xs font-medium text-slate-600 mb-1">Buscar estudiante (código)</span>
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={buscarInput}
                onChange={(e) => setBuscarInput(e.target.value)}
                placeholder="Ej. UNT26-EST-0015"
                className="w-full rounded-lg border border-slate-300 pl-8 pr-2.5 py-1.5 text-sm bg-white"
              />
            </div>
          </label>
        </div>

        {hayFiltrosActivos && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={limpiarFiltros}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Limpiar filtros
            </button>
          </div>
        )}
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {error}
        </div>
      )}

      {/* Tabla principal */}
      <section className="space-y-3">
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="w-1.5 h-5 rounded-full bg-teal-700 shrink-0" aria-hidden="true" />
              <h3 id={captionId} className="text-sm font-bold text-slate-900 tracking-tight">
                Matriz de control operacional por oportunidad de evaluación
              </h3>
              <span className="text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-0.5 rounded-full">
                Corte {formatFechaEs(corte)}
              </span>
            </div>
            {pag && (
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                Mostrando <strong className="text-slate-700">{data?.oportunidades?.length || 0}</strong> de{' '}
                <strong className="text-slate-700">{pag.totalRegistros.toLocaleString()}</strong> oportunidades
              </span>
            )}
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-labelledby={captionId}
            className="table-wrapper table-wrapper--paged !border-0 !rounded-none"
          >
            <table className="mwg-table">
              <caption className="sr-only">
                Control de evaluaciones psicológicas pendientes y completadas al corte {formatFechaEs(corte)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Instrumento</th>
                  <th scope="col">Estudiante</th>
                  <th scope="col">Programa</th>
                  <th scope="col">Momento</th>
                  <th scope="col">Ventana prevista</th>
                  <th scope="col">Fecha realización</th>
                  <th scope="col">Puntaje / Versión</th>
                  <th scope="col">Estado evaluación</th>
                  <th scope="col">Par válido</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-500">
                      Consultando oportunidades de evaluación en SQL Server...
                    </td>
                  </tr>
                ) : !data?.oportunidades?.length ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-500">
                      No se encontraron oportunidades de evaluación para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  data.oportunidades.map((r: any) => (
                    <tr key={r.id_oportunidad}>
                      <th scope="row">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold border ${
                            r.codigo_instrumento === 'PSS-10'
                              ? 'bg-teal-50 text-teal-800 border-teal-200'
                              : 'bg-sky-50 text-sky-800 border-sky-200'
                          }`}
                        >
                          {r.codigo_instrumento}
                        </span>
                        <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                          {r.codigo_evento_local
                            ? `${r.codigo_evento_local}${r.categoria_evento ? ` · ${r.categoria_evento}` : ''}`
                            : 'No aplica'}
                        </div>
                      </th>
                      <td data-label="Estudiante">
                        <div className="font-semibold text-slate-900">{r.codigo_anonimizado}</div>
                        <div
                          className="text-[11px] text-slate-500 truncate max-w-[155px] mx-auto"
                          title={r.facultad_o_area}
                        >
                          {r.facultad_o_area}
                        </div>
                      </td>
                      <td data-label="Programa" title={r.codigo_programa}>
                        <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-xs border border-slate-200/80">
                          {compactPrograma(r.codigo_programa)}
                        </span>
                      </td>
                      <td data-label="Momento" className="text-xs font-semibold text-slate-700">
                        {r.momento}
                      </td>
                      <td data-label="Ventana prevista" className="tabular-nums text-xs text-slate-600 whitespace-nowrap">
                        {formatFechaEs(r.fecha_ventana_inicio)} – {formatFechaEs(r.fecha_ventana_fin)}
                      </td>
                      <td data-label="Fecha realización" className="tabular-nums text-slate-700">
                        {formatFechaEs(r.fecha_realizacion)}
                      </td>
                      <td data-label="Puntaje / Versión" className="tabular-nums text-slate-700">
                        {r.puntaje_total != null ? (
                          <div>
                            <span className="font-semibold text-slate-900">{r.puntaje_total} pts</span>
                            <span className="text-[11px] text-slate-500 ml-1">
                              v{r.numero_version ?? 1}
                            </span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td data-label="Estado evaluación">
                        <EstadoEvaluacionBadge estado={r.estado_evaluacion} />
                      </td>
                      <td data-label="Par válido">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${
                            r.par_valido
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {r.par_valido ? 'Sí' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {rt && rt.total_registros > 0 && (
                <tfoot>
                  <tr className="bg-teal-50/75 font-semibold text-slate-900 text-xs">
                    <th scope="row" className="bg-teal-50/90 whitespace-nowrap">
                      <div className="font-bold text-slate-900">TOTAL GENERAL</div>
                      <div className="text-[11px] font-medium text-teal-800">
                        {rt.elegibles.toLocaleString()} elegibles
                      </div>
                    </th>
                    <td className="text-slate-400">—</td>
                    <td className="text-slate-400">—</td>
                    <td className="text-slate-400">—</td>
                    <td className="text-slate-400">—</td>
                    <td className="text-slate-400">—</td>
                    <td className="text-slate-400">—</td>
                    <td data-label="Estado evaluación" className="whitespace-normal leading-snug font-semibold text-slate-700">
                      <div>
                        {rt.completadas_en_ventana.toLocaleString()} en ventana · {rt.completadas_tardias.toLocaleString()} tardías ·{' '}
                        {rt.pendientes_en_ventana.toLocaleString()} pendientes · {rt.vencidas.toLocaleString()} vencidas
                      </div>
                      <div className="text-[11px] font-bold text-teal-900 mt-0.5">
                        {rt.total_completadas.toLocaleString()} completadas
                      </div>
                    </td>
                    <td data-label="Par válido" className="tabular-nums font-bold text-slate-700 whitespace-nowrap">
                      {rt.en_par_valido.toLocaleString()} en par
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Paginación */}
        {pag && pag.totalPaginas > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 text-sm">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span>Filas por página:</span>
              <select
                aria-label="Filas por página"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs bg-white"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Anterior
              </button>
              <span className="text-xs font-medium text-slate-700 px-2 tabular-nums">
                Página {pag.page} de {pag.totalPaginas}
              </span>
              <button
                type="button"
                disabled={page >= pag.totalPaginas}
                onClick={() => setPage((p) => Math.min(pag.totalPaginas, p + 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                Siguiente
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Leyenda y reglas operacionales DEBAJO del listado */}
      <section aria-label="Leyenda de estados de evaluación y reglas de cómputo" className="space-y-3 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">En ventana</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Completada dentro del rango reglamentario; habilita la conformación de pares válidos.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">Tardía</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Completada fuera de la ventana prevista hasta la fecha de corte; no conforma par válido en ventana.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-600 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">Pendiente</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Sin resultado registrado aún, pero con fecha límite vigente al corte.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">Vencida</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Sin resultado registrado y fecha fin de ventana superada por la fecha de corte.
              </p>
            </div>
          </div>
        </div>

        <details className="bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700 inline-flex items-center gap-1.5 select-none">
            <Info className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
            Ver reglas de cómputo aplicadas
          </summary>
          <div className="mt-2.5 pt-2.5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3 leading-relaxed">
            <div>
              <strong className="text-slate-800 block">Elegibilidad al corte</strong>
              Solo incluye oportunidades <code>aplicable = 1</code> cuya ventana inició hasta la fecha de corte; excluye casos sin evento índice en PCL-5.
            </div>
            <div>
              <strong className="text-slate-800 block">Condición de par válido</strong>
              Requiere evaluación inicial y final vigentes en ventana (y mismo evento índice en PCL-5).
            </div>
            <div>
              <strong className="text-slate-800 block">Versionado de correcciones</strong>
              Cada oportunidad conserva un único resultado vigente (<code>es_vigente = 1</code>); las correcciones auditadas se registran como <code>v2+</code>.
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
