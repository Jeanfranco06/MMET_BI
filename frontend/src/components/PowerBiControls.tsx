'use client';

import { Filter, Sparkles, X } from 'lucide-react';

export interface SlicerOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function SlicerPills<T extends string>({
  label,
  options,
  value,
  onChange,
  accent = 'teal',
}: {
  label: string;
  options: SlicerOption<T>[];
  value: T;
  onChange: (val: T) => void;
  accent?: 'teal' | 'indigo' | 'slate';
}) {
  const activeStyle =
    accent === 'indigo'
      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
      : accent === 'slate'
        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
        : 'bg-teal-600 text-white border-teal-600 shadow-sm';

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
        {label}:
      </span>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-all ${
              selected
                ? activeStyle
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-md tabular-nums ${
                  selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function CrossFilterBanner({
  items,
  onClearAll,
}: {
  items: Array<{ label: string; value: string; onClear: () => void }>;
  onClearAll: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Filtros cruzados activos"
      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-2xl bg-teal-50/90 border border-teal-200/90 text-teal-950 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-bold text-teal-800">
          <Filter className="w-3.5 h-3.5" aria-hidden="true" />
          Filtro cruzado activo:
        </span>
        {items.map((item) => (
          <span
            key={`${item.label}-${item.value}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-teal-200 text-teal-900 font-semibold shadow-xs"
          >
            <span className="text-teal-600 font-normal">{item.label} =</span>
            <span>{item.value}</span>
            <button
              type="button"
              onClick={item.onClear}
              aria-label={`Quitar filtro cruzado ${item.label}`}
              className="ml-0.5 text-teal-500 hover:text-teal-800"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={onClearAll}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
        Limpiar filtro cruzado
      </button>
    </div>
  );
}

export function PowerBiHintBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/70 text-[11px] font-semibold">
      <Sparkles className="w-3 h-3" aria-hidden="true" />
      Interactivo · Cross-Filtering
    </span>
  );
}
