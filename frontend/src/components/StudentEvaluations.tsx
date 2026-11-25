'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Opportunity = { id_oportunidad: number; codigo_instrumento: string; momento: string; numero_version: string; idioma: string; estado: string; texto_periodo: string; instrucciones: string; fecha_ventana_inicio: string; fecha_ventana_fin: string };
type FormModel = { oportunidad: Opportunity; items: Array<{ numero_item: number; texto_item: string }>; opciones: Array<{ valor: number; etiqueta: string }>; respuestas: Array<{ numero_item: number; valor: number }> };

export function StudentEvaluations({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [form, setForm] = useState<FormModel | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [evaluationDate, setEvaluationDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = async () => setOpportunities(await api.getMyEvaluations());
  useEffect(() => { loadList().catch((e) => setError(e.message)); }, []);

  const open = async (id: number) => {
    setError(null); setMessage(null);
    try {
      const next = await api.getMyEvaluation(id) as FormModel;
      setForm(next);
      setAnswers(Object.fromEntries(next.respuestas.map((a) => [a.numero_item, a.valor])));
    } catch (e: any) { setError(e.message); }
  };

  const save = async () => {
    if (!form) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const respuestas = Object.entries(answers).map(([numero_item, valor]) => ({ numero_item: Number(numero_item), valor }));
      const result = await api.saveMyEvaluationDraft(form.oportunidad.id_oportunidad, respuestas);
      setMessage(`Borrador guardado (${result.guardado} de ${result.total} respuestas).`);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const respuestas = Object.entries(answers).map(([numero_item, valor]) => ({ numero_item: Number(numero_item), valor }));
      const result = await api.submitMyEvaluation(form.oportunidad.id_oportunidad, respuestas, evaluationDate);
      setMessage(`Evaluación enviada. ${result.total_items} respuestas guardadas; puntuación calculada en el servidor.`);
      setForm(null); await loadList();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
      <div><h1 className="text-xl font-bold text-slate-900">Mis evaluaciones</h1><p className="text-sm text-slate-600">Cuenta: {username}. Tus respuestas son privadas.</p></div>
      <button type="button" onClick={onLogout} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cerrar sesión</button>
    </header>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{message}</p>}
    {form ? <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div><button type="button" onClick={() => setForm(null)} className="mb-3 text-sm text-teal-800 underline">← Volver a mis evaluaciones</button>
        <h2 className="text-lg font-semibold">{form.oportunidad.codigo_instrumento} · {form.oportunidad.momento}</h2>
        <p className="text-sm text-slate-600">Versión {form.oportunidad.numero_version}; período: {form.oportunidad.texto_periodo}</p>
      </div>
      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{form.oportunidad.instrucciones}</p>
      <div className="space-y-4">{form.items.map((item) => <fieldset key={item.numero_item} className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-900">{item.numero_item}. {item.texto_item}</legend>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">{form.opciones.map((option) => <label key={option.valor} className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="radio" name={`item-${item.numero_item}`} required value={option.valor} checked={answers[item.numero_item] === option.valor} onChange={() => setAnswers((old) => ({ ...old, [item.numero_item]: option.valor }))} />
          <span>{option.valor} · {option.etiqueta}</span>
        </label>)}</div>
      </fieldset>)}</div>
      <div className="max-w-xs"><label htmlFor="evaluation-date" className="block text-sm font-medium">Fecha de respuesta</label><input id="evaluation-date" type="date" required min={form.oportunidad.fecha_ventana_inicio} max={new Date().toLocaleDateString('en-CA')} value={evaluationDate} onChange={(e) => setEvaluationDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></div>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={save} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar borrador'}</button><button type="submit" disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Enviar respuestas</button></div>
    </form> : <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-semibold">Oportunidades asignadas</h2>{opportunities.length ? <ul className="divide-y divide-slate-200">{opportunities.map((op) => <li key={op.id_oportunidad} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{op.codigo_instrumento} · {op.momento}</p><p className="text-sm text-slate-600">{op.fecha_ventana_inicio} a {op.fecha_ventana_fin} · {op.estado}</p></div>{op.estado !== 'COMPLETADA' && <button type="button" onClick={() => open(op.id_oportunidad)} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">{op.estado === 'BORRADOR' ? 'Continuar' : 'Responder'}</button>}</li>)}</ul> : <p className="text-sm text-slate-600">No tienes evaluaciones completas asignadas disponibles en este momento.</p>}</section>}
  </div>;
}
