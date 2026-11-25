'use client';

import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import type { SemaforoEstado } from '@/lib/api';
import { SemaforoBadge } from './SemaforoBadge';

interface KpiCardProps {
  code: string;
  title: string;
  value: string;
  unit?: string;
  semaforo?: SemaforoEstado;
  metaLabel?: string;
  subtitle?: string;
  progressPct?: number | null;
  accent?: 'teal' | 'sky' | 'indigo' | 'emerald' | 'amber' | 'rose';
  Icon?: LucideIcon;
  onClick?: () => void;
}

const ACCENT_STYLES = {
  teal: {
    bar: 'bg-teal-500',
    iconBg: 'bg-teal-50 text-teal-700 border-teal-200/70',
    code: 'text-teal-700 bg-teal-50 border-teal-200/70',
  },
  sky: {
    bar: 'bg-sky-500',
    iconBg: 'bg-sky-50 text-sky-700 border-sky-200/70',
    code: 'text-sky-700 bg-sky-50 border-sky-200/70',
  },
  indigo: {
    bar: 'bg-indigo-500',
    iconBg: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
    code: 'text-indigo-700 bg-indigo-50 border-indigo-200/70',
  },
  emerald: {
    bar: 'bg-emerald-500',
    iconBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
    code: 'text-emerald-700 bg-emerald-50 border-emerald-200/70',
  },
  amber: {
    bar: 'bg-amber-500',
    iconBg: 'bg-amber-50 text-amber-700 border-amber-200/70',
    code: 'text-amber-700 bg-amber-50 border-amber-200/70',
  },
  rose: {
    bar: 'bg-rose-500',
    iconBg: 'bg-rose-50 text-rose-700 border-rose-200/70',
    code: 'text-rose-700 bg-rose-50 border-rose-200/70',
  },
};

export function KpiCard({
  code,
  title,
  value,
  unit,
  semaforo,
  metaLabel,
  subtitle,
  progressPct,
  accent = 'teal',
  Icon,
  onClick,
}: KpiCardProps) {
  const style = ACCENT_STYLES[accent];
  const barColor =
    semaforo === 'BUENO'
      ? 'bg-emerald-500'
      : semaforo === 'REGULAR'
        ? 'bg-amber-500'
        : semaforo === 'MALO'
          ? 'bg-rose-500'
          : style.bar;

  const clampedPct =
    progressPct != null && Number.isFinite(progressPct)
      ? Math.max(0, Math.min(100, progressPct))
      : null;

  const Wrapper = onClick ? 'button' : 'article';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`group relative w-full text-left rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition-all duration-200 flex flex-col justify-between ${
        onClick
          ? 'hover:shadow-card-hover hover:border-teal-300/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500 cursor-pointer'
          : ''
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && (
              <span
                className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${style.iconBg}`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            )}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${style.code}`}
            >
              {code}
            </span>
          </div>
          {semaforo ? (
            <SemaforoBadge estado={semaforo} size="xs" />
          ) : onClick ? (
            <ArrowUpRight
              className="w-4 h-4 text-slate-300 group-hover:text-teal-600 transition-colors shrink-0"
              aria-hidden="true"
            />
          ) : null}
        </div>

        <h3 className="text-xs font-semibold text-slate-500 leading-snug line-clamp-2">{title}</h3>

        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="font-display text-2xl sm:text-[26px] font-extrabold tracking-tight text-slate-900 tabular-nums">
            {value}
          </span>
          {unit && <span className="text-xs font-semibold text-slate-500">{unit}</span>}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {clampedPct !== null && (
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${clampedPct}%` }}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px]">
          {subtitle && <span className="text-slate-500 font-medium tabular-nums">{subtitle}</span>}
          {metaLabel && (
            <span className="text-slate-600 font-semibold bg-slate-100/90 px-1.5 py-0.5 rounded-md">
              {metaLabel}
            </span>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
