'use client';

import { AlertTriangle, CheckCircle2, EyeOff, MinusCircle, XCircle } from 'lucide-react';
import type { SemaforoEstado } from '@/lib/api';

const CONFIG: Record<
  SemaforoEstado,
  { label: string; classes: string; Icon: typeof CheckCircle2 }
> = {
  BUENO: {
    label: 'Bueno',
    classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: CheckCircle2,
  },
  REGULAR: {
    label: 'Regular',
    classes: 'bg-amber-50 text-amber-900 border-amber-200',
    Icon: AlertTriangle,
  },
  MALO: {
    label: 'Malo',
    classes: 'bg-rose-50 text-rose-800 border-rose-200',
    Icon: XCircle,
  },
  SIN_DATOS: {
    label: 'Sin datos',
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: MinusCircle,
  },
  SUPRIMIDO: {
    label: 'Suprimido (n < 5)',
    classes: 'bg-slate-100 text-slate-700 border-slate-300',
    Icon: EyeOff,
  },
};

export function SemaforoBadge({ estado }: { estado: SemaforoEstado }) {
  const { label, classes, Icon } = CONFIG[estado] || CONFIG.SIN_DATOS;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${classes}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
