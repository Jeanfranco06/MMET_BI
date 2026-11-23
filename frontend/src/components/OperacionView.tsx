'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { ResponsiveTable, type TableColumn } from './ResponsiveTable';

interface OperacionViewProps {
  filtros: FiltrosResponse | null;
  onDataMutated: () => void;
}

export function OperacionView({ filtros, onDataMutated }: OperacionViewProps) {
  const [idPrograma, setIdPrograma] = useState<string>('');
  const [sesiones, setSesiones] = useState<any[]>([]);
  const [oportunidades, setOportunidades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Form estado: registrar/corregir resultado
  const [selectedOp, setSelectedOp] = useState<any | null>(null);
  const [puntaje, setPuntaje] = useState('');
  const [fechaReal, setFechaReal] = useState('2026-11-23');
  const [motivoCorr, setMotivoCorr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const [ses, ops] = await Promise.all([
        api.getSesiones(idPrograma || undefined),
        api.getOportunidadesAbiertas(idPrograma || undefined),
      ]);
      setSesiones(ses);
      setOportunidades(ops);
      if (ops.length > 0 && !selectedOp) {
        setSelectedOp(ops[0]);
      }
    } catch (e: any) {
      setFeedback({ type: 'err', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idPrograma]);

  const handleSubmitResultado = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOp) return;
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await api.registrarResultado({
        id_oportunidad: selectedOp.id_oportunidad,
        puntaje_total: Number(puntaje),
        fecha_realizacion: fechaReal,
        motivo_correccion: selectedOp.id_resultado ? motivoCorr : undefined,
      });
      setFeedback({ type: 'ok', text: res.mensaje });
      setPuntaje('');
      setMotivoCorr('');
      await cargar();
      onDataMutated();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const maxScore = selectedOp?.codigo_instrumento === 'PSS-10' ? 40 : 80;
  const esCorreccion = Boolean(selectedOp?.id_resultado);

  const opCols: TableColumn<any>[] = [
    { key: 'est', header: 'Estudiante', isRowHeader: true, render: (r) => r.codigo_anonimizado },
    { key: 'prog', header: 'Programa', render: (r) => r.codigo_programa },
    { key: 'inst', header: 'Instrumento', render: (r) => `${r.codigo_instrumento} (${r.momento})` },
    { key: 'vent', header: 'Ventana', render: (r) => `${r.fecha_ventana_inicio} → ${r.fecha_ventana_fin}` },
    {
      key: 'res',
      header: 'Estado actual',
      render: (r) =>
        r.id_resultado ? (
          <span className="text-emerald-700 font-medium">
            v{r.numero_version}: {r.puntaje_total} pts {r.en_ventana ? '(En ventana)' : '(Tardía)'}
          </span>
        ) : (
          <span className="text-amber-800 font-medium">Pendiente</span>
        ),
    },
    {
      key: 'acc',
      header: 'Acción',
      render: (r) => (
        <button
          type="button"
          onClick={() => {
            setSelectedOp(r);
            setPuntaje(r.puntaje_total != null ? String(r.puntaje_total) : '');
            setFechaReal(r.fecha_realizacion || r.fecha_ventana_fin || '2026-11-23');
            setFeedback(null);
          }}
          className="px-2.5 py-1 text-xs font-semibold rounded-md bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100"
        >
          {r.id_resultado ? 'Corregir (v+1)' : 'Registrar'}
        </button>
      ),
    },
  ];

  const sesCols: TableColumn<any>[] = [
    { key: 'prog', header: 'Programa', isRowHeader: true, render: (r) => r.codigo_programa },
    { key: 'num', header: 'Sesión #', render: (r) => `#${r.numero_sesion}` },
    { key: 'tec', header: 'Técnica', render: (r) => `${r.codigo_practica} · ${r.nombre_practica}` },
    { key: 'mod', header: 'Modalidad', render: (r) => `${r.modalidad} (${r.duracion_programada_min} min)` },
    { key: 'fec', header: 'Fecha', render: (r) => r.fecha_sesion },
    {
      key: 'est',
      header: 'Estado',
      render: (r) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            r.estado_sesion === 'REALIZADA'
              ? 'bg-emerald-50 text-emerald-800'
              : r.estado_sesion === 'CANCELADA'
                ? 'bg-slate-100 text-slate-700'
                : 'bg-sky-50 text-sky-800'
          }`}
        >
          {r.estado_sesion}
        </span>
      ),
    },
    { key: 'asis', header: 'Asistieron / Faltaron', render: (r) => `${r.total_asistieron} / ${r.total_faltaron}` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Operación Transaccional OLTP (En vivo)</h2>
          <p className="text-sm text-slate-600">
            Registra o versiona evaluaciones directamente en SQL Server respetando triggers, ventanas e historial.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="op-prog-filter" className="text-sm font-medium text-slate-700">
            Programa:
          </label>
          <select
            id="op-prog-filter"
            value={idPrograma}
            onChange={(e) => setIdPrograma(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white"
          >
            <option value="">Todos los programas</option>
            {filtros?.programas.map((p) => (
              <option key={p.id_programa} value={p.id_programa}>
                {p.codigo_programa} ({p.codigo_practica})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={cargar}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualizar
          </button>
        </div>
      </div>

      {/* Formulario de Registro / Corrección Versionada (validate-input-after-interaction) */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardCheck className="w-5 h-5 text-teal-700" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-900">
            {esCorreccion
              ? `Corregir resultado (nueva versión v${Number(selectedOp.numero_version) + 1})`
              : 'Registrar resultado de evaluación'}
          </h3>
        </div>

        {selectedOp ? (
          <form onSubmit={handleSubmitResultado} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
            <div className="md:col-span-4 rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 flex flex-wrap gap-x-6 gap-y-1">
              <span>
                <strong>Oportunidad:</strong> #{selectedOp.id_oportunidad}
              </span>
              <span>
                <strong>Estudiante:</strong> {selectedOp.codigo_anonimizado}
              </span>
              <span>
                <strong>Instrumento:</strong> {selectedOp.codigo_instrumento} ({selectedOp.momento})
              </span>
              <span>
                <strong>Ventana reglamentaria:</strong> {selectedOp.fecha_ventana_inicio} a{' '}
                {selectedOp.fecha_ventana_fin}
              </span>
            </div>

            <div className="mwg-field">
              <label htmlFor="res-puntaje" className="block text-sm font-medium text-slate-800">
                Puntaje total ({selectedOp.codigo_instrumento})
              </label>
              <span id="res-puntaje-hint" className="mwg-hint">
                Rango válido: 0 a {maxScore} puntos
              </span>
              <input
                id="res-puntaje"
                type="number"
                required
                min={0}
                max={maxScore}
                value={puntaje}
                onChange={(e) => setPuntaje(e.target.value)}
                aria-describedby="res-puntaje-hint"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="mwg-error-msg">
                <span role="img" aria-label="Error">
                  ⚠
                </span>{' '}
                Ingrese un puntaje entero entre 0 y {maxScore}.
              </div>
            </div>

            <div className="mwg-field">
              <label htmlFor="res-fecha" className="block text-sm font-medium text-slate-800">
                Fecha de realización
              </label>
              <span id="res-fecha-hint" className="mwg-hint">
                Fuera de ventana se marcará como tardía
              </span>
              <input
                id="res-fecha"
                type="date"
                required
                value={fechaReal}
                onChange={(e) => setFechaReal(e.target.value)}
                aria-describedby="res-fecha-hint"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="mwg-error-msg">
                <span role="img" aria-label="Error">
                  ⚠
                </span>{' '}
                Seleccione una fecha válida.
              </div>
            </div>

            {esCorreccion && (
              <div className="mwg-field md:col-span-2">
                <label htmlFor="res-motivo" className="block text-sm font-medium text-slate-800">
                  Motivo de corrección (auditoría)
                </label>
                <span id="res-motivo-hint" className="mwg-hint">
                  Obligatorio para reemplazar la versión anterior v{selectedOp.numero_version}
                </span>
                <input
                  id="res-motivo"
                  type="text"
                  required
                  minLength={6}
                  maxLength={150}
                  value={motivoCorr}
                  onChange={(e) => setMotivoCorr(e.target.value)}
                  placeholder="Ej. Corrección de suma en hoja de evaluación"
                  aria-describedby="res-motivo-hint"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="mwg-error-msg">
                  <span role="img" aria-label="Error">
                    ⚠
                  </span>{' '}
                  Especifique un motivo de al menos 6 caracteres.
                </div>
              </div>
            )}

            <div className={esCorreccion ? 'md:col-span-4' : 'md:col-span-2 flex items-end pt-6'}>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-50"
              >
                {submitting
                  ? 'Guardando en SQL Server...'
                  : esCorreccion
                    ? 'Guardar nueva versión'
                    : 'Guardar resultado'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500">Seleccione una oportunidad de la tabla inferior.</p>
        )}

        {feedback && (
          <div
            role="status"
            className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              feedback.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}
      </section>

      <ResponsiveTable
        caption="Oportunidades de evaluación abiertas y vigentes (seleccione una para registrar o versionar)"
        columns={opCols}
        rows={oportunidades}
        rowKey={(r) => r.id_oportunidad}
      />

      <ResponsiveTable
        caption="Programación y estado de sesiones (solo sesiones REALIZADA computan asistencias)"
        columns={sesCols}
        rows={sesiones}
        rowKey={(r) => r.id_sesion}
      />
    </div>
  );
}
