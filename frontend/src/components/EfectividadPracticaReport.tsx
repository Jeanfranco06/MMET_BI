'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Calendar, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { AiReportButton } from './AiReportButton';

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

function compactPrograma(codigo: string): string {
  const match = codigo.match(/(P-\d{2}|MIXTO)-(C\d{2})$/);
  if (match) return `${match[1]} · ${match[2]}`;
  return codigo;
}

function CumpleMetaBadge({ cumple, suprimido }: { cumple: boolean | null; suprimido: boolean }) {
  if (suprimido || cumple === null) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        No evaluable (n &lt; 5)
      </span>
    );
  }
  if (cumple) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Cumple meta
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
      <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      No cumple
    </span>
  );
}

export function EfectividadPracticaReport({
  filtros,
  corteInicial,
  semestre,
}: EfectividadPracticaReportProps) {
  const [instrumento, setInstrumento] = useState<'PSS-10' | 'PCL-5'>('PSS-10');
  const [corte, setCorte] = useState(corteInicial);
  const [facultad, setFacultad] = useState('');
  const [vista, setVista] = useState<'practica' | 'programa'>('practica');

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const captionId = useId();

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
      setError(e.message || 'No se pudo cargar el comparativo de efectividad por práctica.');
    } finally {
      setLoading(false);
    }
  }, [instrumento, corte, semestre, facultad]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiarFiltros = () => {
    setInstrumento('PSS-10');
    setFacultad('');
    setVista('practica');
  };

  const hayFiltrosActivos = Boolean(facultad || instrumento !== 'PSS-10' || vista !== 'practica');
  const kpi05 = data?.kpi05_meta_practicas;
  const metaPts = data?.meta_operativa_pts ?? (instrumento === 'PSS-10' ? 4 : 10);
  const filas: any[] = vista === 'practica' ? data?.por_practica || [] : data?.por_programa || [];
  const totalParesFilas = filas.reduce((acc, r) => acc + Number(r.pares_validos || 0), 0);

  return (
    <div className="space-y-5">
      {/* Encabezado y filtros propios del reporte */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              RG-02 · Comparativo de Efectividad y Cumplimiento de Meta por Práctica (KPI-05)
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Semestre: <strong className="text-slate-700">{semestre || 'Todos'}</strong> · Instrumento:{' '}
              <strong className="text-slate-700">{instrumento}</strong> · Referencia operativa:{' '}
              <strong className="text-slate-700">≥ {metaPts.toFixed(1)} pts</strong> · Corte:{' '}
              <strong className="text-slate-700">{formatFechaEs(corte)}</strong>
            </p>
          </div>
          <AiReportButton
            reporte="RG-02"
            corte={data?.corte || corte}
            disabled={loading || !data}
            filtros={{ semestre, instrumento, facultad: facultad || 'TODAS', vista }}
            kpis={
              kpi05
                ? {
                    instrumento,
                    meta_operativa_pts: metaPts,
                    practicas_evaluables: kpi05.practicas_evaluables,
                    practicas_cumplen_meta: kpi05.practicas_cumplen_meta,
                    tasa_cumplimiento_meta_pct: kpi05.tasa_cumplimiento_meta,
                    semaforo: kpi05.semaforo,
                  }
                : null
            }
            grupos={filas.map((r: any) => ({
              nombre: vista === 'practica' ? `${r.codigo_practica} · ${r.nombre_practica}` : r.codigo_programa,
              n: Number(r.pares_validos || 0),
              instrumento,
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
                onChange={(e) => setCorte(e.target.value)}
                className="w-full rounded-lg border border-slate-300 pl-8 pr-2.5 py-1.5 text-sm bg-white"
              />
            </div>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Instrumento</span>
            <select
              value={instrumento}
              onChange={(e) => setInstrumento(e.target.value as 'PSS-10' | 'PCL-5')}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="PSS-10">PSS-10 · Estrés percibido (0–40 pts)</option>
              <option value="PCL-5">PCL-5 · Síntomas postraumáticos (0–80 pts)</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Facultad / Área</span>
            <select
              value={facultad}
              onChange={(e) => setFacultad(e.target.value)}
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
            <span className="block text-xs font-medium text-slate-600 mb-1">Nivel de detalle</span>
            <select
              value={vista}
              onChange={(e) => setVista(e.target.value as 'practica' | 'programa')}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="practica">Por Práctica Principal (P-01..P-04, MIXTO)</option>
              <option value="programa">Desglosado por Programa (Cohorte)</option>
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
                {vista === 'practica'
                  ? `Ranking de efectividad por Práctica Principal — ${instrumento}`
                  : `Desglose de efectividad por Programa (Cohorte) — ${instrumento}`}
              </h3>
              <span className="text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-0.5 rounded-full">
                Corte {formatFechaEs(corte)}
              </span>
            </div>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              Total filas: <strong className="text-slate-700">{filas.length}</strong>
            </span>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-labelledby={captionId}
            className="table-wrapper table-wrapper--paged !border-0 !rounded-none"
          >
            <table className="mwg-table">
              <caption className="sr-only">
                Comparativo de efectividad y cumplimiento de meta por práctica en {instrumento} al corte{' '}
                {formatFechaEs(corte)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{vista === 'practica' ? 'Práctica principal' : 'Programa (Cohorte)'}</th>
                  {vista === 'programa' && <th scope="col">Práctica</th>}
                  <th scope="col">Pares válidos (n)</th>
                  <th scope="col">Prom. Inicial</th>
                  <th scope="col">Prom. Final</th>
                  <th scope="col">Reducción (pts)</th>
                  <th scope="col">Meta operativa</th>
                  <th scope="col">Cumplimiento de meta</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr>
                    <td colSpan={vista === 'programa' ? 8 : 7} className="text-center py-10 text-slate-500">
                      Consultando resultados por práctica en SQL Server...
                    </td>
                  </tr>
                ) : !filas.length ? (
                  <tr>
                    <td colSpan={vista === 'programa' ? 8 : 7} className="text-center py-10 text-slate-500">
                      No se encontraron registros para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filas.map((r: any) => (
                    <tr key={vista === 'practica' ? r.id_practica : r.id_programa}>
                      <th scope="row">
                        {vista === 'practica' ? (
                          <div>
                            <div className="font-semibold text-slate-900">{r.codigo_practica}</div>
                            <div className="text-[11px] font-normal text-slate-500">
                              {r.nombre_practica}
                              {r.es_mixto !== undefined && (
                                <> · {r.es_mixto ? 'Mixto' : 'Unicomponente'}</>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-semibold text-slate-900">{compactPrograma(r.codigo_programa)}</div>
                            <div className="text-[11px] font-normal text-slate-500">{r.estado_programa}</div>
                          </div>
                        )}
                      </th>
                      {vista === 'programa' && (
                        <td data-label="Práctica">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-xs border border-slate-200/80">
                            {r.codigo_practica}
                          </span>
                        </td>
                      )}
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
                          <span className={r.cumple_meta ? 'text-emerald-700' : 'text-amber-700'}>
                            {r.reduccion_promedio > 0 ? '+' : ''}
                            {r.reduccion_promedio.toFixed(2)} pts
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td data-label="Meta operativa" className="tabular-nums text-slate-600">
                        ≥ {metaPts.toFixed(1)} pts
                      </td>
                      <td data-label="Cumplimiento de meta">
                        <CumpleMetaBadge cumple={r.cumple_meta} suprimido={r.suprimido} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {kpi05 && (
                <tfoot>
                  <tr className="bg-teal-50/75 font-semibold text-slate-900 text-xs">
                    <th scope="row" className="bg-teal-50/90 whitespace-nowrap">
                      <div className="font-bold text-slate-900">TOTAL GENERAL</div>
                      <div className="text-[11px] font-medium text-teal-800">Instrumento {instrumento}</div>
                    </th>
                    {vista === 'programa' && <td className="text-slate-400">—</td>}
                    <td data-label="Pares válidos (n)" className="tabular-nums font-bold">
                      {totalParesFilas.toLocaleString()}
                    </td>
                    <td className="text-slate-400">—</td>
                    <td className="text-slate-400">—</td>
                    <td className="text-slate-400">—</td>
                    <td data-label="Meta operativa" className="tabular-nums font-bold text-slate-700">
                      ≥ {metaPts.toFixed(1)} pts
                    </td>
                    <td data-label="Cumplimiento de meta" className="whitespace-nowrap">
                      <div className="font-bold text-emerald-800">
                        {kpi05.practicas_cumplen_meta} cumplen meta
                      </div>
                      <div className="text-[11px] font-medium text-slate-600">
                        {kpi05.practicas_evaluables} prácticas evaluables
                      </div>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </section>

      {/* Leyenda y reglas operacionales DEBAJO del listado */}
      <section aria-label="Leyenda de estados de cumplimiento y reglas de cómputo" className="space-y-3 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">Cumple meta</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Práctica evaluable cuya reducción promedio alcanza o supera la meta operativa del instrumento.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">No cumple</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Práctica evaluable cuya reducción promedio se ubica por debajo de la meta operativa al corte.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500 mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-slate-900">No evaluable (n &lt; 5)</div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Muestra inferior a 5 pares válidos; los promedios se suprimen por privacidad estadística.
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
              <strong className="text-slate-800 block">Separación de escalas</strong>
              PSS-10 y PCL-5 se analizan siempre de forma independiente y nunca se combinan.
            </div>
            <div>
              <strong className="text-slate-800 block">Práctica evaluable</strong>
              Debe acumular al menos <strong>5 pares válidos en ventana</strong> al corte seleccionado.
            </div>
            <div>
              <strong className="text-slate-800 block">Referencia operativa por instrumento</strong>
              PSS-10 utiliza referencia <code>≥ 4.0 pts</code>; PCL-5 utiliza <code>≥ 10.0 pts</code> sobre el mismo evento índice.
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
