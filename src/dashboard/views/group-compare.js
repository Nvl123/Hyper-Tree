import { Chart, getChartBasics } from '../charts.js';
import { state } from '../state.js';
import { METRICS, METRIC_LABELS } from '../constants.js';

let gcLineChart = null;
let gcBarChart = null;

let controlsInitialized = false;
let filterMode = 'all'; // 'all' | 'selected'
let valueMode = 'avg'; // 'avg' | 'max' | 'node'
let rankingMetric = 'spice'; // default ranking metric for podium cards
let selectedGroupIds = new Set();
let selectedNodeByGroup = new Map();

export function renderGroupCompareView() {
  const activeMetrics = Array.from(state.selectedMetrics).length > 0
    ? Array.from(state.selectedMetrics)
    : METRICS;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const metricsForStats = Array.from(new Set([...activeMetrics, rankingMetric]));

  const allGroupsWithExperiments = buildGroupBuckets();
  renderPicker(allGroupsWithExperiments);

  const filteredGroups = getFilteredGroups(allGroupsWithExperiments);
  const groupStats = buildGroupStats(filteredGroups, metricsForStats);

  const content = document.getElementById('gc-content');
  const empty = document.getElementById('gc-empty');
  const hasData = groupStats.length > 0 && activeMetrics.length > 0;
  if (content) content.classList.toggle('hidden', !hasData);
  if (empty) {
    empty.classList.toggle('hidden', hasData);
    const p = empty.querySelector('p');
    if (p) p.textContent = 'Pilih minimal 1 grup untuk melihat perbandingan.';
  }

  if (!hasData) return;

  renderGCPodium(groupStats, rankingMetric);
  renderGCTable(groupStats, activeMetrics);
  renderGCLine(groupStats, activeMetrics, isDark);
  renderGCBar(groupStats, activeMetrics, isDark);
}

function buildGroupBuckets() {
  const buckets = state.allGroups.map((group) => ({
    group,
    experiments: state.allExperiments.filter((e) => e.groupId === group.id),
  })).filter((b) => b.experiments.length > 0);

  const ungroupedExperiments = state.allExperiments.filter((e) => !e.groupId);
  if (ungroupedExperiments.length > 0) {
    buckets.push({
      group: { id: '__ungrouped__', name: 'Ungrouped Models', color: '#64748b' },
      experiments: ungroupedExperiments,
    });
  }

  return buckets;
}

function buildGroupStats(groups, metrics) {
  return groups.map((bucket) => {
    const stats = {
      group: bucket.group,
      experiments: bucket.experiments,
      values: {},
      sourceNodeByMetric: {},
    };

    if (valueMode === 'node') {
      const chosen = ensureSelectedNode(bucket);
      metrics.forEach((m) => {
        stats.values[m] = parseFloat(chosen?.results?.[m]) || 0;
        stats.sourceNodeByMetric[m] = chosen?.name || '-';
      });
      return stats;
    }

    metrics.forEach((m) => {
      const vals = bucket.experiments.map((e) => ({
        exp: e,
        value: parseFloat(e.results?.[m]) || 0,
      }));
      if (vals.length === 0) {
        stats.values[m] = 0;
        stats.sourceNodeByMetric[m] = '-';
        return;
      }

      if (valueMode === 'max') {
        const best = vals.reduce((a, b) => (b.value > a.value ? b : a));
        stats.values[m] = best.value;
        stats.sourceNodeByMetric[m] = best.exp.name || '-';
      } else {
        stats.values[m] = vals.reduce((a, b) => a + b.value, 0) / vals.length;
        stats.sourceNodeByMetric[m] = `${bucket.experiments.length} nodes`;
      }
    });

    return stats;
  });
}

function ensureSelectedNode(bucket) {
  const gid = bucket.group.id;
  const selectedId = selectedNodeByGroup.get(gid);
  const found = bucket.experiments.find((e) => e.id === selectedId);
  if (found) return found;
  const fallback = bucket.experiments[0] || null;
  if (fallback) selectedNodeByGroup.set(gid, fallback.id);
  return fallback;
}

