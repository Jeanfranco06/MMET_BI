'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { EXECUTIVE_TOOLTIP } from '@/lib/chartTheme';

interface EChartBoxProps {
  option: echarts.EChartsCoreOption;
  height?: number;
  ariaLabel: string;
}

export function EChartBox({ option, height = 310, ariaLabel }: EChartBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Inicializa la instancia una sola vez y reacciona a redimensionamiento
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.getInstanceByDom(el) || echarts.init(el, undefined, { renderer: 'svg' });
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      chart.resize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Actualiza la opción reutilizando la instancia con setOption (evita parpadeo y recreación del DOM)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let chart = chartRef.current;
    if (!chart || chart.isDisposed()) {
      chart = echarts.getInstanceByDom(el) || echarts.init(el, undefined, { renderer: 'svg' });
      chartRef.current = chart;
    }

    const baseTooltip =
      typeof option.tooltip === 'object' && option.tooltip !== null
        ? { ...EXECUTIVE_TOOLTIP, ...option.tooltip }
        : EXECUTIVE_TOOLTIP;

    const mergedOption: echarts.EChartsCoreOption = {
      textStyle: {
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
      },
      animationDuration: 450,
      animationEasing: 'cubicOut',
      ...option,
      tooltip: baseTooltip,
    };

    chart.setOption(mergedOption, true);
  }, [option]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      style={{ width: '100%', height: `${height}px` }}
    />
  );
}
