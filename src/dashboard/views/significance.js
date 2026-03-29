import { state } from '../state.js';
import { METRICS, METRIC_LABELS, JOURNAL_BASELINE, LOWER_IS_BETTER } from '../constants.js';
import { calculateDiff, significanceHeuristic } from '../utils.js';

let controlsInitialized = false;
let significanceMode = 'top3';
let significanceGroupId = '';
let significanceGroupAId = '';
let significanceGroupBId = '';
let significanceNodeAId = '';
let significanceNodeBId = '';

export function renderSignificanceView() {
  initSignificanceControls();

  const activeMetrics = Array.from(state.selectedMetrics).length > 0
    ? Array.from(state.selectedMetrics)
    : METRICS;
  const rows = getSignificanceRows(activeMetrics);

  renderSignificanceCards(rows);
  renderSignificanceTable(rows);
}

function initSignificanceControls() {
  const modeRadios = document.querySelectorAll('input[name="sig-mode"]');
  const groupSelect = document.getElementById('sig-group-select');
  const groupCompareWrap = document.getElementById('sig-group-compare-selectors');
  const nodeCompareWrap = document.getElementById('sig-node-compare-selectors');
  const groupASelect = document.getElementById('sig-group-a-select');
  const groupBSelect = document.getElementById('sig-group-b-select');
  const nodeASelect = document.getElementById('sig-node-a-select');
  const nodeBSelect = document.getElementById('sig-node-b-select');

  if (!modeRadios.length || !groupSelect || !groupCompareWrap || !nodeCompareWrap
    || !groupASelect || !groupBSelect || !nodeASelect || !nodeBSelect) return;

  if (!controlsInitialized) {
    modeRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        significanceMode = radio.value;
        ensureDefaultSelections();
        updateControlVisibility();
        if (state.onRefresh) state.onRefresh();
      });
    });

    groupSelect.addEventListener('change', () => {
      significanceGroupId = groupSelect.value || '';
      if (state.onRefresh) state.onRefresh();
    });

    groupASelect.addEventListener('change', () => {
      significanceGroupAId = groupASelect.value || '';
      if (state.onRefresh) state.onRefresh();
    });

    groupBSelect.addEventListener('change', () => {
      significanceGroupBId = groupBSelect.value || '';
      if (state.onRefresh) state.onRefresh();
    });

    nodeASelect.addEventListener('change', () => {
      significanceNodeAId = nodeASelect.value || '';
      if (state.onRefresh) state.onRefresh();
    });

    nodeBSelect.addEventListener('change', () => {
      significanceNodeBId = nodeBSelect.value || '';
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

  if (significanceGroupId) groupSelect.value = significanceGroupId;
  if (significanceGroupAId) groupASelect.value = significanceGroupAId;
  if (significanceGroupBId) groupBSelect.value = significanceGroupBId;
  if (significanceNodeAId) nodeASelect.value = significanceNodeAId;
  if (significanceNodeBId) nodeBSelect.value = significanceNodeBId;

  modeRadios.forEach((radio) => {
    radio.checked = radio.value === significanceMode;
  });

  updateControlVisibility();
}

function updateControlVisibility() {
  const groupSelect = document.getElementById('sig-group-select');
  const groupCompareWrap = document.getElementById('sig-group-compare-selectors');
  const nodeCompareWrap = document.getElementById('sig-node-compare-selectors');
  if (!groupSelect || !groupCompareWrap || !nodeCompareWrap) return;

  groupSelect.classList.toggle('hidden', significanceMode !== 'group');
  groupCompareWrap.classList.toggle('hidden', significanceMode !== 'group-compare');
  nodeCompareWrap.classList.toggle('hidden', significanceMode !== 'node-compare');
}

function ensureDefaultSelections() {
  const groups = state.allGroups || [];
  const exps = getSelectedOrAllExperiments();

  if (significanceMode === 'group' && !significanceGroupId && groups.length > 0) {
    significanceGroupId = groups[0].id;
  }

  if (significanceMode === 'group-compare') {
    if (!significanceGroupAId && groups.length > 0) significanceGroupAId = groups[0].id;
    if (!significanceGroupBId && groups.length > 1) significanceGroupBId = groups[1].id;
    if (groups.length > 1 && significanceGroupAId === significanceGroupBId) {
      const alt = groups.find((g) => g.id !== significanceGroupAId);
      if (alt) significanceGroupBId = alt.id;
    }
  }

  if (significanceMode === 'node-compare') {
    if (!significanceNodeAId && exps.length > 0) significanceNodeAId = exps[0].id;
    if (!significanceNodeBId && exps.length > 1) significanceNodeBId = exps[1].id;
    if (exps.length > 1 && significanceNodeAId === significanceNodeBId) {
      const alt = exps.find((e) => e.id !== significanceNodeAId);
      if (alt) significanceNodeBId = alt.id;
    }
  }
}

function getSelectedOrAllExperiments() {
  const selectedExps = state.allExperiments.filter((e) => state.selectedIds.has(e.id));
  return selectedExps.length > 0 ? selectedExps : state.allExperiments;
}

function getSignificanceRows(metrics) {
  if (!metrics.length) return [];

  if (significanceMode === 'group-compare') {
    return getGroupComparisonRows(metrics);
  }

  if (significanceMode === 'node-compare') {
    return getNodeComparisonRows(metrics);
  }

  const experiments = getBaselineReferenceExperiments(metrics);
  const rows = [];

  experiments.forEach((exp) => {
    metrics.forEach((metric) => {
      rows.push({
        rowLabel: exp.name,
        metric,
        actual: parseFloat(exp.results?.[metric]) || 0,
        reference: parseFloat(JOURNAL_BASELINE.results?.[metric]) || 0,
        actualLabel: 'Actual Score',
        referenceLabel: 'Baseline Jurnal',
      });
    });
  });

  return rows;
}

function getBaselineReferenceExperiments(metrics) {
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

function getGroupComparisonRows(metrics) {
  if (!significanceGroupAId || !significanceGroupBId || significanceGroupAId === significanceGroupBId) return [];

  const selectedExps = getSelectedOrAllExperiments();
  const groupA = state.allGroups.find((g) => g.id === significanceGroupAId);
  const groupB = state.allGroups.find((g) => g.id === significanceGroupBId);
  if (!groupA || !groupB) return [];

  const groupAExps = selectedExps.filter((e) => e.groupId === groupA.id);
  const groupBExps = selectedExps.filter((e) => e.groupId === groupB.id);
  if (!groupAExps.length || !groupBExps.length) return [];

  return metrics.map((metric) => ({
    rowLabel: `${groupA.name} vs ${groupB.name}`,
    metric,
    actual: averageMetric(groupAExps, metric),
    reference: averageMetric(groupBExps, metric),
    actualLabel: `Rata-rata ${groupA.name}`,
    referenceLabel: `Rata-rata ${groupB.name}`,
  }));
}

function getNodeComparisonRows(metrics) {
  if (!significanceNodeAId || !significanceNodeBId || significanceNodeAId === significanceNodeBId) return [];

  const selectedExps = getSelectedOrAllExperiments();
  const nodeA = selectedExps.find((e) => e.id === significanceNodeAId);
  const nodeB = selectedExps.find((e) => e.id === significanceNodeBId);
  if (!nodeA || !nodeB) return [];

  return metrics.map((metric) => ({
    rowLabel: `${nodeA.name} vs ${nodeB.name}`,
    metric,
    actual: parseFloat(nodeA.results?.[metric]) || 0,
    reference: parseFloat(nodeB.results?.[metric]) || 0,
    actualLabel: nodeA.name,
    referenceLabel: nodeB.name,
  }));
}

function averageMetric(experiments, metric) {
  if (!experiments.length) return 0;
  const sum = experiments.reduce((acc, exp) => acc + (parseFloat(exp.results?.[metric]) || 0), 0);
  return sum / experiments.length;
}

function getScore(exp, metrics) {
  return metrics.reduce((acc, metric) => {
    const val = parseFloat(exp.results?.[metric]) || 0;
    return acc + (LOWER_IS_BETTER.has(metric) ? -val : val);
  }, 0);
}

function getSigStatus(actual, reference) {
  if (significanceHeuristic.isSuperior(actual, reference)) {
    return {
      badgeClass: 'badge-superior',
      icon: '🟢',
      text: 'Superior',
    };
  }
  if (significanceHeuristic.isInferior(actual, reference)) {
    return {
      badgeClass: 'badge-inferior',
      icon: '🔴',
      text: 'Inferior',
    };
  }
  return {
    badgeClass: 'badge-marginal',
    icon: '🟡',
    text: 'Marginal / Tie',
  };
}

function getMetricDelta(actual, reference, metric) {
  if (LOWER_IS_BETTER.has(metric)) return reference - actual;
  return actual - reference;
}

function getPairwiseSummary(rows) {
  if (!rows.length || (significanceMode !== 'group-compare' && significanceMode !== 'node-compare')) return '';

  const leftLabel = rows[0].actualLabel;
  const rightLabel = rows[0].referenceLabel;
  let leftWins = 0;
  let rightWins = 0;
  let ties = 0;

  const leftMargins = [];
  const rightMargins = [];

  rows.forEach((row) => {
    const delta = getMetricDelta(row.actual, row.reference, row.metric);
    const base = Math.abs(row.reference) > 1e-9 ? Math.abs(row.reference) : 1;
    const pct = (Math.abs(delta) / base) * 100;

    if (delta > 0.015) {
      leftWins++;
      leftMargins.push({ abs: Math.abs(delta), pct });
    } else if (delta < -0.015) {
      rightWins++;
      rightMargins.push({ abs: Math.abs(delta), pct });
    } else {
      ties++;
    }
  });

  let headline = `${leftLabel} dan ${rightLabel} relatif seimbang dalam uji margin.`;
  if (leftWins > rightWins) headline = `${leftLabel} signifikan lebih baik dari ${rightLabel}.`;
  else if (rightWins > leftWins) headline = `${rightLabel} signifikan lebih baik dari ${leftLabel}.`;

  const leadMargins = leftWins >= rightWins ? leftMargins : rightMargins;
  const leadName = leftWins >= rightWins ? leftLabel : rightLabel;
  const avgAbs = leadMargins.length
    ? leadMargins.reduce((acc, m) => acc + m.abs, 0) / leadMargins.length
    : 0;
  const avgPct = leadMargins.length
    ? leadMargins.reduce((acc, m) => acc + m.pct, 0) / leadMargins.length
    : 0;

  return `
    <div class="sig-card" style="grid-column: 1 / -1; border-top: 4px solid var(--accent);">
      <div class="sig-card-title">🧾 Kesimpulan Pairwise</div>
      <div class="sig-score" style="font-size:20px; color: var(--text-primary);">${headline}</div>
      <div class="sig-score-desc" style="font-size:14px;">
        Hasil: <strong>${leftLabel}</strong> unggul signifikan di <strong>${leftWins}</strong> metrik, 
        <strong>${rightLabel}</strong> unggul signifikan di <strong>${rightWins}</strong> metrik, 
        dan <strong>${ties}</strong> metrik berada pada zona <em>marginal/tie</em> (|Δ| ≤ 0.015).
      </div>
      <div class="sig-score-desc" style="font-size:14px;">
        Rata-rata margin pihak yang unggul (${leadName}) = <strong>${avgAbs.toFixed(4)}</strong> 
        atau sekitar <strong>${avgPct.toFixed(2)}%</strong>.
      </div>
    </div>
  `;
}

function renderSignificanceCards(rows) {
  const container = document.getElementById('sig-cards-container');
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = `
      <div class="sig-card" style="grid-column: 1 / -1;">
        <div class="sig-card-title">ℹ️ Tidak ada data</div>
        <div class="sig-score" style="font-size:20px; color: var(--text-muted);">Periksa mode atau pilihan group/node Anda.</div>
      </div>
    `;
    return;
  }

  let superiorCount = 0;
  let marginalCount = 0;
  let inferiorCount = 0;

  rows.forEach((row) => {
    const status = getSigStatus(row.actual, row.reference);
    if (status.text === 'Superior') superiorCount++;
    else if (status.text === 'Inferior') inferiorCount++;
    else marginalCount++;
  });

  const refLabel = rows[0].referenceLabel;
  const pairwiseSummary = getPairwiseSummary(rows);
  container.innerHTML = `
    ${pairwiseSummary}
    <div class="sig-card" style="border-top: 4px solid var(--success);">
      <div class="sig-card-header">
        <span class="sig-card-title">🟢 Superior Metrics</span>
      </div>
      <div class="sig-score">${superiorCount}</div>
      <div class="sig-score-desc">Jumlah metrik yang secara empirik <strong>unggul</strong> terhadap referensi (${refLabel}).</div>
    </div>
    
    <div class="sig-card" style="border-top: 4px solid var(--warning);">
      <div class="sig-card-header">
        <span class="sig-card-title">🟡 Marginal / Tie</span>
      </div>
      <div class="sig-score" style="color: var(--warning);">${marginalCount}</div>
      <div class="sig-score-desc">Jumlah metrik yang <strong>setara</strong> (selisih dalam margin error).</div>
    </div>
    
    <div class="sig-card" style="border-top: 4px solid var(--danger);">
      <div class="sig-card-header">
        <span class="sig-card-title">🔴 Inferior</span>
      </div>
      <div class="sig-score" style="color: var(--danger);">${inferiorCount}</div>
      <div class="sig-score-desc">Jumlah metrik yang <strong>tertinggal</strong> terhadap referensi (${refLabel}).</div>
    </div>
  `;
}

function renderSignificanceTable(rows) {
  const table = document.getElementById('sig-table');
  if (!table) return;
  if (!rows.length) {
    table.innerHTML = '<thead><tr><th>Info</th></tr></thead><tbody><tr><td>Tidak ada data untuk mode/pilihan ini.</td></tr></tbody>';
    return;
  }

  const actualLabel = rows[0].actualLabel;
  const referenceLabel = rows[0].referenceLabel;

  let html = `<thead>
      <tr>
        <th style="text-align: left;">Konteks Perbandingan</th>
        <th style="text-align: left;">Evaluation Metric</th>
        <th>${actualLabel}</th>
        <th>Diff vs ${referenceLabel}</th>
        <th>Heuristic Significance Proxy</th>
      </tr>
    </thead>
    <tbody>`;

  rows.forEach((row) => {
    const { diff, pct } = calculateDiff(row.actual, row.reference);
    const status = getSigStatus(row.actual, row.reference);

    html += `<tr class="hoverable-row">
      <td style="vertical-align:middle; text-align:left; border-right: 1px solid var(--border-card); font-weight:700; color: var(--text-primary);">${row.rowLabel}</td>
      <td style="text-align:left; font-weight:500;">${METRIC_LABELS[row.metric]}</td>
      <td>${row.actual.toFixed(4)}</td>
      <td style="font-weight: 500; color: ${diff >= 0 ? 'var(--success)' : 'var(--danger)'}">${diff > 0 ? '+' : ''}${diff.toFixed(4)} (${pct}%)</td>
      <td>
        <span class="badge ${status.badgeClass}">
          ${status.icon} ${status.text}
        </span>
      </td>
    </tr>`;
  });

  html += '</tbody>';
  table.innerHTML = html;
}
