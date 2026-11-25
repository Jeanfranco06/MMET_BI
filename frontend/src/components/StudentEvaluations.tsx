'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Cloud,
  LogOut,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { BrandLogo } from './BrandLogo';
import { EmptyState } from './UiStates';

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
  const [loadingList, setLoadingList] = useState(true);
  const [form, setForm] = useState<FormModel | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [evaluationDate, setEvaluationDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [busy, setBusy] = useState(false);
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiFeedback, setAiFeedback] = useState<AiEvalResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const loadList = async () => {
    setLoadingList(true);
    try {
      setOpportunities(await api.getMyEvaluations());
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadList().catch((e) => setError(e.message));
  }, []);

  // Debounced auto-save draft when answers change
  useEffect(() => {
    if (!form || !dirtyRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      const respuestas = Object.entries(answers).map(([numero_item, valor]) => ({
        numero_item: Number(numero_item),
        valor,
      }));
      if (!respuestas.length) return;
      setDraftState('saving');
      try {
        await api.saveMyEvaluationDraft(form.oportunidad.id_oportunidad, respuestas);
        setDraftState('saved');
        dirtyRef.current = false;
      } catch {
        setDraftState('idle');
      }
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [answers, form]);

  const open = async (id: number) => {
    setError(null);
    setMessage(null);
    setAiFeedback(null);
    setDraftState('idle');
    dirtyRef.current = false;
    try {
      const next = (await api.getMyEvaluation(id)) as FormModel;
      setForm(next);
      setAnswers(Object.fromEntries(next.respuestas.map((a) => [a.numero_item, a.valor])));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSelectOption = (numeroItem: number, valor: number) => {
    dirtyRef.current = true;
    setDraftState('idle');
    setAnswers((old) => ({ ...old, [numeroItem]: valor }));
  };

  const saveManual = async () => {
    if (!form) return;
    setBusy(true);
    setDraftState('saving');
    setError(null);
    setMessage(null);
    try {
      const respuestas = Object.entries(answers).map(([numero_item, valor]) => ({
        numero_item: Number(numero_item),
        valor,
      }));
      const result = await api.saveMyEvaluationDraft(form.oportunidad.id_oportunidad, respuestas);
      setDraftState('saved');
      dirtyRef.current = false;
      setMessage(`Borrador guardado (${result.guardado} de ${result.total} respuestas).`);
    } catch (e: any) {
      setError(e.message);
      setDraftState('idle');
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
        `Evaluación ${instrumento} (${momento}) registrada con éxito. Puntaje calculado en el servidor: ${result.puntaje_total} pts.`,
      );
      setForm(null);
      dirtyRef.current = false;
      await loadList();

      setAiLoading(true);
      try {
        const interp = await api.interpretarEvaluacion({
          instrumento,
          puntaje_total: Number(result.puntaje_total),
          momento,
        });
        setAiFeedback(interp);
      } catch {
        // Complementario: no invalida el envío guardado
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
  const totalItems = form?.items.length || 0;
  const progressPct = totalItems > 0 ? Math.round((answeredCount / totalItems) * 100) : 0;

  const pendientes = opportunities.filter((o) => o.estado !== 'COMPLETADA');
  const completadas = opportunities.filter((o) => o.estado === 'COMPLETADA');

  return (
    <div className="min-h-screen bg-[#F1F5F9]">
      {/* Top Wellness App Bar */}
      <header className="sticky top-0 z-20 bg-[#0B1220] text-white border-b border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
          <BrandLogo variant="dark" subtitle="Portal de Bienestar Estudiantil" />
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-teal-400" aria-hidden="true" />
              <span className="font-semibold text-slate-200">{username}</span>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {error && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            {error}
          </div>
        )}

        {message && (
          <div
            role="status"
            className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 flex items-center gap-2.5 shadow-card"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <span className="font-medium">{message}</span>
          </div>
        )}

        {/* AI Preliminary Interpretation Card */}
        {aiLoading && (
          <div
            role="status"
            className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-card flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
              <Sparkles className="w-5 h-5 animate-pulse" aria-hidden="true" />
            </div>
            <div>
              <p className="font-display text-sm font-bold text-slate-900">
                Generando orientación preliminar asistida por IA…
              </p>
              <p className="text-xs text-slate-500">
                Analizando tu resultado numérico de forma anónima (sin datos personales identificables).
              </p>
            </div>
          </div>
        )}

        {aiFeedback && (
          <section
            aria-label="Interpretación preliminar asistida por IA"
            className="rounded-2xl border-2 border-indigo-200/80 bg-white overflow-hidden shadow-card"
          >
            <div className="bg-gradient-to-r from-[#0B1220] via-slate-900 to-indigo-950 px-6 py-5 text-white flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0">
                  <Sparkles className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                    Interpretación Preliminar con IA
                  </div>
                  <h2 className="font-display text-base font-bold text-white">
                    Resultado {aiFeedback.instrumento} · {aiFeedback.momento}
                  </h2>
                </div>
              </div>
              <div className="rounded-xl bg-white/10 border border-white/15 px-3.5 py-2 text-right">
                <div className="text-[10px] uppercase tracking-wider text-slate-300">Puntaje obtenido</div>
                <div className="font-display text-xl font-extrabold text-teal-300 tabular-nums">
                  {aiFeedback.puntaje_total}{' '}
                  <span className="text-xs font-semibold text-slate-300">/ {aiFeedback.escala_maxima}</span>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-sm text-slate-800 leading-relaxed font-medium">
                {aiFeedback.resumen_preliminar}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4">
                  <h3 className="font-display text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5">
                    Observaciones clave
                  </h3>
                  <ul className="space-y-2 text-slate-700 leading-relaxed">
                    {aiFeedback.observaciones_clave.map((obs, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 shrink-0" />
                        <span>{obs}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl bg-indigo-50/50 border border-indigo-200/70 p-4">
                  <h3 className="font-display text-xs font-bold uppercase tracking-wider text-indigo-900 mb-2.5">
                    Sugerencias de seguimiento
                  </h3>
                  <ul className="space-y-2 text-indigo-950/90 leading-relaxed">
                    {aiFeedback.sugerencias_seguimiento.map((sug, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 mt-0.5 shrink-0" />
                        <span>{sug}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200/90 bg-amber-50/80 p-3.5 text-xs text-amber-950 flex gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
                <p className="leading-relaxed">
                  <strong>Aviso importante:</strong> {aiFeedback.disclaimer}
                </p>
              </div>
            </div>
          </section>
        )}

        {form ? (
          /* Guided Clinical Questionnaire Experience */
          <form onSubmit={submit} className="space-y-5">
            {/* Sticky Progress Header */}
            <div className="sticky top-[62px] z-10 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md p-4 sm:p-5 shadow-card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-teal-700 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  Volver a mis evaluaciones
                </button>

                <div className="flex items-center gap-2.5">
                  {draftState === 'saving' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                      <Clock className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      Guardando borrador…
                    </span>
                  )}
                  {draftState === 'saved' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
                      Borrador guardado
                    </span>
                  )}
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200 tabular-nums">
                    {answeredCount} / {totalItems} ({progressPct}%)
                  </span>
                </div>
              </div>

              <div>
                <h1 className="font-display text-lg font-bold text-slate-900">
                  {form.oportunidad.codigo_instrumento} · Evaluación {form.oportunidad.momento}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Versión {form.oportunidad.numero_version} · Período: {form.oportunidad.texto_periodo}
                  {form.oportunidad.codigo_instrumento === 'PSS-10' &&
                    ' · Inversión automática en ítems 4, 5, 7 y 8 (escala 0–40 pts).'}
                </p>
              </div>

              {/* Step Progress Bar */}
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Instructions */}
            <div className="rounded-2xl border border-teal-200/70 bg-teal-50/50 p-4 text-xs sm:text-sm text-teal-950 leading-relaxed">
              {form.oportunidad.instrucciones}
            </div>

            {/* Tactile Card Questions */}
            <div className="space-y-4">
              {form.items.map((item) => {
                const selectedVal = answers[item.numero_item];
                const isAnswered = selectedVal !== undefined;
                return (
                  <fieldset
                    key={item.numero_item}
                    className={`rounded-2xl border bg-white p-5 shadow-card transition-colors ${
                      isAnswered ? 'border-teal-200/90' : 'border-slate-200/80'
                    }`}
                  >
                    <legend className="sr-only">
                      Pregunta {item.numero_item}: {item.texto_item}
                    </legend>
                    <div className="flex items-start gap-3 mb-4">
                      <span
                        className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 tabular-nums ${
                          isAnswered
                            ? 'bg-teal-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.numero_item}
                      </span>
                      <p className="text-sm font-semibold text-slate-900 leading-snug pt-0.5">
                        {item.texto_item}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      {form.opciones.map((option) => {
                        const checked = selectedVal === option.valor;
                        return (
                          <label
                            key={option.valor}
                            className={`relative flex sm:flex-col items-center sm:justify-center gap-2.5 sm:gap-1 rounded-xl border px-3 py-2.5 text-left sm:text-center cursor-pointer transition-all select-none ${
                              checked
                                ? 'border-teal-600 bg-teal-50/90 text-teal-950 ring-2 ring-teal-500/20 shadow-sm'
                                : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100/80 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`item-${item.numero_item}`}
                              required
                              value={option.valor}
                              checked={checked}
                              onChange={() => handleSelectOption(item.numero_item, option.valor)}
                              className="sr-only"
                            />
                            <span
                              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 tabular-nums ${
                                checked
                                  ? 'bg-teal-600 text-white'
                                  : 'bg-white border border-slate-300 text-slate-600'
                              }`}
                            >
                              {option.valor}
                            </span>
                            <span className="text-xs font-medium leading-tight">{option.etiqueta}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>

            {/* Submit Bar */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card flex flex-wrap items-end justify-between gap-4">
              <div className="w-full sm:w-56">
                <label htmlFor="evaluation-date" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Fecha de respuesta
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-teal-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="evaluation-date"
                    type="date"
                    required
                    min={form.oportunidad.fecha_ventana_inicio}
                    max={new Date().toLocaleDateString('en-CA')}
                    value={evaluationDate}
                    onChange={(e) => setEvaluationDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={busy}
                  onClick={saveManual}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" aria-hidden="true" />
                  Guardar borrador
                </button>
                <button
                  type="submit"
                  disabled={busy || answeredCount < totalItems}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-45 transition-colors"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                  {busy ? 'Enviando…' : 'Enviar evaluación'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* Student Welcome & Opportunity Cards */
          <div className="space-y-6">
            <section className="rounded-2xl bg-white border border-slate-200/80 p-6 shadow-card">
              <h1 className="font-display text-2xl font-extrabold text-slate-900 tracking-tight">
                Mis Evaluaciones de Bienestar
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Completa tus cuestionarios estandarizados (<strong className="text-slate-700">PSS-10</strong> y{' '}
                <strong className="text-slate-700">PCL-5</strong>). Tus respuestas son privadas, se guardan automáticamente en borrador y se califican en el servidor.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-slate-100">
                <div className="rounded-xl bg-amber-50/70 border border-amber-200/70 p-3.5">
                  <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Pendientes</div>
                  <div className="font-display text-2xl font-extrabold text-amber-950 tabular-nums mt-0.5">
                    {pendientes.length}
                  </div>
                </div>
                <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/70 p-3.5">
                  <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Completadas</div>
                  <div className="font-display text-2xl font-extrabold text-emerald-950 tabular-nums mt-0.5">
                    {completadas.length}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1 rounded-xl bg-slate-50 border border-slate-200/80 p-3.5">
                  <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Total asignadas</div>
                  <div className="font-display text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">
                    {opportunities.length}
                  </div>
                </div>
              </div>
            </section>

            {/* Pending Cards */}
            <section className="space-y-3">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-slate-500 px-1">
                Evaluaciones pendientes ({pendientes.length})
              </h2>
              {loadingList ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-36 rounded-2xl border border-slate-200 bg-white p-5 animate-pulse" />
                  ))}
                </div>
              ) : pendientes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendientes.map((op) => (
                    <article
                      key={op.id_oportunidad}
                      className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover hover:border-teal-300 transition-all flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-md text-xs font-bold border ${
                              op.codigo_instrumento === 'PSS-10'
                                ? 'bg-teal-50 text-teal-800 border-teal-200'
                                : 'bg-sky-50 text-sky-800 border-sky-200'
                            }`}
                          >
                            {op.codigo_instrumento} · {op.momento}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" aria-hidden="true" />
                            {op.estado === 'BORRADOR' ? 'En borrador' : 'Pendiente'}
                          </span>
                        </div>
                        <h3 className="font-display text-base font-bold text-slate-900">
                          {op.codigo_instrumento === 'PSS-10'
                            ? 'Escala de Estrés Percibido (10 ítems)'
                            : 'Lista de Síntomas Postraumáticos (20 ítems)'}
                        </h3>
                        <p className="text-xs text-slate-500">
                          Ventana: <strong className="text-slate-700">{op.fecha_ventana_inicio}</strong> al{' '}
                          <strong className="text-slate-700">{op.fecha_ventana_fin}</strong> · v{op.numero_version}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => open(op.id_oportunidad)}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-600 transition-colors"
                      >
                        <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
                        {op.estado === 'BORRADOR' ? 'Continuar borrador' : 'Comenzar evaluación'}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
                  <EmptyState
                    title="¡Todo al día!"
                    description="No tienes evaluaciones pendientes por responder en este momento."
                    icon="inbox"
                  />
                </div>
              )}
            </section>

            {/* Completed Cards */}
            {completadas.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-slate-500 px-1">
                  Evaluaciones completadas ({completadas.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {completadas.map((op) => (
                    <div
                      key={op.id_oportunidad}
                      className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-sm font-bold text-slate-800">
                          {op.codigo_instrumento} · {op.momento}
                        </div>
                        <div className="text-xs text-slate-500">
                          Ventana: {op.fecha_ventana_inicio} – {op.fecha_ventana_fin}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Completada
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
