'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface EChartBoxProps {
  option: echarts.EChartsCoreOption;
  height?: number;
  ariaLabel: string;
}

export function EChartBox({ option, height = 320, ariaLabel }: EChartBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el);
    chartRef.current = chart;
    chart.setOption(option, true);

    const ro = new ResizeObserver(() => {
      chart.resize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
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
