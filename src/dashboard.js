import './dashboard.css';
import {
  Chart,
  LineController,
  BarController,
  RadarController,
  ScatterController,
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
  LineController, BarController, RadarController, ScatterController,
  LineElement, BarElement, PointElement,
  RadialLinearScale, CategoryScale, LinearScale,
  Filler, Legend, Tooltip, Title
);

// ─── Constants ───────────────────────────────────────────

const METRICS = ['bleu_1', 'bleu_2', 'bleu_3', 'bleu_4', 'meteor', 'rouge_l', 'cider', 'spice'];
const METRIC_LABELS = {
  bleu_1: 'BLEU-1', bleu_2: 'BLEU-2', bleu_3: 'BLEU-3', bleu_4: 'BLEU-4',
  meteor: 'METEOR', rouge_l: 'ROUGE-L', cider: 'CIDEr', spice: 'SPICE',
};

const LOSS_ACC_METRICS = ['loss', 'accuracy'];
const LOSS_ACC_LABELS = {
  loss: 'Loss', accuracy: 'Accuracy',
};

// Metrics where lower is better (used for ranking)
const LOWER_IS_BETTER = new Set(['loss']);

const CHART_COLORS = [
  '#63b3ed', '#a78bfa', '#f687b3', '#68d391', '#fbd38d',
  '#fc8181', '#76e4f7', '#f6ad55', '#9ae6b4', '#b794f4',
  '#feb2b2', '#90cdf4', '#d6bcfa', '#fbb6ce',
];

const STORAGE_KEY = 'hypertree_data';

let lineChart = null, radarChart = null, barChart = null;
let allExperiments = [];
let selectedIds = new Set();
let selectedMetrics = new Set(METRICS);
let selectedLAMetrics = new Set(LOSS_ACC_METRICS);
let sortMetric = '';
let sortDir = 'desc';
let viewMode = 'eval'; // 'eval' or 'lossacc'

// ─── Init ────────────────────────────────────────────────

initTheme();
setupToolbar();
loadFromLocalStorage();

// ─── Theme ───────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('hypertree_theme') || 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('hypertree_theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.innerHTML = theme === 'dark'
      ? '<span class="btn-icon">☀️</span> Light'
      : '<span class="btn-icon">🌙</span> Dark';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
  refreshDashboard();
}

// ─── Toolbar ─────────────────────────────────────────────

function setupToolbar() {
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  document.getElementById('btn-open-file').addEventListener('click', async () => {
    const data = await loadFromFile();
    if (data) {
      initExperiments(data);
      refreshDashboard();
    }
  });

  // Loss & Acc toggle
  const lossAccBtn = document.getElementById('btn-loss-acc');
  lossAccBtn.addEventListener('click', () => {
    viewMode = viewMode === 'eval' ? 'lossacc' : 'eval';
    lossAccBtn.classList.toggle('active', viewMode === 'lossacc');
    sortMetric = '';
    sortDir = 'desc';
    buildFilters();
    refreshDashboard();
  });

  // Smooth page transition for back link
  document.querySelectorAll('a.toolbar-btn').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');
      document.body.classList.add('page-exit');
      setTimeout(() => { window.location.href = href; }, 250);
    });
  });
}

// ─── Data Loading ────────────────────────────────────────

function loadFromLocalStorage() {
  const data = getTreeDataFromStorage();
  if (data && data.roots && data.roots.length > 0) {
    initExperiments(data);
    refreshDashboard();
  }
}

function getTreeDataFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function loadFromFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch (err) {
      if (err.name === 'AbortError') return null;
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        try { resolve(JSON.parse(ev.target.result)); }
        catch { resolve(null); }
      };
      reader.readAsText(file);
    });
    input.click();
  });
}

// ─── Flatten nodes ───────────────────────────────────────

function flattenNodes(nodes, list = []) {
  for (const node of nodes) {
    list.push(node);
    if (node.children) flattenNodes(node.children, list);
  }
  return list;
}

// ─── Init Experiments ────────────────────────────────────

function initExperiments(data) {
  const allNodes = flattenNodes(data.roots || []);
  allExperiments = allNodes.filter(n => n.results && Object.keys(n.results).length > 0);
  selectedIds = new Set(allExperiments.map(e => e.id));
  selectedMetrics = new Set(METRICS);
  selectedLAMetrics = new Set(LOSS_ACC_METRICS);
  sortMetric = '';
  sortDir = 'desc';
  buildFilters();
}

