'use client';

import type { SemaforoEstado } from '@/lib/api';

const CONFIG: Record<
  SemaforoEstado,
  { label: string; badgeClasses: string; dotClasses: string }
> = {
  BUENO: {
    label: 'Bueno',
    badgeClasses: 'bg-emerald-50 text-emerald-800 border-emerald-200/90',
    dotClasses: 'bg-emerald-500',
  },
  REGULAR: {
    label: 'Regular',
    badgeClasses: 'bg-amber-50 text-amber-800 border-amber-200/90',
    dotClasses: 'bg-amber-500',
  },
  MALO: {
    label: 'Malo',
    badgeClasses: 'bg-rose-50 text-rose-800 border-rose-200/90',
    dotClasses: 'bg-rose-500',
  },
  SIN_DATOS: {
    label: 'Sin datos',
    badgeClasses: 'bg-slate-100 text-slate-600 border-slate-200',
    dotClasses: 'bg-slate-400',
  },
  SUPRIMIDO: {
    label: 'Suprimido (n < 5)',
    badgeClasses: 'bg-slate-100 text-slate-700 border-slate-300',
    dotClasses: 'bg-slate-500',
  },
};

export function SemaforoBadge({
  estado,
  size = 'sm',
}: {
  estado: SemaforoEstado;
  size?: 'xs' | 'sm';
}) {
  const { label, badgeClasses, dotClasses } = CONFIG[estado] || CONFIG.SIN_DATOS;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold border whitespace-nowrap ${badgeClasses} ${
        size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClasses}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
