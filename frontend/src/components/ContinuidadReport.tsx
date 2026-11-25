'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  LogOut,
  Search,
  UserX,
  X,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { AiReportButton } from './AiReportButton';

interface ContinuidadReportProps {
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
  // Ej: UNT-2026-II-P-01-C01 -> P-01 · C01
  const match = codigo.match(/(P-\d{2}|MIXTO)-(C\d{2})$/);
  if (match) return `${match[1]} · ${match[2]}`;
  return codigo;
}

function EstadoContinuidadBadge({ estado }: { estado: string }) {
  switch (estado) {
    case 'ACTIVO':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Activo
        </span>
      );
    case 'EN_RIESGO':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          En riesgo
        </span>
      );
    case 'ABANDONO':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
          <UserX className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Abandono
        </span>
      );
    case 'RETIRADO':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
          <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Retirado
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
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
      const res = await api.getContinuidad({
        corte,
        semestre: semestre || undefined,
        id_programa: idPrograma || undefined,
        id_practica: idPractica || undefined,
        facultad: facultad || undefined,
        ciclo: ciclo || undefined,
        estado: estado || undefined,
        buscar: buscar || undefined,
        page,
        pageSize,
      });
      setData(res);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el reporte de continuidad.');
    } finally {
      setLoading(false);
    }
  }, [corte, semestre, idPrograma, idPractica, facultad, ciclo, estado, buscar, page, pageSize]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiarFiltros = () => {
    setIdPrograma('');
    setIdPractica('');
    setFacultad('');
    setCiclo('');
    setEstado('');
    setBuscarInput('');
    setBuscar('');
    setPage(1);
  };

  const hayFiltrosActivos = Boolean(idPrograma || idPractica || facultad || ciclo || estado || buscar);
  const rt = data?.resumen_total;
  const pag = data?.paginacion;

  const programasFiltrados = (filtros?.programas || []).filter(
    (p) => !semestre || p.periodo_academico === semestre,
  );
  const programaSeleccionado = programasFiltrados.find(
    (p) => String(p.id_programa) === idPrograma,
  );

  return (
    <div className="space-y-5">
      {/* Encabezado y filtros propios del reporte */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              RO-01 · Seguimiento de Continuidad y Abandono por Estudiante (KPI-03)
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Semestre: <strong className="text-slate-700">{semestre || 'Todos'}</strong> · Programa:{' '}
              <strong className="text-slate-700">
                {programaSeleccionado ? programaSeleccionado.codigo_programa : 'Todos los programas'}
              </strong>{' '}
              · Corte: <strong className="text-slate-700">{formatFechaEs(corte)}</strong>
            </p>
          </div>
          <AiReportButton
            reporte="RO-01"
            corte={data?.corte || corte}
            disabled={loading || !rt}
            filtros={{ semestre, idPrograma, idPractica, facultad, ciclo, estado }}
            kpis={
              rt
                ? {
                    evaluables: rt.evaluables,
                    continuan: rt.continuan,
                    activos: rt.activos,
                    en_riesgo: rt.en_riesgo,
                    abandono: rt.abandono,
                    retirados: rt.retirados,
                    no_evaluables: rt.no_evaluables,
                    tasa_continuidad_pct: rt.tasa_continuidad,
                    semaforo: rt.semaforo,
                  }
                : null
            }
            grupos={(data?.por_programa || []).map((p: any) => ({
              nombre: p.codigo_programa,
              n: Number(p.evaluables || 0),
              valor: p.tasa_continuidad,
              semaforo: p.semaforo,
            }))}
          />
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
            <span className="block text-xs font-medium text-slate-600 mb-1">Práctica principal</span>
            <select
              value={idPractica}
              onChange={(e) => {
                setIdPractica(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Todas las prácticas</option>
              {filtros?.practicas.map((p) => (
                <option key={p.id_practica} value={p.id_practica}>
                  {p.codigo_practica} · {p.nombre_practica}
                </option>
              ))}
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
            <span className="block text-xs font-medium text-slate-600 mb-1">Estado de continuidad</span>
            <select
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVO">Activo</option>
              <option value="EN_RIESGO">En riesgo</option>
              <option value="ABANDONO">Abandono</option>
              <option value="RETIRADO">Retirado</option>
              <option value="NO_EVALUABLE">No evaluable (&lt; 3 sesiones)</option>
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
            <span className="block text-xs font-medium text-slate-600 mb-1">Ciclo académico</span>
            <select
              value={ciclo}
              onChange={(e) => {
                setCiclo(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Todos los ciclos</option>
              {(filtros?.ciclos || []).map((c) => (
                <option key={c} value={c}>
                  Ciclo {c}
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

      {/* Tabla principal: 10 filas por página, valores centrados y 100% responsive */}
      <section className="space-y-3">
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          {/* Barra superior limpia del bloque de tabla */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="w-1.5 h-5 rounded-full bg-teal-700 shrink-0" aria-hidden="true" />
              <h3 id={captionId} className="text-sm font-bold text-slate-900 tracking-tight">
                Detalle de continuidad por estudiante
              </h3>
              <span className="text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-0.5 rounded-full">
                Corte {formatFechaEs(corte)}
              </span>
            </div>
            {pag && (
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                Mostrando <strong className="text-slate-700">{data?.estudiantes?.length || 0}</strong> de{' '}
                <strong className="text-slate-700">{pag.totalRegistros.toLocaleString()}</strong> registros
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
                Detalle de continuidad por estudiante al corte {formatFechaEs(corte)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Estudiante</th>
                  <th scope="col">Programa</th>
                  <th scope="col">Sesiones exigibles</th>
                  <th scope="col">Asistencias</th>
                  <th scope="col">Inasistencias</th>
                  <th scope="col">Asistencia (%)</th>
                  <th scope="col">Primera asistencia</th>
                  <th scope="col">Última asistencia</th>
                  <th scope="col">Evaluable</th>
                  <th scope="col">Estado de continuidad</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-slate-500">
                      Consultando asistencias en SQL Server...
                    </td>
                  </tr>
                ) : !data?.estudiantes?.length ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-slate-500">
                      No se encontraron estudiantes para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  data.estudiantes.map((r: any) => {
                    const esEvaluable =
                      typeof r.es_evaluable === 'boolean'
                        ? r.es_evaluable
                        : Number(r.sesiones_exigibles || 0) >= 3;
                    return (
                      <tr key={r.id_asignacion}>
                        <th scope="row">
                          <div className="font-semibold text-slate-900">{r.codigo_anonimizado}</div>
                          <div
                            className="text-[11px] font-normal text-slate-500 truncate max-w-[175px] mx-auto"
                            title={
                              r.ciclo_academico != null
                                ? `${r.facultad_o_area} · Ciclo ${r.ciclo_academico}`
                                : r.facultad_o_area
                            }
                          >
                            {r.facultad_o_area}
                            {r.ciclo_academico != null ? ` · Ciclo ${r.ciclo_academico}` : ''}
                          </div>
                        </th>
                        <td data-label="Programa" title={r.codigo_programa}>
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-xs border border-slate-200/80">
                            {compactPrograma(r.codigo_programa)}
                          </span>
                        </td>
                        <td data-label="Sesiones exigibles" className="tabular-nums font-medium text-slate-700">
                          {r.sesiones_exigibles}
                        </td>
                        <td data-label="Asistencias" className="tabular-nums font-semibold text-emerald-700">
                          {r.asistencias}
                        </td>
                        <td data-label="Inasistencias" className="tabular-nums font-medium text-slate-600">
                          {r.inasistencias}
                        </td>
                        <td data-label="Asistencia (%)" className="tabular-nums font-bold">
                          <span
                            className={
                              r.asistencia_pct >= 80
                                ? 'text-emerald-700'
                                : r.asistencia_pct >= 60
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                            }
                          >
                            {r.asistencia_pct.toFixed(1)}%
                          </span>
                        </td>
                        <td data-label="Primera asistencia" className="tabular-nums text-slate-700">
                          {formatFechaEs(r.primera_asistencia)}
                        </td>
                        <td data-label="Última asistencia" className="tabular-nums text-slate-700">
                          {formatFechaEs(r.ultima_asistencia)}
                        </td>
                        <td data-label="Evaluable">
                          <span
                            className={
                              esEvaluable
                                ? 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200'
                                : 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-300'
                            }
                          >
                            {esEvaluable ? 'Sí' : 'No'}
                          </span>
                        </td>
                        <td data-label="Estado de continuidad">
                          <EstadoContinuidadBadge estado={r.estado_continuidad} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {rt && rt.total_registros > 0 && (
                <tfoot>
                  <tr className="bg-teal-50/75 font-semibold text-slate-900 text-xs">
                    <th scope="row" className="bg-teal-50/90 whitespace-nowrap">
                      <div className="font-bold text-slate-900">TOTAL GENERAL</div>
                      <div className="text-[11px] font-medium text-teal-800">
                        {rt.total_registros.toLocaleString()} estudiantes
                      </div>
                    </th>
                    <td data-label="Programa" className="text-slate-400">
                      —
                    </td>
                    <td data-label="Sesiones exigibles" className="tabular-nums font-bold">
                      {rt.sesiones_exigibles.toLocaleString()}
                    </td>
                    <td data-label="Asistencias" className="tabular-nums font-bold text-emerald-800">
                      {rt.asistencias.toLocaleString()}
                    </td>
                    <td data-label="Inasistencias" className="tabular-nums font-bold text-slate-700">
                      {rt.inasistencias.toLocaleString()}
                    </td>
                    <td data-label="Asistencia (%)" className="tabular-nums font-bold text-teal-900">
                      {rt.asistencia_pct != null ? `${rt.asistencia_pct.toFixed(1)}%` : '—'}
                    </td>
                    <td data-label="Primera asistencia" className="text-slate-400">
                      —
                    </td>
                    <td data-label="Última asistencia" className="text-slate-400">
                      —
                    </td>
                    <td data-label="Evaluable" className="whitespace-nowrap">
                      <div className="font-bold text-teal-900">
                        {rt.evaluables.toLocaleString()} evaluables
                      </div>
                      <div className="text-[11px] font-medium text-slate-600">
                        {rt.no_evaluables.toLocaleString()} no evaluables
                      </div>
                    </td>
                    <td data-label="Estado de continuidad" className="whitespace-normal leading-snug font-semibold text-slate-700">
                      <div>
                        {rt.activos} activos · {rt.en_riesgo} en riesgo · {rt.abandono} abandonos · {rt.retirados} retirados
                      </div>
                      <div className="text-[11px] font-bold text-teal-900 mt-0.5">
                        {rt.continuan.toLocaleString()} continúan
                      </div>
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

      {/* Leyenda y fórmulas ubicadas DEBAJO del listado */}
      <section aria-label="Leyenda de estados y fórmulas de cálculo" className="space-y-3 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">Activo</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Asistió a su última sesión exigible realizada al corte.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">En riesgo</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Faltó a la última sesión, pero asistió al menos a 1 de las últimas 3.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">Abandono</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Faltó a sus últimas 3 sesiones exigibles consecutivas.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">Retirado</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Registra baja formal al corte; prevalece sobre asistencia previa.
              </p>
            </div>
          </div>
        </div>

        <details className="bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700 inline-flex items-center gap-1.5 select-none">
            <Info className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
            Ver fórmulas y reglas de cómputo aplicadas
          </summary>
          <div className="mt-2.5 pt-2.5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3 leading-relaxed">
            <div>
              <strong className="text-slate-800 block">Asistencia (%)</strong>
              <code>Asistencias ÷ Sesiones exigibles × 100</code>. Solo considera sesiones en estado <em>REALIZADA</em> hasta la fecha de corte.
            </div>
            <div>
              <strong className="text-slate-800 block">Criterio de evaluabilidad</strong>
              Inicia con al menos 1 asistencia y es evaluable al acumular <strong>≥ 3 sesiones realizadas</strong> desde su primera asistencia.
            </div>
            <div>
              <strong className="text-slate-800 block">Exclusiones operativas</strong>
              Las sesiones <em>canceladas</em>, <em>no realizadas</em> o <em>futuras</em> no generan inasistencias ni penalizan al estudiante.
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
