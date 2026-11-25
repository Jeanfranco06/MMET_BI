import * as echarts from 'echarts';

export const CHART_COLORS = {
  teal: '#14B8A6',
  tealDark: '#0D9488',
  tealLight: '#5EEAD4',
  indigo: '#6366F1',
  indigoDark: '#4F46E5',
  sky: '#0EA5E9',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#F43F5E',
  slate: '#64748B',
  slateLight: '#CBD5E1',
  gridLine: '#F1F5F9',
  axisText: '#64748B',
};

export function barGradient(topColor: string, bottomColor: string) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: topColor },
    { offset: 1, color: bottomColor },
  ]);
}

export function horizontalGradient(leftColor: string, rightColor: string) {
  return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
    { offset: 0, color: leftColor },
    { offset: 1, color: rightColor },
  ]);
}

export const EXECUTIVE_TOOLTIP: Record<string, any> = {
  backgroundColor: 'rgba(15, 23, 42, 0.96)',
  borderColor: '#1E293B',
  borderWidth: 1,
  padding: [10, 14],
  borderRadius: 12,
  textStyle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
  },
  extraCssText: 'box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.35); backdrop-filter: blur(8px);',
};

export const EXECUTIVE_AXIS_LABEL = {
  color: CHART_COLORS.axisText,
  fontSize: 11,
  fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
};

export const EXECUTIVE_SPLIT_LINE = {
  lineStyle: {
    color: CHART_COLORS.gridLine,
    type: 'dashed' as const,
  },
};

export function metaMarkLine(value: number, label: string, color = '#0D9488', axis: 'y' | 'x' = 'y') {
  return {
    silent: true,
    symbol: ['none', 'none'],
    lineStyle: {
      color,
      type: 'dashed' as const,
      width: 1.75,
    },
    label: {
      show: true,
      formatter: label,
      position: axis === 'y' ? 'insideEndTop' : 'insideEndTop',
      color,
      fontSize: 11,
      fontWeight: 700,
      backgroundColor: 'rgba(255,255,255,0.92)',
      padding: [2, 6],
      borderRadius: 4,
    },
    data: [axis === 'y' ? { yAxis: value } : { xAxis: value }],
  };
}
