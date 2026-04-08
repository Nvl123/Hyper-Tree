import { Chart, getChartBasics } from '../charts.js';
import { state } from '../state.js';
import { METRICS, METRIC_LABELS, CHART_COLORS, JOURNAL_BASELINE, LOWER_IS_BETTER } from '../constants.js';
import { calculateDiff } from '../utils.js';

let baselineLineChart = null;
let baselineBarChart = null;

let controlsInitialized = false;
let baselineMode = 'top3';
let baselineGroupId = '';
let baselineGroupAId = '';
let baselineGroupBId = '';
let baselineNodeAId = '';
let baselineNodeBId = '';

export function renderBaselineView() {
  initBaselineControls();

  const activeMetrics = Array.from(state.selectedMetrics).length > 0
    ? Array.from(state.selectedMetrics)
    : METRICS;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const model = getBaselineModel(activeMetrics);

  renderBaselineTable(model);
  renderBaselineChart(model, isDark);
  renderBaselineLineChart(model, isDark);
}

function initBaselineControls() {
  const modeRadios = document.querySelectorAll('input[name="baseline-mode"]');
  const groupSelect = document.getElementById('baseline-group-select');
  const groupCompareWrap = document.getElementById('baseline-group-compare-selectors');
  const nodeCompareWrap = document.getElementById('baseline-node-compare-selectors');
  const groupASelect = document.getElementById('baseline-group-a-select');
  const groupBSelect = document.getElementById('baseline-group-b-select');
  const nodeASelect = document.getElementById('baseline-node-a-select');
  const nodeBSelect = document.getElementById('baseline-node-b-select');

  if (!modeRadios.length || !groupSelect || !groupCompareWrap || !nodeCompareWrap
    || !groupASelect || !groupBSelect || !nodeASelect || !nodeBSelect) return;

  if (!controlsInitialized) {
    modeRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        baselineMode = radio.value;
        ensureDefaultSelections();
        updateControlVisibility();
        if (state.onRefresh) state.onRefresh();
      });
    });

    groupSelect.addEventListener('change', () => {
      baselineGroupId = groupSelect.value || '';
      if (state.onRefresh) state.onRefresh();
    });

    groupASelect.addEventListener('change', () => {
      baselineGroupAId = groupASelect.value || '';
      if (state.onRefresh) state.onRefresh();
    });

    groupBSelect.addEventListener('change', () => {
      baselineGroupBId = groupBSelect.value || '';
      if (state.onRefresh) state.onRefresh();
    });

    nodeASelect.addEventListener('change', () => {
      baselineNodeAId = nodeASelect.value || '';
      if (state.onRefresh) state.onRefresh();
    });

    nodeBSelect.addEventListener('change', () => {
      baselineNodeBId = nodeBSelect.value || '';
      if (state.onRefresh) state.onRefresh();
    });

    controlsInitialized = true;
  }

  const groupOptionsHtml = '<option value="">— Pilih Grup —</option>' +
    state.allGroups.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
  groupSelect.innerHTML = groupOptionsHtml;

  groupASelect.innerHTML = '<option value="">— Grup A —</option>' +
    state.allGroups.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
  groupBSelect.innerHTML = '<option value="">— Grup B —</option>' +
    state.allGroups.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');

  const availableExps = getSelectedOrAllExperiments();
  const sortedExps = [...availableExps].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const nodeOptionItems = sortedExps.map((e) => `<option value="${e.id}">${e.name}</option>`).join('');
  nodeASelect.innerHTML = '<option value="">— Node A —</option>' + nodeOptionItems;
  nodeBSelect.innerHTML = '<option value="">— Node B —</option>' + nodeOptionItems;

  ensureDefaultSelections();

  if (baselineGroupId) groupSelect.value = baselineGroupId;
  if (baselineGroupAId) groupASelect.value = baselineGroupAId;
  if (baselineGroupBId) groupBSelect.value = baselineGroupBId;
  if (baselineNodeAId) nodeASelect.value = baselineNodeAId;
  if (baselineNodeBId) nodeBSelect.value = baselineNodeBId;

  modeRadios.forEach((radio) => {
    radio.checked = radio.value === baselineMode;
  });

  updateControlVisibility();
}