function renderPicker(groupBuckets) {
  const container = document.getElementById('gc-picker');
  if (!container) return;

  if (!controlsInitialized && groupBuckets.length > 0) {
    groupBuckets.forEach((b) => {
      selectedGroupIds.add(b.group.id);
      if (b.experiments[0]) selectedNodeByGroup.set(b.group.id, b.experiments[0].id);
    });
    controlsInitialized = true;
  }

  // Cleanup stale selections
  const validGroupIds = new Set(groupBuckets.map((b) => b.group.id));
  selectedGroupIds = new Set([...selectedGroupIds].filter((id) => validGroupIds.has(id)));
  [...selectedNodeByGroup.keys()].forEach((gid) => {
    if (!validGroupIds.has(gid)) selectedNodeByGroup.delete(gid);
  });

  const groupItems = groupBuckets.map((b) => {
    const checked = selectedGroupIds.has(b.group.id) ? 'checked' : '';
    const disabled = filterMode === 'all' ? 'disabled' : '';
    return `
      <label class="gc-picker-item">
        <input type="checkbox" data-gid="${b.group.id}" ${checked} ${disabled} />
        <span class="gc-color-dot" style="background:${b.group.color}"></span>
        <span>${b.group.name}</span>
      </label>
    `;
  }).join('');

  const nodeSelectRows = groupBuckets.map((b) => {
    const options = b.experiments.map((e) => {
      const selected = selectedNodeByGroup.get(b.group.id) === e.id ? 'selected' : '';
      return `<option value="${e.id}" ${selected}>${e.name}</option>`;
    }).join('');
    return `
      <label class="gc-node-row">
        <span class="gc-node-label">${b.group.name}</span>
        <select class="vsp-select gc-node-select" data-gid="${b.group.id}" ${valueMode === 'node' ? '' : 'disabled'}>
          ${options}
        </select>
      </label>
    `;
  }).join('');
  const rankingOptions = METRICS.map((m) => (
    `<option value="${m}" ${rankingMetric === m ? 'selected' : ''}>${METRIC_LABELS[m]}</option>`
  )).join('');

  container.innerHTML = `
    <div class="gc-filter-box">
      <div class="gc-filter-head">🎛️ Mode Perbandingan Grup</div>
      <div class="gc-filter-modes">
        <label class="vsp-radio">
          <input type="radio" name="gc-mode" value="all" ${filterMode === 'all' ? 'checked' : ''} />
          Bandingkan Semua Grup
        </label>
        <label class="vsp-radio">
          <input type="radio" name="gc-mode" value="selected" ${filterMode === 'selected' ? 'checked' : ''} />
          Filter Grup Tertentu
        </label>
      </div>

      <div class="gc-picker-grid">${groupItems}</div>

      <div class="gc-filter-head" style="margin-top:12px;">📊 Nilai Perbandingan</div>
      <div class="gc-filter-modes">
        <label class="vsp-radio">
          <input type="radio" name="gc-value-mode" value="avg" ${valueMode === 'avg' ? 'checked' : ''} />
          Average
        </label>
        <label class="vsp-radio">
          <input type="radio" name="gc-value-mode" value="max" ${valueMode === 'max' ? 'checked' : ''} />
          Maximum
        </label>
        <label class="vsp-radio">
          <input type="radio" name="gc-value-mode" value="node" ${valueMode === 'node' ? 'checked' : ''} />
          Spesifik per Node
        </label>
      </div>

      <div class="gc-filter-head" style="margin-top:12px;">🏆 Ranking Card Berdasarkan</div>
      <div class="gc-filter-modes">
        <select id="gc-ranking-metric" class="vsp-select gc-ranking-select">
          ${rankingOptions}
        </select>
      </div>

      <div class="gc-node-selectors ${valueMode === 'node' ? '' : 'hidden'}">
        ${nodeSelectRows}
      </div>
    </div>
  `;

  container.querySelectorAll('input[name="gc-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      filterMode = radio.value;
      if (state.onRefresh) state.onRefresh();
    });
  });

  container.querySelectorAll('.gc-picker-grid input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const gid = cb.dataset.gid;
      if (!gid) return;
      if (cb.checked) selectedGroupIds.add(gid);
      else selectedGroupIds.delete(gid);
      if (state.onRefresh) state.onRefresh();
    });
  });

  container.querySelectorAll('input[name="gc-value-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      valueMode = radio.value;
      if (state.onRefresh) state.onRefresh();
    });
  });

  container.querySelectorAll('.gc-node-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const gid = sel.dataset.gid;
      if (!gid) return;
      selectedNodeByGroup.set(gid, sel.value);
      if (state.onRefresh) state.onRefresh();
    });
  });

  const rankingSelect = container.querySelector('#gc-ranking-metric');
  if (rankingSelect) {
    rankingSelect.addEventListener('change', () => {
      rankingMetric = rankingSelect.value || 'spice';
      if (state.onRefresh) state.onRefresh();
    });
  }
}

function getFilteredGroups(allBuckets) {
  if (filterMode === 'all') return allBuckets;
  return allBuckets.filter((b) => selectedGroupIds.has(b.group.id));
}

function getValueLabel(metric) {
  if (valueMode === 'max') return `Max ${METRIC_LABELS[metric]}`;
  if (valueMode === 'node') return `Node ${METRIC_LABELS[metric]}`;
  return `Avg ${METRIC_LABELS[metric]}`;
}

