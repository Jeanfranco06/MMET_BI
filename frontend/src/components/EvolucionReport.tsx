'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { AiReportButton } from './AiReportButton';

interface EvolucionReportProps {
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const captionId = useId();

  useEffect(() => {
    setPage(1);
  }, [semestre]);

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
        page,
        pageSize,
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
    page,
    pageSize,
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
    setPage(1);
  };

  const hayFiltrosActivos = Boolean(
    facultad ||
      idPractica ||
      idPrograma ||
      grupoEtario ||
      sexo ||
      instrumento ||
      categoriaEvento ||
      agruparPor !== 'programa',
  );

  const programasFiltrados = (filtros?.programas || []).filter(
    (p) => !semestre || p.periodo_academico === semestre,
  );
  const programaSeleccionado = programasFiltrados.find((p) => String(p.id_programa) === idPrograma);
  const pag = data?.paginacion;
  const totales: any[] = data?.totales_por_instrumento || [];

  const etiquetaDimension =
    agruparPor === 'facultad'
      ? 'Facultad / Área'
      : agruparPor === 'grupo_etario'
        ? 'Grupo etario'
        : 'Programa';

  return (
    <div className="space-y-5">
      {/* Encabezado y filtros propios del reporte */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              RG-01 · Evolución del Estrés Percibido (PSS-10) y Síntomas Postraumáticos (PCL-5)
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
            reporte="RG-01"
            corte={data?.corte || corte}
            disabled={loading || !data}
            filtros={{ semestre, facultad, idPractica, idPrograma, instrumento, agruparPor }}
            kpis={
              data
                ? Object.fromEntries(
                    totales.map((t) => [
                      t.codigo_instrumento,
                      {
                        pares_validos: t.pares_validos,
                        promedio_inicial: t.promedio_inicial,
                        promedio_final: t.promedio_final,
                        reduccion_promedio: t.reduccion_promedio,
                        semaforo: t.semaforo,
                      },
                    ]),
                  )
                : null
            }
            grupos={(data?.filas || []).map((r: any) => ({
              nombre: `${r.codigo_instrumento} · ${r.dim_clave}`,
              n: Number(r.pares_validos || 0),
              instrumento: r.codigo_instrumento,
              valor: r.reduccion_promedio,
              semaforo: r.semaforo,
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
            <span className="block text-xs font-medium text-slate-600 mb-1">Instrumento</span>
            <select
              value={instrumento}
              onChange={(e) => {
                setInstrumento(e.target.value as '' | 'PSS-10' | 'PCL-5');
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Ambos (separados)</option>
              <option value="PSS-10">PSS-10 · Estrés percibido (0–40 pts)</option>
              <option value="PCL-5">PCL-5 · Síntomas postraumáticos (0–80 pts)</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Agrupar filas por</span>
            <select
              value={agruparPor}
              onChange={(e) => {
                setAgruparPor(e.target.value as 'programa' | 'facultad' | 'grupo_etario');
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="programa">Instrumento → Programa</option>
              <option value="facultad">Instrumento → Facultad / Área</option>
              <option value="grupo_etario">Instrumento → Grupo etario</option>
            </select>
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
            <span className="block text-xs font-medium text-slate-600 mb-1">Grupo etario</span>
            <select
              value={grupoEtario}
              onChange={(e) => {
                setGrupoEtario(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Todos los grupos</option>
              {(filtros?.gruposEtarios || ['18-20', '21-23', '24-26', '27+']).map((g) => (
                <option key={g} value={g}>
                  {g} años
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Sexo</span>
            <select
              value={sexo}
              onChange={(e) => {
                setSexo(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Todos</option>
              {(filtros?.sexos || ['F', 'M', 'NO_ESPECIFICADO']).map((s) => (
                <option key={s} value={s}>
                  {s === 'F' ? 'Femenino (F)' : s === 'M' ? 'Masculino (M)' : 'No especificado'}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2 lg:col-span-2">
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
                Evolución pareada por Instrumento y {etiquetaDimension}
              </h3>
              <span className="text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-0.5 rounded-full">
                Corte {formatFechaEs(corte)}
              </span>
            </div>
            {pag && (
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                Mostrando <strong className="text-slate-700">{data?.filas?.length || 0}</strong> de{' '}
                <strong className="text-slate-700">{pag.totalRegistros.toLocaleString()}</strong> grupos
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
                Evolución pareada de PSS-10 y PCL-5 agrupada por {etiquetaDimension} al corte {formatFechaEs(corte)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Instrumento</th>
                  <th scope="col">{etiquetaDimension}</th>
                  <th scope="col">Pares válidos (n)</th>
                  <th scope="col">Prom. Inicial</th>
                  <th scope="col">Prom. Final</th>
                  <th scope="col">Reducción (pts)</th>
                  <th scope="col">Disminuyeron</th>
                  <th scope="col">Sin cambio</th>
                  <th scope="col">Aumentaron</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-500">
                      Consultando pares válidos en SQL Server...
                    </td>
                  </tr>
                ) : !data?.filas?.length ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-500">
                      No se encontraron pares válidos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  data.filas.map((r: any) => (
                    <tr key={`${r.codigo_instrumento}-${r.dim_clave}`}>
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
                        {r.version_instrumento && (
                          <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                            {r.version_instrumento}
                          </div>
                        )}
                      </th>
                      <td data-label={etiquetaDimension}>
                        <div className="font-semibold text-slate-900">
                          {agruparPor === 'programa' ? compactPrograma(r.dim_clave) : r.dim_clave}
                        </div>
                        {agruparPor === 'programa' && (r.dim_subtitulo || r.estado_programa) && (
                          <div
                            className="text-[11px] text-slate-500 truncate max-w-[210px] mx-auto"
                            title={
                              r.estado_programa
                                ? `${r.dim_subtitulo} · ${r.estado_programa}`
                                : r.dim_subtitulo
                            }
                          >
                            {r.dim_subtitulo}
                            {r.estado_programa ? ` · ${r.estado_programa}` : ''}
                          </div>
                        )}
                      </td>
                      <td data-label="Pares válidos (n)" className="tabular-nums font-medium text-slate-700">
                        {r.pares_validos}
                      </td>
                      <td data-label="Prom. Inicial" className="tabular-nums text-slate-700">
                        {r.suprimido ? 'Suprimido' : r.promedio_inicial != null ? r.promedio_inicial.toFixed(2) : '—'}
                      </td>
                      <td data-label="Prom. Final" className="tabular-nums text-slate-700">
                        {r.suprimido ? 'Suprimido' : r.promedio_final != null ? r.promedio_final.toFixed(2) : '—'}
                      </td>
                      <td data-label="Reducción (pts)" className="tabular-nums font-bold">
                        {r.suprimido ? (
                          <span className="text-slate-400 font-normal">n &lt; 5</span>
                        ) : r.reduccion_promedio != null ? (
                          <span className={r.reduccion_promedio >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {r.reduccion_promedio > 0 ? '+' : ''}
                            {r.reduccion_promedio.toFixed(2)} pts
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td data-label="Disminuyeron" className="tabular-nums font-semibold text-emerald-700">
                        {r.suprimido ? '—' : r.disminuyeron ?? '—'}
                      </td>
                      <td data-label="Sin cambio" className="tabular-nums text-slate-600">
                        {r.suprimido ? '—' : r.sin_cambio ?? '—'}
                      </td>
                      <td data-label="Aumentaron" className="tabular-nums text-rose-700">
                        {r.suprimido ? '—' : r.aumentaron ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {totales.length > 0 && (
                <tfoot>
                  {totales.map((t: any) => (
                    <tr
                      key={`tot-${t.codigo_instrumento}`}
                      className={
                        t.codigo_instrumento === 'PSS-10'
                          ? 'bg-teal-50/75 font-semibold text-slate-900 text-xs'
                          : 'bg-sky-50/75 font-semibold text-slate-900 text-xs'
                      }
                    >
                      <th scope="row" className="whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          TOTAL {t.codigo_instrumento}
                        </div>
                        <div className="text-[11px] font-medium text-slate-600">
                          {t.codigo_instrumento === 'PSS-10' ? 'Escala 0–40 pts' : 'Escala 0–80 pts'}
                        </div>
                      </th>
                      <td data-label={etiquetaDimension} className="text-slate-400">
                        —
                      </td>
                      <td data-label="Pares válidos (n)" className="tabular-nums font-bold">
                        {t.pares_validos.toLocaleString()}
                      </td>
                      <td data-label="Prom. Inicial" className="tabular-nums font-bold">
                        {t.suprimido ? 'Suprimido' : t.promedio_inicial != null ? t.promedio_inicial.toFixed(2) : '—'}
                      </td>
                      <td data-label="Prom. Final" className="tabular-nums font-bold">
                        {t.suprimido ? 'Suprimido' : t.promedio_final != null ? t.promedio_final.toFixed(2) : '—'}
                      </td>
                      <td data-label="Reducción (pts)" className="tabular-nums font-bold text-teal-900">
                        {t.suprimido
                          ? 'n < 5'
                          : t.reduccion_promedio != null
                            ? `${t.reduccion_promedio > 0 ? '+' : ''}${t.reduccion_promedio.toFixed(2)} pts`
                            : '—'}
                      </td>
                      <td data-label="Disminuyeron" className="tabular-nums font-bold text-emerald-800">
                        {t.suprimido ? '—' : t.disminuyeron?.toLocaleString() ?? '—'}
                      </td>
                      <td data-label="Sin cambio" className="tabular-nums font-bold text-slate-700">
                        {t.suprimido ? '—' : t.sin_cambio?.toLocaleString() ?? '—'}
                      </td>
                      <td data-label="Aumentaron" className="tabular-nums font-bold text-rose-800">
                        {t.suprimido ? '—' : t.aumentaron?.toLocaleString() ?? '—'}
                      </td>
                    </tr>
                  ))}
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
      <section aria-label="Leyenda de instrumentos y reglas de cómputo" className="space-y-3 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">PSS-10 · Estrés percibido (0–40 pts)</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Escala de 10 ítems aplicada al inicio y cierre del programa sobre pares válidos en ventana.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-600 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">PCL-5 · Síntomas postraumáticos (0–80 pts)</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Escala de 20 ítems; exige que la evaluación inicial y final correspondan al mismo evento índice.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">Separación de escalas</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                PSS-10 y PCL-5 nunca se suman ni se promedian juntos; cada uno mantiene su propio total.
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
              <strong className="text-slate-800 block">Diferencia pareada (pts)</strong>
              <code>PuntajeInicial − PuntajeFinal</code>. Un valor positivo indica disminución de síntomas respecto a la evaluación inicial.
            </div>
            <div>
              <strong className="text-slate-800 block">Criterio de par válido</strong>
              Requiere evaluación inicial y final vigentes, válidas, completadas dentro de ventana (<code>en_ventana = 1</code>) y hasta la fecha de corte.
            </div>
            <div>
              <strong className="text-slate-800 block">Privacidad estadística</strong>
              Los grupos con menos de 5 pares válidos (<code>n &lt; 5</code>) se suprimen automáticamente.
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