function updateControlVisibility() {
  const groupSelect = document.getElementById('baseline-group-select');
  const groupCompareWrap = document.getElementById('baseline-group-compare-selectors');
  const nodeCompareWrap = document.getElementById('baseline-node-compare-selectors');
  if (!groupSelect || !groupCompareWrap || !nodeCompareWrap) return;

  groupSelect.classList.toggle('hidden', baselineMode !== 'group');
  groupCompareWrap.classList.toggle('hidden', baselineMode !== 'group-compare');
  nodeCompareWrap.classList.toggle('hidden', baselineMode !== 'node-compare');
}

function ensureDefaultSelections() {
  const groups = state.allGroups || [];
  const exps = getSelectedOrAllExperiments();

  if (baselineMode === 'group' && !baselineGroupId && groups.length > 0) {
    baselineGroupId = groups[0].id;
  }

  if (baselineMode === 'group-compare') {
    if (!baselineGroupAId && groups.length > 0) baselineGroupAId = groups[0].id;
    if (!baselineGroupBId && groups.length > 1) baselineGroupBId = groups[1].id;
    if (groups.length > 1 && baselineGroupAId === baselineGroupBId) {
      const alt = groups.find((g) => g.id !== baselineGroupAId);
      if (alt) baselineGroupBId = alt.id;
    }
  }

  if (baselineMode === 'node-compare') {
    if (!baselineNodeAId && exps.length > 0) baselineNodeAId = exps[0].id;
    if (!baselineNodeBId && exps.length > 1) baselineNodeBId = exps[1].id;
    if (exps.length > 1 && baselineNodeAId === baselineNodeBId) {
      const alt = exps.find((e) => e.id !== baselineNodeAId);
      if (alt) baselineNodeBId = alt.id;
    }
  }
}

function getSelectedOrAllExperiments() {
  const selectedExps = state.allExperiments.filter((e) => state.selectedIds.has(e.id));
  return selectedExps.length > 0 ? selectedExps : state.allExperiments;
}

function getBaselineModel(metrics) {
  const rows = getBaselineRows(metrics);
  return {
    mode: baselineMode,
    metrics,
    rows,
    isPairwise: baselineMode === 'group-compare' || baselineMode === 'node-compare',
  };
}

function getBaselineRows(metrics) {
  if (!metrics.length) return [];

  if (baselineMode === 'group-compare') {
    return getGroupComparisonRows(metrics);
  }

  if (baselineMode === 'node-compare') {
    return getNodeComparisonRows(metrics);
  }

  const experiments = getJournalReferenceExperiments(metrics);
  const rows = [];

  experiments.forEach((exp) => {
    metrics.forEach((metric) => {
      rows.push({
        rowLabel: exp.name,
        metric,
        actual: parseFloat(exp.results?.[metric]) || 0,
        reference: parseFloat(JOURNAL_BASELINE.results?.[metric]) || 0,
        actualLabel: exp.name,
        referenceLabel: 'Baseline Jurnal',
      });
    });
  });

  return rows;
}

