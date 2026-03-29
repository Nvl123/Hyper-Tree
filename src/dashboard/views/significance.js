import { state } from '../state.js';
import { METRICS, METRIC_LABELS, JOURNAL_BASELINE, LOWER_IS_BETTER } from '../constants.js';
import { calculateDiff, significanceHeuristic } from '../utils.js';

let controlsInitialized = false;
let significanceMode = 'top3';
let significanceGroupId = '';

export function renderSignificanceView() {
  initSignificanceControls();

  const activeMetrics = Array.from(state.selectedMetrics).length > 0
    ? Array.from(state.selectedMetrics)
    : METRICS;
  const selectedExps = getSignificanceExperiments(activeMetrics);
  
  renderSignificanceCards(selectedExps, activeMetrics);
  renderSignificanceTable(selectedExps, activeMetrics);
}

function initSignificanceControls() {
  const top3Radio = document.querySelector('input[name="sig-mode"][value="top3"]');
  const groupRadio = document.querySelector('input[name="sig-mode"][value="group"]');
  const groupSelect = document.getElementById('sig-group-select');
  if (!top3Radio || !groupRadio || !groupSelect) return;

  if (!controlsInitialized) {
    top3Radio.addEventListener('change', () => {
      if (!top3Radio.checked) return;
      significanceMode = 'top3';
      groupSelect.classList.add('hidden');
      if (state.onRefresh) state.onRefresh();
    });

    groupRadio.addEventListener('change', () => {
      if (!groupRadio.checked) return;
      significanceMode = 'group';
      if (!significanceGroupId && state.allGroups.length > 0) significanceGroupId = state.allGroups[0].id;
      groupSelect.classList.remove('hidden');
      if (state.onRefresh) state.onRefresh();
    });

    groupSelect.addEventListener('change', () => {
      significanceGroupId = groupSelect.value || '';
      if (state.onRefresh) state.onRefresh();
    });

    controlsInitialized = true;
  }

  if (significanceMode === 'group' && !significanceGroupId && state.allGroups.length > 0) {
    significanceGroupId = state.allGroups[0].id;
  }

  groupSelect.innerHTML =
    '<option value="">— Pilih Grup —</option>' +
    state.allGroups.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');

  if (significanceGroupId && state.allGroups.some((g) => g.id === significanceGroupId)) {
    groupSelect.value = significanceGroupId;
  }

  top3Radio.checked = significanceMode === 'top3';
  groupRadio.checked = significanceMode === 'group';
  groupSelect.classList.toggle('hidden', significanceMode !== 'group');
}

function getSignificanceExperiments(metrics) {
  const selectedExps = state.allExperiments.filter((e) => state.selectedIds.has(e.id));
  if (selectedExps.length === 0) return [];

  if (significanceMode === 'group') {
    if (!significanceGroupId) return [];
    return selectedExps
      .filter((e) => e.groupId === significanceGroupId)
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

function renderSignificanceCards(experiments, metrics) {
  const container = document.getElementById('sig-cards-container');
  if (!container) return;
  
  // Aggregate stats
  let superiorCount = 0;
  let marginalCount = 0;
  let inferiorCount = 0;
  
  experiments.forEach(exp => {
    metrics.forEach(m => {
      const val = parseFloat(exp.results?.[m]) || 0;
      const base = parseFloat(JOURNAL_BASELINE.results?.[m]) || 0;
      if (significanceHeuristic.isSuperior(val, base)) superiorCount++;
      else if (significanceHeuristic.isInferior(val, base)) inferiorCount++;
      else marginalCount++;
    });
  });
  
  container.innerHTML = `
    <div class="sig-card" style="border-top: 4px solid var(--success);">
      <div class="sig-card-header">
        <span class="sig-card-title">🟢 Superior Metrics</span>
      </div>
      <div class="sig-score">${superiorCount}</div>
      <div class="sig-score-desc">Jumlah metrik evaluasi yang secara empirik <strong>mengalahkan</strong> jurnal referensi (>1.5% margin).</div>
    </div>
    
    <div class="sig-card" style="border-top: 4px solid var(--warning);">
      <div class="sig-card-header">
        <span class="sig-card-title">🟡 Marginal / Tie</span>
      </div>
      <div class="sig-score" style="color: var(--warning);">${marginalCount}</div>
      <div class="sig-score-desc">Jumlah metrik evaluasi yang performanya <strong>setara</strong> dengan jurnal (berada dalam margin error).</div>
    </div>
    
    <div class="sig-card" style="border-top: 4px solid var(--danger);">
      <div class="sig-card-header">
        <span class="sig-card-title">🔴 Inferior</span>
      </div>
      <div class="sig-score" style="color: var(--danger);">${inferiorCount}</div>
      <div class="sig-score-desc">Jumlah metrik evaluasi yang <strong>tertinggal</strong> dibandingkan dengan jurnal.</div>
    </div>
  `;
}

function renderSignificanceTable(experiments, metrics) {
  const table = document.getElementById('sig-table');
  if (!table) return;
  if (experiments.length === 0 || metrics.length === 0) {
    table.innerHTML = '<thead><tr><th>Info</th></tr></thead><tbody><tr><td>Tidak ada data untuk mode ini.</td></tr></tbody>';
    return;
  }

  let html = `<thead>
      <tr>
        <th style="text-align: left;">Model / Experiment</th>
        <th style="text-align: left;">Evaluation Metric</th>
        <th>Actual Score</th>
        <th>Diff vs Baseline</th>
        <th>Heuristic Significance Proxy</th>
      </tr>
    </thead>
    <tbody>`;

  experiments.forEach((exp) => {
    metrics.forEach((m, mi) => {
      const val = parseFloat(exp.results?.[m]) || 0;
      const base = parseFloat(JOURNAL_BASELINE.results?.[m]) || 0;
      const { diff, pct } = calculateDiff(val, base);
      
      let badgeClass = 'badge-marginal';
      let sigIcon = '🟡';
      let sigText = 'Marginal / Tie';

      if (significanceHeuristic.isSuperior(val, base)) {
        badgeClass = 'badge-superior';
        sigIcon = '🟢';
        sigText = 'Superior';
      } else if (significanceHeuristic.isInferior(val, base)) {
        badgeClass = 'badge-inferior';
        sigIcon = '🔴';
        sigText = 'Inferior';
      }

      html += `<tr class="hoverable-row">
        ${mi === 0 ? `<td rowspan="${metrics.length}" style="vertical-align:middle; text-align:left; border-right: 1px solid var(--border-card); font-weight:700; color: var(--text-primary);">${exp.name}</td>` : ''}
        <td style="text-align:left; font-weight:500;">${METRIC_LABELS[m]}</td>
        <td>${val.toFixed(4)}</td>
        <td style="font-weight: 500; color: ${diff >= 0 ? 'var(--success)' : 'var(--danger)'}">${diff > 0 ? '+' : ''}${diff.toFixed(4)} (${pct}%)</td>
        <td>
          <span class="badge ${badgeClass}">
            ${sigIcon} ${sigText}
          </span>
        </td>
      </tr>`;
    });
  });

  html += `</tbody>`;
  table.innerHTML = html;
}