// ─── Build Filters ───────────────────────────────────────

function buildFilters() {
  const container = document.getElementById('filter-container');
  if (!container) return;
  container.innerHTML = '';

  // — Experiment selection —
  const expSection = document.createElement('div');
  expSection.className = 'filter-group';

  const expTitle = document.createElement('div');
  expTitle.className = 'filter-title';
  expTitle.textContent = '🧪 Experiments';
  expSection.appendChild(expTitle);

  const expBtns = document.createElement('div');
  expBtns.className = 'filter-actions';

  const selectAllBtn = document.createElement('button');
  selectAllBtn.className = 'filter-action-btn';
  selectAllBtn.textContent = 'Select All';
  selectAllBtn.addEventListener('click', () => {
    selectedIds = new Set(allExperiments.map(e => e.id));
    updateCheckboxes();
    refreshDashboard();
  });

  const deselectAllBtn = document.createElement('button');
  deselectAllBtn.className = 'filter-action-btn';
  deselectAllBtn.textContent = 'Deselect All';
  deselectAllBtn.addEventListener('click', () => {
    selectedIds.clear();
    updateCheckboxes();
    refreshDashboard();
  });

  expBtns.appendChild(selectAllBtn);
  expBtns.appendChild(deselectAllBtn);
  expSection.appendChild(expBtns);

  const expList = document.createElement('div');
  expList.className = 'filter-checklist';
  expList.id = 'exp-checklist';

  allExperiments.forEach((exp, i) => {
    const label = document.createElement('label');
    label.className = 'filter-check-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedIds.has(exp.id);
    checkbox.dataset.expId = exp.id;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedIds.add(exp.id);
      else selectedIds.delete(exp.id);
      refreshDashboard();
    });

    const dot = document.createElement('span');
    dot.className = 'filter-color-dot';
    dot.style.background = CHART_COLORS[i % CHART_COLORS.length];

    const text = document.createElement('span');
    text.className = 'filter-check-label';
    text.textContent = exp.name;

    label.appendChild(checkbox);
    label.appendChild(dot);
    label.appendChild(text);
    expList.appendChild(label);
  });

  expSection.appendChild(expList);
  container.appendChild(expSection);

  // — Metric selection (dynamic based on viewMode) —
  const currentMetricsList = viewMode === 'lossacc' ? LOSS_ACC_METRICS : METRICS;
  const currentMetricLabels = viewMode === 'lossacc' ? LOSS_ACC_LABELS : METRIC_LABELS;
  const currentSelectedMetrics = viewMode === 'lossacc' ? selectedLAMetrics : selectedMetrics;

  const metSection = document.createElement('div');
  metSection.className = 'filter-group';

  const metTitle = document.createElement('div');
  metTitle.className = 'filter-title';
  metTitle.textContent = viewMode === 'lossacc' ? '📉 Loss & Acc Metrics' : '📏 Metrics';
  metSection.appendChild(metTitle);

  const metList = document.createElement('div');
  metList.className = 'filter-checklist';
  metList.id = 'metric-checklist';

  currentMetricsList.forEach((m) => {
    const label = document.createElement('label');
    label.className = 'filter-check-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = currentSelectedMetrics.has(m);
    checkbox.dataset.metric = m;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) currentSelectedMetrics.add(m);
      else currentSelectedMetrics.delete(m);
      refreshDashboard();
    });

    const text = document.createElement('span');
    text.className = 'filter-check-label';
    text.textContent = currentMetricLabels[m];

    label.appendChild(checkbox);
    label.appendChild(text);
    metList.appendChild(label);
  });

  metSection.appendChild(metList);
  container.appendChild(metSection);

  // — Sort —
  const sortSection = document.createElement('div');
  sortSection.className = 'filter-group';

  const sortTitle = document.createElement('div');
  sortTitle.className = 'filter-title';
  sortTitle.textContent = '↕️ Sort By';
  sortSection.appendChild(sortTitle);

  const sortSelect = document.createElement('select');
  sortSelect.className = 'filter-select';
  sortSelect.innerHTML = `<option value="">Overall Rank</option>` +
    currentMetricsList.map(m => `<option value="${m}" ${sortMetric === m ? 'selected' : ''}>${currentMetricLabels[m]}</option>`).join('');
  sortSelect.addEventListener('change', () => {
    sortMetric = sortSelect.value;
    refreshDashboard();
  });
  sortSection.appendChild(sortSelect);

  const sortDirBtn = document.createElement('button');
  sortDirBtn.className = 'filter-action-btn sort-dir-btn';
  sortDirBtn.textContent = sortDir === 'desc' ? '↓ Highest First' : '↑ Lowest First';
  sortDirBtn.addEventListener('click', () => {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    sortDirBtn.textContent = sortDir === 'desc' ? '↓ Highest First' : '↑ Lowest First';
    refreshDashboard();
  });
  sortSection.appendChild(sortDirBtn);

  container.appendChild(sortSection);
}

