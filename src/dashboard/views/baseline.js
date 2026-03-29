import { Chart, getChartBasics } from '../charts.js';
import { state } from '../state.js';
import { METRICS, METRIC_LABELS, CHART_COLORS, JOURNAL_BASELINE, LOWER_IS_BETTER } from '../constants.js';
import { calculateDiff } from '../utils.js';

let baselineLineChart = null;
let baselineBarChart = null;

let controlsInitialized = false;
let baselineMode = 'top3';
let baselineGroupId = '';

export function renderBaselineView() {
  initBaselineControls();

  const activeMetrics = Array.from(state.selectedMetrics).length > 0
    ? Array.from(state.selectedMetrics)
    : METRICS;
  const selectedExps = getBaselineExperiments(activeMetrics);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  renderBaselineTable(selectedExps, activeMetrics);
  renderBaselineChart(selectedExps, activeMetrics, isDark);
  renderBaselineLineChart(selectedExps, activeMetrics, isDark);
}

function initBaselineControls() {
  const top3Radio = document.querySelector('input[name="baseline-mode"][value="top3"]');
  const groupRadio = document.querySelector('input[name="baseline-mode"][value="group"]');
  const groupSelect = document.getElementById('baseline-group-select');
  if (!top3Radio || !groupRadio || !groupSelect) return;

  if (!controlsInitialized) {
    top3Radio.addEventListener('change', () => {
      if (!top3Radio.checked) return;
      baselineMode = 'top3';
      groupSelect.classList.add('hidden');
      if (state.onRefresh) state.onRefresh();
    });

    groupRadio.addEventListener('change', () => {
      if (!groupRadio.checked) return;
      baselineMode = 'group';
      if (!baselineGroupId && state.allGroups.length > 0) baselineGroupId = state.allGroups[0].id;
      groupSelect.classList.remove('hidden');
      if (state.onRefresh) state.onRefresh();
    });

    groupSelect.addEventListener('change', () => {
      baselineGroupId = groupSelect.value || '';
      if (state.onRefresh) state.onRefresh();
    });

    controlsInitialized = true;
  }

  if (baselineMode === 'group' && !baselineGroupId && state.allGroups.length > 0) {
    baselineGroupId = state.allGroups[0].id;
  }

  groupSelect.innerHTML =
    '<option value="">— Pilih Grup —</option>' +
    state.allGroups.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');

  if (baselineGroupId && state.allGroups.some((g) => g.id === baselineGroupId)) {
    groupSelect.value = baselineGroupId;
  }

  top3Radio.checked = baselineMode === 'top3';
  groupRadio.checked = baselineMode === 'group';
  groupSelect.classList.toggle('hidden', baselineMode !== 'group');
}

function getBaselineExperiments(metrics) {
  const selectedExps = state.allExperiments.filter((e) => state.selectedIds.has(e.id));
  if (selectedExps.length === 0) return [];

  if (baselineMode === 'group') {
    if (!baselineGroupId) return [];
    return selectedExps
      .filter((e) => e.groupId === baselineGroupId)
      .sort((a, b) => getScore(b, metrics) - getScore(a, metrics))
      .slice(0, 3);
  }

  return [...selectedExps]
    .sort((a, b) => getScore(b, metrics) - getScore(a, metrics))
    .slice(0, 3);
}

function getScore(exp, metrics) {
  return metrics.reduce((acc, metric) => {
    const val = parseFloat(exp.results?.[metric]) || 0;
    return acc + (LOWER_IS_BETTER.has(metric) ? -val : val);
  }, 0);
}

