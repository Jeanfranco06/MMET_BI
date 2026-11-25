'use client';

import { useEffect, useState } from 'react';
import { Sparkles, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';

type Opportunity = {
  id_oportunidad: number;
  codigo_instrumento: 'PSS-10' | 'PCL-5';
  momento: 'INICIAL' | 'FINAL';
  numero_version: string;
  idioma: string;
  estado: string;
  texto_periodo: string;
  instrucciones: string;
  fecha_ventana_inicio: string;
  fecha_ventana_fin: string;
};

type FormModel = {
  oportunidad: Opportunity;
  items: Array<{ numero_item: number; texto_item: string }>;
  opciones: Array<{ valor: number; etiqueta: string }>;
  respuestas: Array<{ numero_item: number; valor: number }>;
};

type AiEvalResult = Awaited<ReturnType<typeof api.interpretarEvaluacion>>;

export function StudentEvaluations({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [form, setForm] = useState<FormModel | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [evaluationDate, setEvaluationDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiFeedback, setAiFeedback] = useState<AiEvalResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadList = async () => setOpportunities(await api.getMyEvaluations());
  useEffect(() => {
    loadList().catch((e) => setError(e.message));
  }, []);

  const open = async (id: number) => {
    setError(null);
    setMessage(null);
    setAiFeedback(null);
    try {
      const next = (await api.getMyEvaluation(id)) as FormModel;
      setForm(next);
      setAnswers(Object.fromEntries(next.respuestas.map((a) => [a.numero_item, a.valor])));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const respuestas = Object.entries(answers).map(([numero_item, valor]) => ({
        numero_item: Number(numero_item),
        valor,
      }));
      const result = await api.saveMyEvaluationDraft(form.oportunidad.id_oportunidad, respuestas);
      setMessage(`Borrador guardado (${result.guardado} de ${result.total} respuestas).`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setAiFeedback(null);

    const instrumento = form.oportunidad.codigo_instrumento;
    const momento = form.oportunidad.momento;

    try {
      const respuestas = Object.entries(answers).map(([numero_item, valor]) => ({
        numero_item: Number(numero_item),
        valor,
      }));
      const result = await api.submitMyEvaluation(
        form.oportunidad.id_oportunidad,
        respuestas,
        evaluationDate,
      );
      setMessage(
        `Evaluación ${instrumento} (${momento}) enviada. ${result.total_items} respuestas guardadas; puntaje calculado en el servidor: ${result.puntaje_total} pts.`,
      );
      setForm(null);
      await loadList();

      // Solicita interpretación preliminar asistida por IA (solo resumen numérico anónimo)
      setAiLoading(true);
      try {
        const interp = await api.interpretarEvaluacion({
          instrumento,
          puntaje_total: Number(result.puntaje_total),
          momento,
        });
        setAiFeedback(interp);
      } catch {
        // La interpretación IA es complementaria; no invalida el envío guardado
      } finally {
        setAiLoading(false);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const answeredCount = Object.keys(answers).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Mis evaluaciones (PSS-10 y PCL-5)</h1>
          <p className="text-sm text-slate-600">
            Cuenta: {username}. Tus respuestas son privadas y se puntúan automáticamente en el servidor.
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          Cerrar sesión
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-700" aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}

      {aiLoading && (
        <div role="status" className="rounded-xl border border-teal-200 bg-white p-5 text-sm text-slate-600 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-700 animate-pulse" aria-hidden="true" />
          <span>Generando interpretación preliminar asistida por IA...</span>
        </div>
      )}

      {aiFeedback && (
        <section
          aria-label="Interpretación preliminar asistida por IA"
          className="rounded-xl border border-teal-200 bg-white p-5 shadow-sm space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-teal-700" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">
                Interpretación preliminar asistida por IA · {aiFeedback.instrumento} ({aiFeedback.momento})
              </h2>
            </div>
            <span className="rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-xs font-semibold text-teal-800 tabular-nums">
              Puntaje: {aiFeedback.puntaje_total} / {aiFeedback.escala_maxima}
            </span>
          </div>

          <p className="text-sm text-slate-800">{aiFeedback.resumen_preliminar}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5">
              <h3 className="font-semibold text-slate-900 mb-1.5">Observaciones clave</h3>
              <ul className="list-disc pl-5 space-y-1 text-slate-700">
                {aiFeedback.observaciones_clave.map((obs, idx) => (
                  <li key={idx}>{obs}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg bg-teal-50/60 border border-teal-200 p-3.5">
              <h3 className="font-semibold text-teal-950 mb-1.5">Sugerencias de seguimiento</h3>
              <ul className="list-disc pl-5 space-y-1 text-teal-950/90">
                {aiFeedback.sugerencias_seguimiento.map((sug, idx) => (
                  <li key={idx}>{sug}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 flex gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" aria-hidden="true" />
            <p>
              <strong>Aviso importante:</strong> {aiFeedback.disclaimer}
            </p>
          </div>
        </section>
      )}

      {form ? (
        <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="mb-3 text-sm text-teal-800 underline"
            >
              ← Volver a mis evaluaciones
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                {form.oportunidad.codigo_instrumento} · {form.oportunidad.momento}
              </h2>
              <span className="text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full tabular-nums">
                Respondidas: {answeredCount} / {form.items.length}
              </span>
            </div>
            <p className="text-sm text-slate-600">
              Versión {form.oportunidad.numero_version} · {form.items.length} ítems · período:{' '}
              {form.oportunidad.texto_periodo}
              {form.oportunidad.codigo_instrumento === 'PSS-10' &&
                ' · Calificación automática con inversión en ítems 4, 5, 7 y 8 (0–40 pts).'}
            </p>
          </div>

          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            {form.oportunidad.instrucciones}
          </p>

          <div className="space-y-4">
            {form.items.map((item) => (
              <fieldset key={item.numero_item} className="rounded-lg border border-slate-200 p-4">
                <legend className="px-1 text-sm font-medium text-slate-900">
                  {item.numero_item}. {item.texto_item}
                </legend>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  {form.opciones.map((option) => (
                    <label
                      key={option.valor}
                      className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name={`item-${item.numero_item}`}
                        required
                        value={option.valor}
                        checked={answers[item.numero_item] === option.valor}
                        onChange={() =>
                          setAnswers((old) => ({ ...old, [item.numero_item]: option.valor }))
                        }
                      />
                      <span>
                        {option.valor} · {option.etiqueta}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="max-w-xs">
            <label htmlFor="evaluation-date" className="block text-sm font-medium text-slate-800">
              Fecha de respuesta
            </label>
            <input
              id="evaluation-date"
              type="date"
              required
              min={form.oportunidad.fecha_ventana_inicio}
              max={new Date().toLocaleDateString('en-CA')}
              value={evaluationDate}
              onChange={(e) => setEvaluationDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {busy ? 'Enviando…' : 'Enviar respuestas'}
            </button>
          </div>
        </form>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Oportunidades asignadas</h2>
          {opportunities.length ? (
            <ul className="divide-y divide-slate-200">
              {opportunities.map((op) => (
                <li key={op.id_oportunidad} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {op.codigo_instrumento} · {op.momento}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        ({op.codigo_instrumento === 'PSS-10' ? '10 ítems' : '20 ítems'} · v{op.numero_version})
                      </span>
                    </p>
                    <p className="text-sm text-slate-600">
                      Ventana: {op.fecha_ventana_inicio} a {op.fecha_ventana_fin} · Estado:{' '}
                      <strong className="text-slate-800">{op.estado}</strong>
                    </p>
                  </div>
                  {op.estado !== 'COMPLETADA' && (
                    <button
                      type="button"
                      onClick={() => open(op.id_oportunidad)}
                      className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                    >
                      {op.estado === 'BORRADOR' ? 'Continuar' : 'Responder'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">
              No tienes evaluaciones asignadas disponibles en este momento.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