function updateCheckboxes() {
  document.querySelectorAll('#exp-checklist input[type="checkbox"]').forEach((cb) => {
    cb.checked = selectedIds.has(cb.dataset.expId);
  });
}

// ─── Refresh Dashboard ───────────────────────────────────

function getActiveMetricsList() {
  if (viewMode === 'lossacc') {
    return LOSS_ACC_METRICS.filter(m => selectedLAMetrics.has(m));
  }
  return METRICS.filter(m => selectedMetrics.has(m));
}

function getActiveMetricLabels() {
  return viewMode === 'lossacc' ? LOSS_ACC_LABELS : METRIC_LABELS;
}

function updateSectionTitles() {
  const t1 = document.getElementById('title-chart-1');
  const t2 = document.getElementById('title-chart-2');
  const t3 = document.getElementById('title-chart-3');
  const tRes = document.getElementById('title-results');

  if (viewMode === 'lossacc') {
    tRes.textContent = '📉 Loss & Accuracy Results';
    t1.textContent = '📉 Loss Comparison (Lower is Better)';
    t2.textContent = '🎯 Accuracy Comparison (Higher is Better)';
    t3.textContent = '🔬 Loss vs Accuracy Trade-off (Scatter)';
  } else {
    tRes.textContent = '🏆 Experiment Results';
    t1.textContent = '📈 Metrics Comparison (Line Chart)';
    t2.textContent = '🕸️ Experiment Profiles (Radar Chart)';
    t3.textContent = '📊 Per-Metric Ranking (Grouped Bar Chart)';
  }
}

function refreshDashboard() {
  const filtered = allExperiments.filter(e => selectedIds.has(e.id));
  const activeMetrics = getActiveMetricsList();

  if (filtered.length === 0 || activeMetrics.length === 0) {
    document.getElementById('dashboard-empty').classList.remove('hidden');
    document.getElementById('dashboard-main').classList.add('hidden');
    return;
  }

  document.getElementById('dashboard-empty').classList.add('hidden');
  document.getElementById('dashboard-main').classList.remove('hidden');

  updateSectionTitles();

  const labels = getActiveMetricLabels();
  renderTable(filtered, activeMetrics, labels);

  if (viewMode === 'lossacc') {
    renderLossBarChart(filtered);
    renderAccuracyBarChart(filtered);
    renderLossAccScatter(filtered);
  } else {
    renderLineChart(filtered, activeMetrics, labels);
    renderRadarChart(filtered, activeMetrics, labels);
    renderBarChart(filtered, activeMetrics, labels);
  }
}

// ─── Results Table with Gold/Silver/Bronze ───────────────

