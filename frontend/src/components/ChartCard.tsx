'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type * as echarts from 'echarts';
import { Download, Maximize2, MousePointerClick, X } from 'lucide-react';
import { EChartBox, type EChartBoxHandle, type EChartClickParams } from './EChartBox';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  contextBadge?: string;
  option: echarts.EChartsCoreOption | null;
  height?: number;
  ariaLabel: string;
  exportFilename?: string;
  onItemClick?: (params: EChartClickParams) => void;
  interactiveHint?: boolean;
  extraHeader?: ReactNode;
  emptyFallback?: ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  subtitle,
  contextBadge,
  option,
  height = 300,
  ariaLabel,
  exportFilename = 'visual-mmet-bi.png',
  onItemClick,
  interactiveHint = false,
  extraHeader,
  emptyFallback,
  className = '',
}: ChartCardProps) {
  const chartRef = useRef<EChartBoxHandle | null>(null);
  const focusChartRef = useRef<EChartBoxHandle | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (focusOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [focusOpen]);

  // Fallback de light-dismiss cuando closedby="any" no está soportado nativamente (Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        setFocusOpen(false);
      }
    };

    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, []);

  return (
    <>
      <div
        className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 flex flex-col ${className}`}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 font-display">{title}</h3>
              {contextBadge && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold tabular-nums">
                  {contextBadge}
                </span>
              )}
              {interactiveHint && onItemClick && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-100 text-[10px] font-semibold">
                  <MousePointerClick className="w-3 h-3" aria-hidden="true" />
                  Clic para filtrar
                </span>
              )}
            </div>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {extraHeader}
            {option && (
              <>
                <button
                  type="button"
                  onClick={() => chartRef.current?.exportPng(exportFilename)}
                  title="Descargar gráfico como PNG"
                  aria-label={`Descargar ${title} como PNG`}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setFocusOpen(true)}
                  title="Modo Enfoque (pantalla completa)"
                  aria-label={`Expandir ${title} en Modo Enfoque`}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                >
                  <Maximize2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {option ? (
            <EChartBox
              ref={chartRef}
              option={option}
              height={height}
              ariaLabel={ariaLabel}
              onItemClick={onItemClick}
            />
          ) : (
            emptyFallback || (
              <div className="h-60 flex items-center justify-center text-xs text-slate-400">
                Sin datos suficientes para graficar en este corte.
              </div>
            )
          )}
        </div>
      </div>

      {/* Native <dialog> Focus Mode Overlay (modern-web-guidance: dialog) */}
      <dialog
        ref={dialogRef}
        className="mwg-focus-modal"
        aria-labelledby={headingId}
        onClose={() => setFocusOpen(false)}
        {...({ closedby: 'any' } as any)}
      >
        {focusOpen && option && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-bold uppercase tracking-wider">
                    Modo Enfoque
                  </span>
                  {contextBadge && (
                    <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 text-[11px] font-semibold tabular-nums">
                      {contextBadge}
                    </span>
                  )}
                </div>
                <h1 id={headingId} className="text-lg font-bold text-slate-900 font-display mt-1">
                  {title}
                </h1>
                {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => focusChartRef.current?.exportPng(exportFilename)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Descargar PNG
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setFocusOpen(false)}
                  aria-label="Cerrar Modo Enfoque"
                  className="p-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-auto flex-1">
              <EChartBox
                ref={focusChartRef}
                option={option}
                height={520}
                ariaLabel={`${ariaLabel} (Modo Enfoque)`}
                onItemClick={onItemClick}
              />
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
