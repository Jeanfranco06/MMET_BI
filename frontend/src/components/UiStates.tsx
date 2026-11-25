'use client';

import { Database, EyeOff, FilterX, Inbox } from 'lucide-react';

export function KpiGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Cargando indicadores clave"
      className={`grid grid-cols-1 sm:grid-cols-2 ${
        count >= 5 ? 'xl:grid-cols-5' : count === 3 ? 'lg:grid-cols-3' : 'xl:grid-cols-4'
      } gap-4`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card animate-pulse space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="h-3.5 w-24 rounded-md bg-slate-200" />
            <div className="h-5 w-16 rounded-full bg-slate-100" />
          </div>
          <div className="h-8 w-28 rounded-lg bg-slate-200" />
          <div className="h-1.5 w-full rounded-full bg-slate-100" />
          <div className="flex items-center justify-between pt-1">
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="h-3 w-16 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div
      role="status"
      aria-label="Cargando gráfico"
      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card animate-pulse"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1.5">
          <div className="h-4 w-44 rounded bg-slate-200" />
          <div className="h-3 w-64 rounded bg-slate-100" />
        </div>
        <div className="h-6 w-20 rounded-full bg-slate-100" />
      </div>
      <div
        className="w-full rounded-xl bg-slate-100/80 flex items-end justify-around p-6 gap-3"
        style={{ height: `${height}px` }}
      >
        {[42, 68, 55, 82, 60, 74].map((h, i) => (
          <div
            key={i}
            className="w-full max-w-[44px] rounded-t-lg bg-slate-200/90"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div
      role="status"
      aria-label="Cargando tabla de datos"
      className="rounded-2xl border border-slate-200/80 bg-white shadow-card overflow-hidden animate-pulse"
    >
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="h-4 w-56 rounded bg-slate-200" />
        <div className="h-3.5 w-28 rounded bg-slate-100" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((__, cIdx) => (
              <div
                key={cIdx}
                className={`h-4 rounded ${cIdx === 0 ? 'bg-slate-200 w-3/4' : 'bg-slate-100 w-2/3'}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title = 'Sin registros para los filtros actuales',
  description = 'Ajusta los filtros de semestre, facultad, programa o fecha de corte para consultar datos disponibles en el Data Mart.',
  actionLabel,
  onAction,
  icon = 'inbox',
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: 'inbox' | 'filter' | 'database';
}) {
  const Icon = icon === 'filter' ? FilterX : icon === 'database' ? Database : Inbox;

  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-400 mb-3.5">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </div>
      <h4 className="font-display text-sm font-bold text-slate-900">{title}</h4>
      <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function SuppressedState({
  n,
  context = 'el segmento seleccionado',
}: {
  n?: number;
  context?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 rounded-xl bg-slate-50/80 border border-dashed border-slate-300">
      <div className="w-11 h-11 rounded-2xl bg-slate-200/70 flex items-center justify-center text-slate-600 mb-3">
        <EyeOff className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-200/80 text-[11px] font-semibold text-slate-700 mb-1.5">
        Privacidad Estadística · n &lt; 5
      </div>
      <h4 className="font-display text-sm font-bold text-slate-900">
        Resultados suprimidos por tamaño muestral
      </h4>
      <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
        {n !== undefined ? `Se registran ${n} observaciones válidas en ${context}. ` : ''}
        Por política ética y anonimización, los promedios y tasas se ocultan automáticamente cuando el grupo contiene menos de 5 casos válidos.
      </p>
    </div>
  );
}
