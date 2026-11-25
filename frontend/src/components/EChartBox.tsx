'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as echarts from 'echarts';
import { EXECUTIVE_TOOLTIP } from '@/lib/chartTheme';

export interface EChartClickParams {
  name: string;
  seriesName?: string;
  dataIndex: number;
  value: unknown;
}

export interface EChartBoxHandle {
  exportPng: (filename?: string) => void;
  getInstance: () => echarts.ECharts | null;
}

interface EChartBoxProps {
  option: echarts.EChartsCoreOption;
  height?: number;
  ariaLabel: string;
  onItemClick?: (params: EChartClickParams) => void;
}

export const EChartBox = forwardRef<EChartBoxHandle, EChartBoxProps>(function EChartBox(
  { option, height = 310, ariaLabel, onItemClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const onItemClickRef = useRef(onItemClick);
  onItemClickRef.current = onItemClick;

  useImperativeHandle(ref, () => ({
    exportPng: (filename = 'grafico-mmet-bi.png') => {
      const chart = chartRef.current;
      if (!chart || chart.isDisposed()) return;
      const dataUrl = chart.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    getInstance: () => chartRef.current,
  }));

  // Inicializa la instancia una sola vez, vincula evento click y ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart =
      echarts.getInstanceByDom(el) ||
      echarts.init(el, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const handleClick = (params: any) => {
      if (!onItemClickRef.current) return;
      onItemClickRef.current({
        name: String(params?.name ?? ''),
        seriesName: params?.seriesName != null ? String(params.seriesName) : undefined,
        dataIndex: typeof params?.dataIndex === 'number' ? params.dataIndex : -1,
        value: params?.value,
      });
    };

    chart.on('click', handleClick);

    const ro = new ResizeObserver(() => {
      if (!chart.isDisposed()) {
        chart.resize();
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      if (!chart.isDisposed()) {
        chart.off('click', handleClick);
        chart.dispose();
      }
      chartRef.current = null;
    };
  }, []);

  // Reutiliza la instancia con setOption (evita init/dispose y parpadeos al filtrar)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let chart = chartRef.current;
    if (!chart || chart.isDisposed()) {
      chart =
        echarts.getInstanceByDom(el) ||
        echarts.init(el, undefined, { renderer: 'canvas' });
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
      animationDuration: 400,
      animationEasing: 'cubicOut',
      ...option,
      tooltip: baseTooltip,
    };

    chart.setOption(mergedOption, { notMerge: true });
  }, [option]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={onItemClick ? 'cursor-pointer' : undefined}
      style={{ width: '100%', height: `${height}px` }}
    />
  );
});