function renderTable(experiments, activeMetrics, labels) {
  const thead = document.querySelector('#results-table thead');
  const tbody = document.querySelector('#results-table tbody');

  thead.innerHTML = `<tr>
    <th class="rank-col">#</th>
    <th>Experiment</th>
    ${activeMetrics.map(m => `<th>${labels[m]}</th>`).join('')}
  </tr>`;

  // Rankings per metric (lower is better for loss, higher for others)
  const rankings = {};
  activeMetrics.forEach((metric) => {
    const sorted = experiments
      .map((exp, idx) => ({ idx, val: parseFloat(exp.results[metric]) || 0 }))
      .sort((a, b) => LOWER_IS_BETTER.has(metric) ? a.val - b.val : b.val - a.val);
    rankings[metric] = {};
    sorted.forEach((entry, rank) => { rankings[metric][entry.idx] = rank; });
  });

  // Compute overall score
  const overallScores = experiments.map((_, idx) => {
    let totalRank = 0;
    activeMetrics.forEach((m) => { totalRank += rankings[m][idx] || 0; });
    return { idx, avgRank: totalRank / activeMetrics.length };
  });

  // Sort
  if (sortMetric && rankings[sortMetric]) {
    overallScores.sort((a, b) => {
      const va = parseFloat(experiments[a.idx].results[sortMetric]) || 0;
      const vb = parseFloat(experiments[b.idx].results[sortMetric]) || 0;
      return sortDir === 'desc' ? vb - va : va - vb;
    });
  } else {
    overallScores.sort((a, b) => sortDir === 'desc' ? a.avgRank - b.avgRank : b.avgRank - a.avgRank);
  }

  tbody.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];

  overallScores.forEach(({ idx }, displayRank) => {
    const exp = experiments[idx];
    const tr = document.createElement('tr');

    if (displayRank === 0) tr.classList.add('rank-gold');
    else if (displayRank === 1) tr.classList.add('rank-silver');
    else if (displayRank === 2) tr.classList.add('rank-bronze');

    const rankTd = document.createElement('td');
    rankTd.className = 'rank-col';
    rankTd.textContent = displayRank < 3 ? medals[displayRank] : `${displayRank + 1}`;
    tr.appendChild(rankTd);

    const nameTd = document.createElement('td');
    nameTd.className = 'exp-name';
    nameTd.textContent = exp.name;
    tr.appendChild(nameTd);

    activeMetrics.forEach((metric) => {
      const td = document.createElement('td');
      const rawVal = exp.results[metric];
      const num = parseFloat(rawVal);
      td.textContent = !isNaN(num) ? num.toFixed(4) : (rawVal || '—');

      const metricRank = rankings[metric][idx];
      if (metricRank === 0) td.classList.add('metric-best');
      else if (metricRank === 1) td.classList.add('metric-second');
      else if (metricRank === 2) td.classList.add('metric-third');

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// ─── Line Chart ──────────────────────────────────────────

function renderLineChart(experiments, activeMetrics, labels) {
  const ctx = document.getElementById('line-chart');
  if (lineChart) lineChart.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? '#94a3b8' : '#475569';

  // Find the original index for color assignment
  const datasets = experiments.map((exp) => {
    const origIdx = allExperiments.findIndex(e => e.id === exp.id);
    const color = CHART_COLORS[(origIdx >= 0 ? origIdx : 0) % CHART_COLORS.length];
    return {
      label: exp.name,
      data: activeMetrics.map(m => parseFloat(exp.results[m]) || 0),
      borderColor: color,
      backgroundColor: color + '20',
      borderWidth: 2.5,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: color,
      pointBorderColor: isDark ? '#1a1b2e' : '#ffffff',
      pointBorderWidth: 2,
      tension: 0.3,
      fill: false,
    };
  });

  lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: activeMetrics.map(m => labels[m]),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            font: { family: 'Inter', size: 12, weight: '500' },
            padding: 16,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(24,27,37,0.95)' : 'rgba(255,255,255,0.95)',
          titleColor: isDark ? '#e2e8f0' : '#1e293b',
          bodyColor: isDark ? '#94a3b8' : '#475569',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter' },
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(4)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'Inter', size: 11, weight: '500' } },
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'Inter', size: 11 } },
          beginAtZero: true,
        },
      },
    },
  });
}

// ─── Radar Chart ─────────────────────────────────────────

function renderRadarChart(experiments, activeMetrics, labels) {
  const ctx = document.getElementById('radar-chart');
  if (radarChart) radarChart.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const textColor = isDark ? '#94a3b8' : '#475569';

  const datasets = experiments.map((exp) => {
    const origIdx = allExperiments.findIndex(e => e.id === exp.id);
    const color = CHART_COLORS[(origIdx >= 0 ? origIdx : 0) % CHART_COLORS.length];
    return {
      label: exp.name,
      data: activeMetrics.map(m => parseFloat(exp.results[m]) || 0),
      borderColor: color,
      backgroundColor: color + '25',
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: color,
      pointBorderColor: isDark ? '#1a1b2e' : '#ffffff',
      pointBorderWidth: 1.5,
    };
  });

  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: activeMetrics.map(m => labels[m]),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            font: { family: 'Inter', size: 12, weight: '500' },
            padding: 16,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
      },
      scales: {
        r: {
          grid: { color: gridColor },
          angleLines: { color: gridColor },
          pointLabels: { color: textColor, font: { family: 'Inter', size: 11, weight: '500' } },
          ticks: { color: textColor, backdropColor: 'transparent', font: { size: 10 } },
          beginAtZero: true,
        },
      },
    },
  });
}