function renderBaselineTable(experiments, metrics) {
  const table = document.getElementById('baseline-table');
  if (!table) return;

  if (experiments.length === 0 || metrics.length === 0) {
    table.innerHTML = '<thead><tr><th>Info</th></tr></thead><tbody><tr><td>Tidak ada data untuk mode ini.</td></tr></tbody>';
    return;
  }

  let html = `<thead>
    <tr>
      <th>Model / Experiment</th>
      <th>Evaluation Metric</th>
      <th>Actual Value</th>
      <th>Diff vs Benchmark</th>
      <th>Improvement %</th>
    </tr>
  </thead><tbody>`;

  experiments.forEach((exp) => {
    metrics.forEach((m, mi) => {
      const val = parseFloat(exp.results?.[m]) || 0;
      const base = parseFloat(JOURNAL_BASELINE.results?.[m]) || 0;
      const { diff, pct } = calculateDiff(val, base);
      const isPositive = diff > 0;
      const diffClass = isPositive ? 'diff-positive' : (diff < 0 ? 'diff-negative' : 'diff-neutral');
      const icon = isPositive ? '📈' : (diff < 0 ? '📉' : '➖');

      html += `<tr class="hoverable-row">
        ${mi === 0 ? `<td rowspan="${metrics.length}" style="vertical-align:middle; border-right: 1px solid var(--border-card);">
            <div style="font-weight: 700; font-size: 14px; color: var(--text-primary);">${exp.name}</div>
        </td>` : ''}
        <td><span style="font-weight: 500;">${METRIC_LABELS[m]}</span></td>
        <td class="baseline-val" style="font-size: 14px;">${val.toFixed(4)}</td>
        <td class="${diffClass}">
           <div style="display: flex; align-items: center; gap: 6px;">
             ${icon} ${isPositive ? '+' : ''}${diff.toFixed(4)}
           </div>
        </td>
        <td>
           <span class="${diffClass}" style="background: var(--bg-secondary); padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 12px;">${isPositive ? '+' : ''}${pct}%</span>
        </td>
      </tr>`;
    });
  });

  html += '</tbody>';
  table.innerHTML = html;
}

function renderBaselineChart(experiments, metrics, isDark) {
  const canvas = document.getElementById('baseline-bar-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const basics = getChartBasics(isDark);
  if (baselineBarChart) baselineBarChart.destroy();
  if (experiments.length === 0 || metrics.length === 0) return;

  const labels = metrics.map((m) => METRIC_LABELS[m]);
  const datasets = experiments.map((exp) => ({
    label: exp.name,
    data: metrics.map((m) => {
      const val = parseFloat(exp.results?.[m]) || 0;
      const base = parseFloat(JOURNAL_BASELINE.results?.[m]) || 0;
      return base === 0 ? 0 : ((val / base) * 100 - 100);
    }),
    backgroundColor: CHART_COLORS[state.allExperiments.indexOf(exp) % CHART_COLORS.length] + 'cc',
    borderRadius: 6,
    hoverBackgroundColor: CHART_COLORS[state.allExperiments.indexOf(exp) % CHART_COLORS.length],
  }));

  baselineBarChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: { display: true, text: '% Improvement over Baseline', color: basics.textColor },
          grid: { color: basics.gridColor },
          ticks: { color: basics.textColor }
        },
        x: { grid: { display: false }, ticks: { color: basics.textColor } }
      },
      plugins: {
        legend: { labels: { color: basics.textColor, padding: 20 } }
      }
    }
  });
}

function renderBaselineLineChart(experiments, metrics, isDark) {
  const canvas = document.getElementById('baseline-line-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const basics = getChartBasics(isDark);
  if (baselineLineChart) baselineLineChart.destroy();
  if (experiments.length === 0 || metrics.length === 0) return;

  const labels = metrics.map((m) => METRIC_LABELS[m]);
  const datasets = [
    {
      label: '🏆 JOURNAL BENCHMARK',
      data: metrics.map((m) => parseFloat(JOURNAL_BASELINE.results?.[m]) || 0),
      borderColor: isDark ? '#ffffff' : '#000000',
      borderDash: [5, 5],
      borderWidth: 3,
      fill: true,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      pointStyle: 'star',
      pointRadius: 8,
    },
    ...experiments.map((exp) => {
      const color = CHART_COLORS[state.allExperiments.indexOf(exp) % CHART_COLORS.length];
      return {
        label: exp.name,
        data: metrics.map((m) => parseFloat(exp.results?.[m]) || 0),
        borderColor: color,
        backgroundColor: color + '22',
        borderWidth: 3,
        tension: 0.4,
        fill: false,
        pointBackgroundColor: color,
      };
    })
  ];

  baselineLineChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { grid: { color: basics.gridColor }, ticks: { color: basics.textColor } },
        x: { grid: { color: basics.gridColor }, ticks: { color: basics.textColor } }
      },
      plugins: {
        legend: { labels: { color: basics.textColor, padding: 20 } },
        tooltip: {
          backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
          titleColor: isDark ? '#fff' : '#000',
          bodyColor: isDark ? '#ccc' : '#333',
          borderColor: basics.gridColor,
          borderWidth: 1,
          padding: 12,
        }
      }
    }
  });
}
