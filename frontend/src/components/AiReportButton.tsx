'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Compass,
  Gauge,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

interface AiReportButtonProps {
  reporte: 'RO-01' | 'RO-02' | 'RG-01' | 'RG-02';
  corte: string;
  filtros?: Record<string, any>;
  kpis: Record<string, any> | null;
  grupos?: Array<{
    nombre: string;
    n: number;
    instrumento?: 'PSS-10' | 'PCL-5';
    valor?: number | null;
    semaforo?: string;
  }>;
  disabled?: boolean;
}

const REPORT_NAMES: Record<AiReportButtonProps['reporte'], string> = {
  'RG-01': 'Evolución Estrés y Trauma',
  'RG-02': 'Efectividad por Práctica',
  'RO-01': 'Continuidad y Abandono',
  'RO-02': 'Control de Evaluaciones',
};

/**
 * Botón + Slide-over Drawer nativo (<dialog className="mwg-slideover">)
 * para el Asistente Analítico IA (RQ-BI-15).
 */
export function AiReportButton({
  reporte,
  corte,
  filtros,
  kpis,
  grupos,
  disabled,
}: AiReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.interpretarReporte>> | null>(null);

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      setOpen(false);
    };
    dialog.addEventListener('close', handleClose);

    // Fallback obligatorio para navegadores sin closedby nativo (Safari)
    let cleanupFallback: (() => void) | undefined;
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      const onDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) dialog.close();
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', onDown);
      dialog.addEventListener('pointerup', onUp);
      cleanupFallback = () => {
        dialog.removeEventListener('pointerdown', onDown);
        dialog.removeEventListener('pointerup', onUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupFallback?.();
    };
  }, []);

  const runAnalysis = async () => {
    if (!kpis) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const gruposValidos = (grupos || []).filter((g) => g.n >= 5);
      const data = await api.interpretarReporte({
        reporte,
        corte,
        filtros,
        kpis,
        grupos: gruposValidos,
      });
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'No se pudo generar la interpretación asistida por IA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled || !kpis}
        onClick={runAnalysis}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:from-indigo-700 hover:to-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-45 transition-all"
      >
        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Interpretar con IA</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        {...({ closedby: 'any' } as Record<string, string>)}
        className="mwg-slideover"
      >
        <div className="h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col">
          {/* Header with indigo accent */}
          <div className="relative overflow-hidden bg-[#0B1220] px-6 py-5 text-white shrink-0">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full bg-indigo-500/25 blur-2xl"
            />
            <div className="relative z-10 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-200 mb-2">
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  Asistente Analítico IA · RQ-BI-15
                </div>
                <h1 id={titleId} className="font-display text-lg font-bold tracking-tight text-white">
                  {reporte} · {REPORT_NAMES[reporte]}
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Corte {corte} · Solo agregados validados (n ≥ 5, sin PII)
                </p>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => dialogRef.current?.close()}
                aria-label="Cerrar panel de asistente IA"
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
            {loading && (
              <div role="status" className="space-y-4">
                <div className="flex items-center gap-3 rounded-2xl border border-indigo-200/80 bg-indigo-50/60 p-4">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/15 flex items-center justify-center text-indigo-600 shrink-0">
                    <Sparkles className="w-4 h-4 animate-pulse" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-indigo-950">Sintetizando indicadores del Data Mart…</p>
                    <p className="text-[11px] text-indigo-700/80">
                      Evaluando semáforos y umbrales de privacidad estadística (n ≥ 5)
                    </p>
                  </div>
                </div>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-2.5 animate-pulse"
                  >
                    <div className="h-3.5 w-36 rounded bg-slate-200" />
                    <div className="h-3 w-full rounded bg-slate-100" />
                    <div className="h-3 w-5/6 rounded bg-slate-100" />
                    <div className="h-3 w-2/3 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 flex gap-3"
              >
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" aria-hidden="true" />
                <div className="space-y-2">
                  <p className="font-semibold">No se pudo completar el análisis</p>
                  <p className="text-xs text-rose-800">{error}</p>
                  <button
                    type="button"
                    onClick={runAnalysis}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    Reintentar
                  </button>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-4 text-sm">
                {/* 1. Hechos observados */}
                <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <h2 className="font-display text-sm font-bold text-slate-900">
                      1. Hechos observados
                    </h2>
                  </div>
                  <ul className="space-y-2 text-xs leading-relaxed text-slate-700">
                    {result.hechos_observados.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 shrink-0" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* 2. Lectura de semáforos */}
                <section className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-card">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                      <Gauge className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <h2 className="font-display text-sm font-bold text-amber-950">
                      2. Lectura de semáforos
                    </h2>
                  </div>
                  <ul className="space-y-2 text-xs leading-relaxed text-amber-950/90">
                    {result.lectura_semaforos.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* 3. Recomendaciones de gestión */}
                <section className="rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-4 shadow-card">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                      <Compass className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <h2 className="font-display text-sm font-bold text-indigo-950">
                      3. Recomendaciones de gestión
                    </h2>
                  </div>
                  <ul className="space-y-2 text-xs leading-relaxed text-indigo-950/90">
                    {result.recomendaciones_gestion.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2
                          className="w-3.5 h-3.5 text-indigo-600 mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Disclaimer banner */}
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-[11px] text-slate-600 flex gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1 leading-relaxed">
                    <p className="font-semibold text-slate-700">Aviso metodológico (no clínico / no causal)</p>
                    <p>{result.nota_metodologica}</p>
                    <p className="text-slate-400 pt-0.5">
                      Motor: <span className="font-mono text-slate-500">{result.modelo}</span> ·{' '}
                      {result.fuente === 'llm_externo' ? 'API LLM externa' : 'Motor de reglas estructurado'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 bg-white px-6 py-3.5 flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={runAnalysis}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Regenerar
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Cerrar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