// ─── Grouped Bar Chart ───────────────────────────────────

function renderBarChart(experiments, activeMetrics, labels) {
  const ctx = document.getElementById('bar-chart');
  if (barChart) barChart.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? '#94a3b8' : '#475569';

  const datasets = experiments.map((exp) => {
    const origIdx = allExperiments.findIndex(e => e.id === exp.id);
    const color = CHART_COLORS[(origIdx >= 0 ? origIdx : 0) % CHART_COLORS.length];
    return {
      label: exp.name,
      data: activeMetrics.map(m => parseFloat(exp.results[m]) || 0),
      backgroundColor: color + 'CC',
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4,
      borderSkipped: false,
    };
  });

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: activeMetrics.map(m => labels[m]),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            font: { family: 'Inter', size: 12, weight: '500' },
            padding: 16,
            usePointStyle: true,
            pointStyle: 'rectRounded',
          },
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(24,27,37,0.95)' : 'rgba(255,255,255,0.95)',
          titleColor: isDark ? '#e2e8f0' : '#1e293b',
          bodyColor: isDark ? '#94a3b8' : '#475569',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(4)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'Inter', size: 11, weight: '500' } },
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'Inter', size: 11 } },
          beginAtZero: true,
        },
      },
    },
  });
}

// ─── Loss & Accuracy Specialized Charts ──────────────────

function getLAChartColors(isDark) {
  return {
    gridColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    textColor: isDark ? '#94a3b8' : '#475569',
    tooltipBg: isDark ? 'rgba(24,27,37,0.95)' : 'rgba(255,255,255,0.95)',
    tooltipTitle: isDark ? '#e2e8f0' : '#1e293b',
    tooltipBody: isDark ? '#94a3b8' : '#475569',
    tooltipBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    pointBorder: isDark ? '#1a1b2e' : '#ffffff',
  };
}

// ─── Loss Bar Chart (Lower = Better) ──────────────────────