function renderGCPodium(groupStats, primaryMetric) {
  const container = document.getElementById('gc-podium');
  if (!container || !primaryMetric) return;

  const sorted = [...groupStats].sort((a, b) => b.values[primaryMetric] - a.values[primaryMetric]);
  if (sorted.length === 0) {
    container.innerHTML = '';
    return;
  }

  const ranks = ['🥇', '🥈', '🥉'];
  const podiumClass = ['gc-podium-1', 'gc-podium-2', 'gc-podium-3'];

  container.innerHTML = sorted.slice(0, 3).map((gs, i) => `
      <div class="gc-podium-card ${podiumClass[i] || ''}">
        <div class="gc-podium-head">
          <span class="gc-podium-title" style="display: flex; align-items: center; gap: 8px;">
             <span style="font-size: 24px;">${ranks[i] || '🏅'}</span> Rank ${i + 1}
          </span>
          <span class="gc-group-tag" style="background: ${gs.group.color}22; color: ${gs.group.color}; border-color: ${gs.group.color}44;">
             ${gs.group.name}
          </span>
        </div>
        <div style="margin-top: 12px;">
          <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">${getValueLabel(primaryMetric)}</div>
          <div class="gc-podium-name">${gs.values[primaryMetric].toFixed(4)}</div>
        </div>
        <div class="gc-podium-meta" style="margin-top: auto; padding-top: 12px;">
           <span>${valueMode === 'node' ? `Node: ${gs.sourceNodeByMetric[primaryMetric]}` : `${gs.experiments.length} models in this group`}</span>
        </div>
      </div>
    `).join('');
}

function renderGCTable(groupStats, metrics) {
  const table = document.getElementById('gc-table');
  if (!table) return;

  let html = '<thead><tr><th style="text-align: left;">Group Designation</th>';
  metrics.forEach((m) => { html += `<th>${getValueLabel(m)}</th>`; });
  html += '</tr></thead><tbody>';

  groupStats.forEach((gs) => {
    html += `<tr class="hoverable-row">
      <td style="text-align: left; border-right: 1px solid var(--border-card);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="width: 14px; height: 14px; border-radius: 4px; background: ${gs.group.color}; box-shadow: 0 0 8px ${gs.group.color}66;"></span>
          <div>
            <div style="font-weight: 600; font-size: 14px; color: var(--text-primary);">${gs.group.name}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${valueMode === 'node' ? `Node: ${gs.sourceNodeByMetric[metrics[0]]}` : `${gs.experiments.length} experiments`}</div>
          </div>
        </div>
      </td>`;
    metrics.forEach((m) => {
      html += `<td style="font-weight: 600;">${gs.values[m].toFixed(4)}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody>';
  table.innerHTML = html;
}

function renderGCLine(groupStats, metrics, isDark) {
  const canvas = document.getElementById('gc-line-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const basics = getChartBasics(isDark);
  if (gcLineChart) gcLineChart.destroy();

  const datasets = groupStats.map((gs) => ({
    label: gs.group.name,
    data: metrics.map((m) => gs.values[m]),
    borderColor: gs.group.color,
    backgroundColor: gs.group.color + '22',
    pointBackgroundColor: gs.group.color,
    borderWidth: 3,
    fill: true,
    tension: 0.4,
  }));

  gcLineChart = new Chart(ctx, {
    type: 'line',
    data: { labels: metrics.map((m) => METRIC_LABELS[m]), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { grid: { color: basics.gridColor }, ticks: { color: basics.textColor }, beginAtZero: false },
        x: { grid: { color: basics.gridColor }, ticks: { color: basics.textColor } }
      },
      plugins: {
        legend: { labels: { color: basics.textColor, padding: 20 } },
        tooltip: {
          backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
          titleColor: isDark ? '#fff' : '#000',
          bodyColor: isDark ? '#ddd' : '#333',
          borderColor: basics.gridColor,
          borderWidth: 1,
          padding: 12,
        }
      }
    }
  });
}

function renderGCBar(groupStats, metrics, isDark) {
  const canvas = document.getElementById('gc-bar-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const basics = getChartBasics(isDark);
  if (gcBarChart) gcBarChart.destroy();

  const primaryMetric = metrics[0] || 'bleu_4';

  gcBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: groupStats.map((gs) => gs.group.name),
      datasets: [{
        label: getValueLabel(primaryMetric),
        data: groupStats.map((gs) => gs.values[primaryMetric]),
        backgroundColor: groupStats.map((gs) => gs.group.color + 'dd'),
        hoverBackgroundColor: groupStats.map((gs) => gs.group.color),
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { grid: { color: basics.gridColor }, ticks: { color: basics.textColor } },
        x: { grid: { display: false }, ticks: { color: basics.textColor } }
      },
      plugins: {
        legend: { labels: { color: basics.textColor, padding: 20 } }
      }
    }
  });
}
