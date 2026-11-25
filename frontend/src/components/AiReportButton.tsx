'use client';

import { useState } from 'react';
import { Sparkles, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { ModalDialog } from './ModalDialog';

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

  const handleAnalyze = async () => {
    if (!kpis) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Filtra previamente grupos con n >= 5 para cumplir supresión estadística en cliente y servidor
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
        onClick={handleAnalyze}
        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50"
      >
        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
        Interpretar con IA
      </button>

      <ModalDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Interpretación asistida por IA · ${reporte}`}
        subtitle={`Corte ${corte} · Solo agregados validados (n ≥ 5, sin PII)`}
      >
        {loading && (
          <p role="status" className="py-8 text-center text-sm text-slate-600">
            Analizando indicadores agregados del reporte {reporte}...
          </p>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 flex gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div>{error}</div>
          </div>
        )}

        {result && (
          <div className="space-y-4 text-sm">
            <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <h2 className="font-semibold text-slate-900 mb-2">1. Hechos observados</h2>
              <ul className="list-disc pl-5 space-y-1 text-slate-700">
                {result.hechos_observados.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <h2 className="font-semibold text-amber-950 mb-2">2. Lectura de semáforos</h2>
              <ul className="list-disc pl-5 space-y-1 text-amber-950/90">
                {result.lectura_semaforos.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-teal-200 bg-teal-50/60 p-4">
              <h2 className="font-semibold text-teal-950 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-700" aria-hidden="true" />
                3. Recomendaciones de gestión
              </h2>
              <ul className="list-disc pl-5 space-y-1 text-teal-950/90">
                {result.recomendaciones_gestion.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </section>

            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 flex gap-2">
              <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <p>{result.nota_metodologica}</p>
                <p className="text-slate-400">
                  Motor: {result.modelo} ({result.fuente === 'llm_externo' ? 'API LLM externa' : 'Respaldo estructurado'})
                </p>
              </div>
            </div>
          </div>
        )}
      </ModalDialog>
    </>
  );
}