function renderLossBarChart(experiments) {
  const ctx = document.getElementById('line-chart');
  if (lineChart) lineChart.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const c = getLAChartColors(isDark);

  // Sort experiments by loss ascending (best first)
  const sorted = experiments
    .map((exp) => ({
      name: exp.name,
      loss: parseFloat(exp.results.loss) || 0,
      id: exp.id,
    }))
    .sort((a, b) => a.loss - b.loss);

  // Color gradient: green (low loss) → red (high loss)
  const maxLoss = Math.max(...sorted.map(s => s.loss), 0.01);
  const barColors = sorted.map(s => {
    const ratio = s.loss / maxLoss;
    const r = Math.round(50 + 200 * ratio);
    const g = Math.round(200 - 150 * ratio);
    return `rgba(${r}, ${g}, 80, 0.85)`;
  });
  const borderColors = sorted.map(s => {
    const ratio = s.loss / maxLoss;
    const r = Math.round(50 + 200 * ratio);
    const g = Math.round(200 - 150 * ratio);
    return `rgb(${r}, ${g}, 80)`;
  });

  lineChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(s => s.name),
      datasets: [{
        label: 'Loss',
        data: sorted.map(s => s.loss),
        backgroundColor: barColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.tooltipBg,
          titleColor: c.tooltipTitle,
          bodyColor: c.tooltipBody,
          borderColor: c.tooltipBorder,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter' },
          callbacks: {
            label: (ctx) => `Loss: ${ctx.parsed.x.toFixed(4)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: c.gridColor },
          ticks: { color: c.textColor, font: { family: 'Inter', size: 11 } },
          title: {
            display: true,
            text: 'Loss (lower is better →)',
            color: c.textColor,
            font: { family: 'Inter', size: 12, weight: '600' },
          },
          beginAtZero: true,
        },
        y: {
          grid: { color: c.gridColor },
          ticks: { color: c.textColor, font: { family: 'Inter', size: 11, weight: '500' } },
        },
      },
    },
  });
}

// ─── Accuracy Bar Chart (Higher = Better) ─────────────────

function renderAccuracyBarChart(experiments) {
  const ctx = document.getElementById('radar-chart');
  if (radarChart) radarChart.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const c = getLAChartColors(isDark);

  // Sort experiments by accuracy descending (best first)
  const sorted = experiments
    .map((exp) => ({
      name: exp.name,
      accuracy: parseFloat(exp.results.accuracy) || 0,
      id: exp.id,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  // Color gradient: green (high acc) → orange (low acc)
  const maxAcc = Math.max(...sorted.map(s => s.accuracy), 0.01);
  const barColors = sorted.map(s => {
    const ratio = s.accuracy / maxAcc;
    const r = Math.round(50 + 180 * (1 - ratio));
    const g = Math.round(100 + 130 * ratio);
    const b2 = Math.round(80 + 100 * ratio);
    return `rgba(${r}, ${g}, ${b2}, 0.85)`;
  });
  const borderColors = sorted.map(s => {
    const ratio = s.accuracy / maxAcc;
    const r = Math.round(50 + 180 * (1 - ratio));
    const g = Math.round(100 + 130 * ratio);
    const b2 = Math.round(80 + 100 * ratio);
    return `rgb(${r}, ${g}, ${b2})`;
  });

  radarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(s => s.name),
      datasets: [{
        label: 'Accuracy',
        data: sorted.map(s => s.accuracy),
        backgroundColor: barColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.tooltipBg,
          titleColor: c.tooltipTitle,
          bodyColor: c.tooltipBody,
          borderColor: c.tooltipBorder,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter' },
          callbacks: {
            label: (ctx) => `Accuracy: ${ctx.parsed.x.toFixed(4)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: c.gridColor },
          ticks: { color: c.textColor, font: { family: 'Inter', size: 11 } },
          title: {
            display: true,
            text: 'Accuracy (higher is better →)',
            color: c.textColor,
            font: { family: 'Inter', size: 12, weight: '600' },
          },
          beginAtZero: true,
          max: 1,
        },
        y: {
          grid: { color: c.gridColor },
          ticks: { color: c.textColor, font: { family: 'Inter', size: 11, weight: '500' } },
        },
      },
    },
  });
}

// ─── Loss vs Accuracy Scatter ─────────────────────────────

function renderLossAccScatter(experiments) {
  const ctx = document.getElementById('bar-chart');
  if (barChart) barChart.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const c = getLAChartColors(isDark);

  const datasets = experiments.map((exp) => {
    const origIdx = allExperiments.findIndex(e => e.id === exp.id);
    const color = CHART_COLORS[(origIdx >= 0 ? origIdx : 0) % CHART_COLORS.length];
    const loss = parseFloat(exp.results.loss) || 0;
    const acc = parseFloat(exp.results.accuracy) || 0;

    return {
      label: exp.name,
      data: [{ x: loss, y: acc }],
      backgroundColor: color + 'CC',
      borderColor: color,
      borderWidth: 2,
      pointRadius: 10,
      pointHoverRadius: 14,
      pointBorderColor: c.pointBorder,
      pointBorderWidth: 2,
    };
  });

  barChart = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: c.textColor,
            font: { family: 'Inter', size: 12, weight: '500' },
            padding: 16,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          backgroundColor: c.tooltipBg,
          titleColor: c.tooltipTitle,
          bodyColor: c.tooltipBody,
          borderColor: c.tooltipBorder,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter' },
          callbacks: {
            label: (ctx) => {
              const pt = ctx.parsed;
              return `${ctx.dataset.label} — Loss: ${pt.x.toFixed(4)}, Acc: ${pt.y.toFixed(4)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: c.gridColor },
          ticks: { color: c.textColor, font: { family: 'Inter', size: 11 } },
          title: {
            display: true,
            text: 'Loss ← lower is better',
            color: c.textColor,
            font: { family: 'Inter', size: 12, weight: '600' },
          },
          beginAtZero: true,
        },
        y: {
          grid: { color: c.gridColor },
          ticks: { color: c.textColor, font: { family: 'Inter', size: 11 } },
          title: {
            display: true,
            text: 'Accuracy → higher is better',
            color: c.textColor,
            font: { family: 'Inter', size: 12, weight: '600' },
          },
          beginAtZero: true,
          max: 1,
        },
      },
    },
  });
}