function getJournalReferenceExperiments(metrics) {
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

function getGroupComparisonRows(metrics) {
  if (!baselineGroupAId || !baselineGroupBId || baselineGroupAId === baselineGroupBId) return [];

  const selectedExps = getSelectedOrAllExperiments();
  const groupA = state.allGroups.find((g) => g.id === baselineGroupAId);
  const groupB = state.allGroups.find((g) => g.id === baselineGroupBId);
  if (!groupA || !groupB) return [];

  const groupAExps = selectedExps.filter((e) => e.groupId === groupA.id);
  const groupBExps = selectedExps.filter((e) => e.groupId === groupB.id);
  if (!groupAExps.length || !groupBExps.length) return [];

  return metrics.map((metric) => ({
    rowLabel: `${groupB.name} vs ${groupA.name}`,
    metric,
    actual: averageMetric(groupBExps, metric),
    reference: averageMetric(groupAExps, metric),
    actualLabel: `Rata-rata ${groupB.name}`,
    referenceLabel: `Rata-rata ${groupA.name}`,
  }));
}

function getNodeComparisonRows(metrics) {
  if (!baselineNodeAId || !baselineNodeBId || baselineNodeAId === baselineNodeBId) return [];

  const selectedExps = getSelectedOrAllExperiments();
  const nodeA = selectedExps.find((e) => e.id === baselineNodeAId);
  const nodeB = selectedExps.find((e) => e.id === baselineNodeBId);
  if (!nodeA || !nodeB) return [];

  return metrics.map((metric) => ({
    rowLabel: `${nodeB.name} vs ${nodeA.name}`,
    metric,
    actual: parseFloat(nodeB.results?.[metric]) || 0,
    reference: parseFloat(nodeA.results?.[metric]) || 0,
    actualLabel: nodeB.name,
    referenceLabel: nodeA.name,
  }));
}

function averageMetric(experiments, metric) {
  if (!experiments.length) return 0;
  const sum = experiments.reduce((acc, exp) => acc + (parseFloat(exp.results?.[metric]) || 0), 0);
  return sum / experiments.length;
}

function getDirectionalDiff(actual, reference, metric) {
  const rawDiff = actual - reference;
  const adjustedDiff = LOWER_IS_BETTER.has(metric) ? -rawDiff : rawDiff;
  const baseAbs = Math.abs(reference);
  const pct = baseAbs > 1e-9 ? (adjustedDiff / baseAbs) * 100 : (adjustedDiff > 0 ? 100 : (adjustedDiff < 0 ? -100 : 0));
  return { diff: adjustedDiff, pct };
}

function getScore(exp, metrics) {
  return metrics.reduce((acc, metric) => {
    const val = parseFloat(exp.results?.[metric]) || 0;
    return acc + (LOWER_IS_BETTER.has(metric) ? -val : val);
  }, 0);
}

function renderBaselineTable(model) {
  const table = document.getElementById('baseline-table');
  if (!table) return;
  if (model.rows.length === 0 || model.metrics.length === 0) {
    table.innerHTML = '<thead><tr><th>Info</th></tr></thead><tbody><tr><td>Tidak ada data untuk mode ini.</td></tr></tbody>';
    return;
  }

  const { rows, isPairwise } = model;
  const leftHeader = isPairwise ? 'Konteks (Target vs Referensi)' : 'Model / Experiment';

  let html = `<thead>
    <tr>
      <th>${leftHeader}</th>
      <th>Evaluation Metric</th>
      <th>Target Value</th>
      <th>Reference Value</th>
      <th>Δ (Directional)</th>
      <th>Improvement %</th>
      <th>Kesimpulan</th>
    </tr>
  </thead><tbody>`;

  rows.forEach((row) => {
    const { diff, pct } = getDirectionalDiff(row.actual, row.reference, row.metric);
    const isPositive = diff > 0;
    const diffClass = isPositive ? 'diff-positive' : (diff < 0 ? 'diff-negative' : 'diff-neutral');
    const icon = isPositive ? '📈' : (diff < 0 ? '📉' : '➖');
    const metricHint = LOWER_IS_BETTER.has(row.metric) ? ' (lebih kecil lebih baik)' : '';
    const pctLabel = `${isPositive ? '+' : ''}${pct.toFixed(2)}%`;
    const deltaLabel = `${isPositive ? '+' : ''}${diff.toFixed(4)}`;
    const relationLabel = diff > 0
      ? `${row.actualLabel} > ${row.referenceLabel}`
      : (diff < 0 ? `${row.actualLabel} < ${row.referenceLabel}` : `${row.actualLabel} = ${row.referenceLabel}`);

    html += `<tr class="hoverable-row">
      <td style="vertical-align:middle; border-right: 1px solid var(--border-card);">
        <div style="font-weight: 700; font-size: 14px; color: var(--text-primary);">${row.rowLabel}</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">${row.actualLabel} terhadap ${row.referenceLabel}${metricHint}</div>
      </td>
      <td><span style="font-weight: 500;">${METRIC_LABELS[row.metric]}</span></td>
      <td class="baseline-val" style="font-size: 14px;">${row.actual.toFixed(4)}</td>
      <td class="baseline-val" style="font-size: 14px;">${row.reference.toFixed(4)}</td>
      <td class="${diffClass}">
        <div style="display: flex; align-items: center; gap: 6px;">
          ${icon} ${deltaLabel}
        </div>
      </td>
      <td>
        <span class="${diffClass}" style="background: var(--bg-secondary); padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 12px;">${pctLabel}</span>
      </td>
      <td>
        <span class="${diffClass}" style="background: var(--bg-secondary); padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 12px;">${relationLabel}</span>
      </td>
    </tr>`;
  });

  html += '</tbody>';
  table.innerHTML = html;
}

function renderBaselineChart(model, isDark) {
  const canvas = document.getElementById('baseline-bar-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const basics = getChartBasics(isDark);
  if (baselineBarChart) baselineBarChart.destroy();
  if (model.rows.length === 0 || model.metrics.length === 0) return;

  const labels = model.metrics.map((m) => METRIC_LABELS[m]);
  const byMetric = new Map(model.rows.map((row) => [row.metric, row]));

  let datasets = [];
  if (model.isPairwise) {
    const first = model.rows[0];
    datasets = [{
      label: `${first.actualLabel} vs ${first.referenceLabel}`,
      data: model.metrics.map((metric) => {
        const row = byMetric.get(metric);
        if (!row) return 0;
        return getDirectionalDiff(row.actual, row.reference, metric).pct;
      }),
      backgroundColor: CHART_COLORS[0] + 'cc',
      borderRadius: 6,
      hoverBackgroundColor: CHART_COLORS[0],
    }];
  } else {
    const rowsByModel = new Map();
    model.rows.forEach((row) => {
      if (!rowsByModel.has(row.actualLabel)) rowsByModel.set(row.actualLabel, []);
      rowsByModel.get(row.actualLabel).push(row);
    });

    datasets = Array.from(rowsByModel.entries()).map(([label, rows], idx) => ({
      label,
      data: model.metrics.map((metric) => {
        const row = rows.find((r) => r.metric === metric);
        if (!row) return 0;
        const { pct } = calculateDiff(row.actual, row.reference);
        return parseFloat(pct) || 0;
      }),
      backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] + 'cc',
      borderRadius: 6,
      hoverBackgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
    }));
  }

  baselineBarChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: {
            display: true,
            text: model.isPairwise ? '% Improvement (Target vs Reference)' : '% Improvement over Baseline',
            color: basics.textColor
          },
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

function renderBaselineLineChart(model, isDark) {
  const canvas = document.getElementById('baseline-line-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const basics = getChartBasics(isDark);
  if (baselineLineChart) baselineLineChart.destroy();
  if (model.rows.length === 0 || model.metrics.length === 0) return;

  const labels = model.metrics.map((m) => METRIC_LABELS[m]);
  const byMetric = new Map(model.rows.map((row) => [row.metric, row]));

  let datasets = [];
  if (model.isPairwise) {
    const first = model.rows[0];
    datasets = [
      {
        label: first.referenceLabel,
        data: model.metrics.map((metric) => byMetric.get(metric)?.reference || 0),
        borderColor: isDark ? '#b8b8b8' : '#555555',
        borderDash: [5, 5],
        borderWidth: 3,
        fill: false,
        pointRadius: 5,
      },
      {
        label: first.actualLabel,
        data: model.metrics.map((metric) => byMetric.get(metric)?.actual || 0),
        borderColor: CHART_COLORS[0],
        backgroundColor: CHART_COLORS[0] + '22',
        borderWidth: 3,
        tension: 0.35,
        fill: false,
        pointBackgroundColor: CHART_COLORS[0],
      }
    ];
  } else {
    const rowsByModel = new Map();
    model.rows.forEach((row) => {
      if (!rowsByModel.has(row.actualLabel)) rowsByModel.set(row.actualLabel, []);
      rowsByModel.get(row.actualLabel).push(row);
    });

    datasets = [
      {
        label: '🏆 JOURNAL BENCHMARK',
        data: model.metrics.map((metric) => byMetric.get(metric)?.reference || 0),
        borderColor: isDark ? '#ffffff' : '#000000',
        borderDash: [5, 5],
        borderWidth: 3,
        fill: true,
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        pointStyle: 'star',
        pointRadius: 8,
      },
      ...Array.from(rowsByModel.entries()).map(([label, rows], idx) => {
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        return {
          label,
          data: model.metrics.map((metric) => rows.find((r) => r.metric === metric)?.actual || 0),
          borderColor: color,
          backgroundColor: color + '22',
          borderWidth: 3,
          tension: 0.4,
          fill: false,
          pointBackgroundColor: color,
        };
      })
    ];
  }

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
