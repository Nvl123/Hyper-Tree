import {
  Chart,
  LineController,
  BarController,
  RadarController,
  ScatterController,
  BubbleController,
  LineElement,
  BarElement,
  PointElement,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
  Tooltip,
  Title,
} from 'chart.js';

Chart.register(
  LineController, BarController, RadarController, ScatterController, BubbleController,
  LineElement, BarElement, PointElement,
  RadialLinearScale, CategoryScale, LinearScale,
  Filler, Legend, Tooltip, Title
);

export function getChartBasics(isDark) {
  return {
    gridColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    textColor: isDark ? '#94a3b8' : '#475569',
    tooltipBg: isDark ? 'rgba(24,27,37,0.95)' : 'rgba(255,255,255,0.95)',
    tooltipTitle: isDark ? '#e2e8f0' : '#1e293b',
    tooltipBody: isDark ? '#94a3b8' : '#475569',
  };
}

export { Chart };
