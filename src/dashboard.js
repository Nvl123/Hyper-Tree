import './dashboard.css';
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

const STORAGE_NAMESPACE = new URLSearchParams(window.location.search).get('ws') || '';
const STORAGE_KEY = STORAGE_NAMESPACE ? `hypertree_data_${STORAGE_NAMESPACE}` : 'hypertree_data';

let lineChart = null, radarChart = null, barChart = null;
let allExperiments = [];
let allGroups = [];
let selectedIds = new Set();
let selectedMetrics = new Set(METRICS);
let selectedLAMetrics = new Set(LOSS_ACC_METRICS);
let sortMetric = '';
let sortDir = 'desc';
let viewMode = 'eval'; // 'eval', 'lossacc', 'correlation', or 'similarity'
let activePage = 'explore'; // 'explore', 'baseline', 'significance', 'group-compare'

// Group comparison charts
let gcLineChart = null;
let gcBarChart = null;

// ─── Init ────────────────────────────────────────────────

initTheme();
setupSidebar();
setupToolbar();
loadFromLocalStorage();

// ─── Sidebar Navigation ──────────────────────────────────

function setupSidebar() {
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.getElementById('app-sidebar');
  const btnExplore = document.getElementById('nav-explore');
  const btnBaseline = document.getElementById('nav-baseline');
  const btnSignificance = document.getElementById('nav-significance');
  const btnGroupCompare = document.getElementById('nav-group-compare');
  const mainContent = document.getElementById('dashboard-main');
  const emptyContent = document.getElementById('dashboard-empty');
  const baselineContent = document.getElementById('baseline-main');
  const significanceContent = document.getElementById('significance-main');
  const groupCompareContent = document.getElementById('group-compare-main');
  const toolbarCenter = document.querySelector('.toolbar-center');

  // Toggle Sidebar
  toggleBtn.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  const allContents = [mainContent, emptyContent, baselineContent, significanceContent, groupCompareContent];
  const hideAll = () => allContents.forEach(el => el && el.classList.add('hidden'));

  // Navigation Logic
  const switchPage = (page) => {
    activePage = page;

    btnExplore.classList.toggle('active', page === 'explore');
    btnBaseline.classList.toggle('active', page === 'baseline');
    btnSignificance.classList.toggle('active', page === 'significance');
    btnGroupCompare.classList.toggle('active', page === 'group-compare');

    hideAll();

    if (page === 'explore') {
      toolbarCenter.classList.remove('hidden');
      if (allExperiments.length === 0) {
        emptyContent.classList.remove('hidden');
      } else {
        mainContent.classList.remove('hidden');
        refreshDashboard();
      }
    } else if (page === 'baseline') {
      toolbarCenter.classList.add('hidden');
      if (allExperiments.length > 0) {
        baselineContent.classList.remove('hidden');
        renderBaselineSettings();
        renderBaselineComparison(allExperiments);
      } else {
        emptyContent.classList.remove('hidden');
      }
    } else if (page === 'significance') {
      toolbarCenter.classList.add('hidden');
      if (allExperiments.length > 0) {
        significanceContent.classList.remove('hidden');
        renderSigSettings();
        renderSignificanceView(allExperiments);
      } else {
        emptyContent.classList.remove('hidden');
      }
    } else if (page === 'group-compare') {
      toolbarCenter.classList.add('hidden');
      groupCompareContent.classList.remove('hidden');
      renderGroupCompare();
    }

    if (window.innerWidth <= 768) sidebar.classList.remove('mobile-open');
  };

  btnExplore.addEventListener('click', () => switchPage('explore'));
  btnBaseline.addEventListener('click', () => switchPage('baseline'));
  btnSignificance.addEventListener('click', () => switchPage('significance'));
  btnGroupCompare.addEventListener('click', () => switchPage('group-compare'));
}

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
  if (activePage === 'group-compare') {
    renderGroupCompare();
  } else if (activePage === 'baseline') {
    renderBaselineComparison(allExperiments);
  } else if (activePage === 'significance') {
    renderSignificanceView(allExperiments);
  } else {
    refreshDashboard();
  }
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
  const corrBtn = document.getElementById('btn-correlation');
  const simBtn = document.getElementById('btn-similarity');

  lossAccBtn.addEventListener('click', () => {
    viewMode = viewMode === 'lossacc' ? 'eval' : 'lossacc';
    lossAccBtn.classList.toggle('active', viewMode === 'lossacc');
    corrBtn.classList.toggle('active', false);
    simBtn.classList.toggle('active', false);
    sortMetric = '';
    sortDir = 'desc';
    buildFilters();
    refreshDashboard();
  });

  // Correlation toggle
  corrBtn.addEventListener('click', () => {
    viewMode = viewMode === 'correlation' ? 'eval' : 'correlation';
    corrBtn.classList.toggle('active', viewMode === 'correlation');
    lossAccBtn.classList.toggle('active', false);
    simBtn.classList.toggle('active', false);
    sortMetric = '';
    sortDir = 'desc';
    refreshDashboard();
  });

  // Similarity toggle
  simBtn.addEventListener('click', () => {
    viewMode = viewMode === 'similarity' ? 'eval' : 'similarity';
    simBtn.classList.toggle('active', viewMode === 'similarity');
    lossAccBtn.classList.toggle('active', false);
    corrBtn.classList.toggle('active', false);
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
    if (activePage === 'explore') {
      refreshDashboard();
    } else if (activePage === 'baseline') {
      renderBaselineComparison(allExperiments);
    } else if (activePage === 'significance') {
      renderSignificanceView(allExperiments);
    }
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
  allGroups = Array.isArray(data.groups) ? data.groups : [];
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
  let titleText = '📏 Metrics';
  if (viewMode === 'lossacc') titleText = '📉 Loss & Acc Metrics';
  else if (viewMode === 'correlation') titleText = '🔗 Eval Metrics (Sumbu X)';
  metTitle.textContent = titleText;
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
  
  const d1 = document.getElementById('desc-chart-1');
  const d2 = document.getElementById('desc-chart-2');
  const d3 = document.getElementById('desc-chart-3');
  
  const c2 = document.getElementById('radar-chart').parentElement.parentElement;
  const c3 = document.getElementById('bar-chart').parentElement.parentElement;

  if (viewMode === 'similarity') {
    c2.style.display = '';
    c3.style.display = 'none'; // Only 2 charts for similarity, hide the bottom one
    tRes.textContent = '👯 Similarity Overview';
    t1.textContent = '🕸️ Experiment Profiles (Radar Chart)';
    t2.textContent = '🧮 Experiment Similarity Heatmap';
    
    // Show reading guides
    d1.querySelector('.desc-content').innerHTML = `
      <p><strong>Grafik apa ini?</strong><br>
      Grafik ini menumpuk seluruh profil eksperimen di atas satu sama lain.</p>
      
      <p style="margin-top: 8px;"><strong>Cara Membaca Jaring:</strong><br>
      Jika bentuk poligon/luas jaring dua eksperimen nyaris sama secara visual, itu artinya performa mereka sangat identik sebelum Anda melihat angka matriks.</p>
    `;

    d2.querySelector('.desc-content').innerHTML = `
      <p><strong>Grafik apa ini?</strong><br>
      Grafik kotak-kotak (Heatmap) ini membandingkan kedudukan matematis antara Eksperimen A di sisi vertikal melawan Eksperimen B di sisi horizontal.</p>
      
      <p style="margin-top: 8px;"><strong>Cara Menganalisis Similarity:</strong><br>
      Sistem mengubah kombinasi <em>seluruh</em> metrik evaluasi eksperimen menjadi vektor. Kemudian jarak keunikannya dihubungkan menggunakan <em>Cosine Similarity</em>.<br>
      • <span style="color: #4CAF50; font-weight: bold;">Identik Berlian (Hijau):</span> Kemiripan di atas 95%. Perubahan arsitektur/tipe/parameter Anda tidak berpengaruh banyak.<br>
      • <span style="color: #F44336; font-weight: bold;">Unik Radikal (Merah):</span> Kemiripan kecil, menandakan dua sistem yang dipilah memiliki watak hasil evaluasi yang sangat kontras arahnya.</p>
    `;
    
    d1.classList.remove('hidden');
    d2.classList.remove('hidden');
    d3.classList.add('hidden');
  } else if (viewMode === 'correlation') {
    c2.style.display = '';
    c3.style.display = '';
    tRes.textContent = '🔗 Correlation Overview';
    t1.textContent = '📊 Evals vs Acc (Dual-Axis)';
    t2.textContent = '📉 Evals vs Loss (Dual-Axis)';
    t3.textContent = '🔮 Evaluation vs Accuracy vs Loss (Bubble Chart)';
    
    // Show reading guides
    d1.querySelector('.desc-content').innerHTML = `
      <p><strong>Grafik apa ini?</strong><br>
      Grafik ini menyandingkan skor gabungan dari Metrik Teks (BLEU, CIDEr, dll) yang Anda pilih sebagai garis area biru berurutan dari kiri ke kanan (Sumbu Y kiri), dengan skor Accuracy sebagai garis merah (Sumbu Y kanan).</p>
      
      <p style="margin-top: 8px;"><strong>Cara Menganalisis Korelasi:</strong><br>
      Tujuan grafik ini adalah melihat apakah model yang pintar menebak teks terjemahan/diksi juga pintar menebak klasifikasinya.<br>
      • <span style="color: #4CAF50; font-weight: bold;">Korelasi Baik:</span> Garis merah Akurasi ikut <strong>merambat naik dan menanjak sejajar</strong> secara konstan seiring berjalannya garis biru Evaluasi Teks ke arah kanan.<br>
      • <span style="color: #F44336; font-weight: bold;">Korelasi Buruk:</span> Garis merah tetap datar di bawah, atau bergerak zig-zag tidak menentu ke bawah bertentangan dengan garis biru.</p>
    `;

    d2.querySelector('.desc-content').innerHTML = `
      <p><strong>Grafik apa ini?</strong><br>
      Grafik ini menyandingkan skor gabungan dari Metrik Teks (BLEU, CIDEr, dll) sebagai garis area biru yang merambat naik (Sumbu Y kiri), dilawankan dengan metrik hambatan/kesalahan alias Loss sebagai garis merah (Sumbu Y kanan).</p>
      
      <p style="margin-top: 8px;"><strong>Cara Menganalisis Korelasi:</strong><br>
      Tujuan grafik ini adalah mengonfirmasi bahwa naiknya kualitas teks benar-benar disebabkan oleh penurunan hambatan berlatih (Loss).<br>
      • <span style="color: #4CAF50; font-weight: bold;">Korelasi Baik:</span> Garis merah Loss <strong>berlawanan arah secara sempurna</strong> dengan garis biru Evaluasi. Anda akan melihat garis merah <strong>menukik curam turun</strong> dari ujung kiri atas ke ujung kanan bawah (membentuk silangan huruf "X").<br>
      • <span style="color: #F44336; font-weight: bold;">Korelasi Buruk:</span> Loss tetap tinggi (di atas) padahal skor evaluasi membaik, menandakan model mungkin hanya menghafal/overfitting tanpa memperbaiki esensi dasarnya.</p>
    `;

    d3.querySelector('.desc-content').innerHTML = `
      <p><strong>Grafik apa ini?</strong><br>
      Ini adalah arena final penentuan Hyperparameter terbaik yang mencakup 3 dimensi performa sekaligus dalam satu kanvas kompetisi.</p>
      
      <p style="margin-top: 8px;"><strong>Cara Membaca 4 Elemen Gelembung:</strong><br>
      <strong>1. Sumbu X (Kiri-Kanan):</strong> Kualitas Metrik Teks (BLEU, ROUGE, dll). Semakin ke <strong>kanan</strong> artinya semakin cerdas menjalin kalimat.<br>
      <strong>2. Sumbu Y (Bawah-Atas):</strong> Kualitas Akurasi. Semakin ke <strong>atas</strong> artinya semakin akurat menebak/mengklasifikasi.<br>
      <strong>3. Ukuran Gelembung:</strong> Besaran Loss. Berbanding terbalik: <strong>Semakin besar gelembungnya</strong>, justru Loss-nya semakin kecil dan mulus.<br>
      <strong>4. Warna Gelembung:</strong> Status Loss. Hijau cerah = Loss kecil optimal. Merah/Gelap = Loss buruk.</p>

      <p style="margin-top: 8px;"><span style="color: #4CAF50; font-weight: bold;">Mencari Pemenang (Juara Ideal):</span><br>
      Abaikan gelembung yang berwarna kemerahan atau kecil-kecil yang berada di pojok kiri bawah. 
      Carilah gelembung <strong>berwarna Hijau Terang berukuran Besar</strong>, yang posisinya paling merangsek maju ke arah <strong>Pojok Kanan Atas (↘️)</strong>. Itu dipastikan adalah tabel settingan parameter model terbaik milik Anda.</p>
    `;
    
    d1.classList.remove('hidden');
    d2.classList.remove('hidden');
    d3.classList.remove('hidden');
  } else {
    c2.style.display = '';
    c3.style.display = '';
    d1.classList.add('hidden');
    d2.classList.add('hidden');
    d3.classList.add('hidden');
    
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
}

function refreshDashboard() {
  const filtered = allExperiments.filter(e => selectedIds.has(e.id));
  const activeMetrics = getActiveMetricsList();

  const contentArea = document.getElementById('dashboard-content-area');
  const noSelection = document.getElementById('dashboard-no-selection');

  if (allExperiments.length === 0) {
    document.getElementById('dashboard-empty').classList.remove('hidden');
    document.getElementById('dashboard-main').classList.add('hidden');
    return;
  }

  document.getElementById('dashboard-empty').classList.add('hidden');
  document.getElementById('dashboard-main').classList.remove('hidden');

  if (filtered.length === 0 || activeMetrics.length === 0) {
    if (contentArea) contentArea.classList.add('hidden');
    if (noSelection) noSelection.classList.remove('hidden');
    return;
  }

  if (contentArea) contentArea.classList.remove('hidden');
  if (noSelection) noSelection.classList.add('hidden');

  updateSectionTitles();

  const labels = getActiveMetricLabels();
  renderTable(filtered, activeMetrics, labels);

  if (viewMode === 'lossacc') {
    renderLossBarChart(filtered);
    renderAccuracyBarChart(filtered);
    renderLossAccScatter(filtered);
  } else if (viewMode === 'correlation') {
    renderCorrelationDualAxis(filtered, activeMetrics, labels);
    renderCorrelationDualAxisLoss(filtered, activeMetrics, labels);
    renderCorrelationBubble(filtered, activeMetrics, labels);
  } else if (viewMode === 'similarity') {
    renderRadarChart(filtered, activeMetrics, labels);
    renderSimilarityMatrix(filtered, activeMetrics, labels);
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
      const displayVal = !isNaN(num) ? num.toFixed(4) : (rawVal || '—');
      
      const valSpan = document.createElement('span');
      valSpan.textContent = displayVal;
      td.appendChild(valSpan);

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
  const isSimilarity = viewMode === 'similarity';
  const targetId = isSimilarity ? 'line-chart' : 'radar-chart';
  const ctx = document.getElementById(targetId);
  
  if (isSimilarity) {
    if (lineChart) lineChart.destroy();
  } else {
    if (radarChart) radarChart.destroy();
  }

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

  const config = {
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
  };

  if (isSimilarity) {
    lineChart = new Chart(ctx, config);
  } else {
    radarChart = new Chart(ctx, config);
  }
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

// ─── Correlation Bubble Chart ──────────────────────────────

function renderCorrelationBubble(experiments, activeMetrics, labels) {
  const ctx = document.getElementById('bar-chart');
  if (barChart) barChart.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const c = getLAChartColors(isDark);

  // Fallback map if the user unchecked all metrics (will not happen due to empty state handling, but safe)
  if (activeMetrics.length === 0) activeMetrics = ['bleu_1'];

  const getMetricMax = (metric) => {
    if (metric === 'cider') return 10.0; // typical CIDEr max roughly 10
    if (metric === 'spice') return 1.0; 
    return 1.0; // BLEU, ROUGE, METEOR are 0-1
  };

  const calculateEvalScore = (exp) => {
    let sum = 0;
    let count = 0;
    activeMetrics.forEach(m => {
      const val = parseFloat(exp.results[m]);
      if (!isNaN(val)) {
        // Normalize val to 0-1 approx.
        const max = getMetricMax(m);
        sum += (val / max);
        count++;
      }
    });
    return count > 0 ? sum / count : 0;
  };

  const datasets = experiments.map(exp => {
    const origIdx = allExperiments.findIndex(e => e.id === exp.id);
    
    const loss = parseFloat(exp.results.loss) || 0;
    const acc = parseFloat(exp.results.accuracy) || 0;
    const evalScore = calculateEvalScore(exp);

    // Bubble radius inversely proportional to loss (smaller loss = bigger bubble, bounded 5..30)
    // Example: If loss varies 0.0 .. 2.0
    const maxExpectedLoss = 2.0;
    let radius = 25 - (loss / maxExpectedLoss * 20);
    radius = Math.max(5, Math.min(30, radius));

    // Color gradient based on loss (Low loss = Green, High loss = Red)
    // Using HSL: Hue 120 (Green) to Hue 0 (Red)
    const lossRatio = Math.min(1, Math.max(0, loss / 2.0)); 
    const hue = (1 - lossRatio) * 120; // 120=Green, 0=Red
    const bgCol = `hsla(${hue}, 70%, 50%, 0.6)`;
    const borderCol = `hsl(${hue}, 80%, 45%)`;

    return {
      label: exp.name,
      data: [{
        x: evalScore,
        y: acc,
        r: radius,
        _loss: loss // store for tooltip
      }],
      backgroundColor: bgCol,
      borderColor: borderCol,
      borderWidth: 2,
      hoverBackgroundColor: `hsla(${hue}, 80%, 60%, 0.8)`,
      hoverBorderWidth: 3,
    };
  });

  barChart = new Chart(ctx, {
    type: 'bubble',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: c.textColor,
            font: { family: 'Inter', size: 11 },
            usePointStyle: true,
            boxWidth: 10,
          }
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
              const pt = ctx.raw;
              return [
                ctx.dataset.label,
                `Evals (X): ${pt.x.toFixed(4)}`,
                `Accuracy (Y): ${pt.y.toFixed(4)}`,
                `Loss (Size/Color): ${pt._loss.toFixed(4)}`
              ];
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
            text: 'Normalized Evals Score (higher is better →)',
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
            text: 'Accuracy (higher is better ↑)',
            color: c.textColor,
            font: { family: 'Inter', size: 12, weight: '600' },
          },
          beginAtZero: true,
        },
      },
    },
  });
}

// ─── Dual-Axis Line (Evals vs Acc) ───────────────────────

function renderCorrelationDualAxis(experiments, activeMetrics, labels) {
  const ctx = document.getElementById('line-chart');
  if (lineChart) lineChart.destroy();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const c = getLAChartColors(isDark);
  
  if (activeMetrics.length === 0) activeMetrics = ['bleu_1'];

  const getMetricMax = (metric) => {
    if (metric === 'cider') return 10.0;
    if (metric === 'spice') return 1.0; 
    return 1.0;
  };
  
  const sorted = [...experiments].map(exp => {
    let sum = 0, count = 0;
    activeMetrics.forEach(m => {
      const val = parseFloat(exp.results[m]);
      if (!isNaN(val)) {
        sum += (val / getMetricMax(m));
        count++;
      }
    });
    return {
      name: exp.name,
      evalScore: count > 0 ? sum / count : 0,
      acc: parseFloat(exp.results.accuracy) || 0
    };
  }).sort((a, b) => a.evalScore - b.evalScore);

  lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sorted.map(s => s.name),
      datasets: [
        {
          label: 'Evals (avg/normalized)',
          data: sorted.map(s => s.evalScore),
          borderColor: CHART_COLORS[0],
          backgroundColor: CHART_COLORS[0] + '33',
          borderWidth: 2,
          yAxisID: 'y',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Accuracy',
          data: sorted.map(s => s.acc),
          borderColor: CHART_COLORS[1],
          backgroundColor: CHART_COLORS[1] + '33',
          borderWidth: 2,
          yAxisID: 'y1',
          tension: 0.3,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: c.textColor, font: { family: 'Inter', size: 11 } } },
        tooltip: {
           backgroundColor: c.tooltipBg, titleColor: c.tooltipTitle, bodyColor: c.tooltipBody,
           titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'Inter' },
        }
      },
      scales: {
        x: { ticks: { color: c.textColor, font: { family: 'Inter', size: 10 } } },
        y: {
          type: 'linear', display: true, position: 'left',
          grid: { color: c.gridColor },
          ticks: { color: c.textColor, font: { family: 'Inter', size: 11 } },
          title: { display: true, text: 'Evals', color: c.textColor, font: { family: 'Inter', weight: '600' } }
        },
        y1: {
          type: 'linear', display: true, position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: c.textColor, font: { family: 'Inter', size: 11 } },
          title: { display: true, text: 'Accuracy', color: c.textColor, font: { family: 'Inter', weight: '600' } }
        }
      }
    }
  });
}

// ─── Dual-Axis Line (Evals vs Loss) ───────────────────────

function renderCorrelationDualAxisLoss(experiments, activeMetrics, labels) {
  const ctx = document.getElementById('radar-chart');
  if (radarChart) radarChart.destroy();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const c = getLAChartColors(isDark);
  
  if (activeMetrics.length === 0) activeMetrics = ['bleu_1'];

  const getMetricMax = (metric) => {
    if (metric === 'cider') return 10.0;
    if (metric === 'spice') return 1.0; 
    return 1.0;
  };
  
  const sorted = [...experiments].map(exp => {
    let sum = 0, count = 0;
    activeMetrics.forEach(m => {
      const val = parseFloat(exp.results[m]);
      if (!isNaN(val)) {
        sum += (val / getMetricMax(m));
        count++;
      }
    });
    return {
      name: exp.name,
      evalScore: count > 0 ? sum / count : 0,
      loss: parseFloat(exp.results.loss) || 0
    };
  }).sort((a, b) => a.evalScore - b.evalScore);

  radarChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sorted.map(s => s.name),
      datasets: [
        {
          label: 'Evals (avg/normalized)',
          data: sorted.map(s => s.evalScore),
          borderColor: CHART_COLORS[0],
          backgroundColor: CHART_COLORS[0] + '33',
          borderWidth: 2,
          yAxisID: 'y',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Loss',
          data: sorted.map(s => s.loss),
          borderColor: '#f56565', // Red strictly for Loss to distinguish
          backgroundColor: '#f5656533',
          borderWidth: 2,
          yAxisID: 'y1',
          tension: 0.3,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: c.textColor, font: { family: 'Inter', size: 11 } } },
        tooltip: {
           backgroundColor: c.tooltipBg, titleColor: c.tooltipTitle, bodyColor: c.tooltipBody,
           titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'Inter' },
        }
      },
      scales: {
        x: { ticks: { color: c.textColor, font: { family: 'Inter', size: 10 } } },
        y: {
          type: 'linear', display: true, position: 'left',
          grid: { color: c.gridColor },
          ticks: { color: c.textColor, font: { family: 'Inter', size: 11 } },
          title: { display: true, text: 'Evals (Higher is Better)', color: c.textColor, font: { family: 'Inter', weight: '600' } }
        },
        y1: {
          type: 'linear', display: true, position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: c.textColor, font: { family: 'Inter', size: 11 } },
          title: { display: true, text: 'Loss', color: c.textColor, font: { family: 'Inter', weight: '600' } }
        }
      }
    }
  });
}

// ─── Similarity Heatmap Matrix ───────────────────────────

function renderSimilarityMatrix(experiments, activeMetrics, labels) {
  const ctx = document.getElementById('radar-chart');
  if (radarChart) radarChart.destroy();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const c = getLAChartColors(isDark);
  
  const cols = ['accuracy', 'loss', ...activeMetrics];
  
  // Create normalized vector for each experiment
  const getMetricMax = (metric) => {
    if (metric === 'cider') return 10.0;
    if (metric === 'spice') return 1.0;
    if (metric === 'loss') {
        const mx = Math.max(...experiments.map(e => parseFloat(e.results.loss) || 0));
        return mx > 0 ? mx : 1.0;
    }
    return 1.0; 
  };
  
  const lossMax = getMetricMax('loss');
  
  const vectors = experiments.map(exp => {
    return cols.map(col => {
      if (col === 'loss') {
        const lossVal = parseFloat(exp.results.loss) || 0;
        return Math.max(0, 1 - (lossVal / lossMax)); // Inverted loss
      } else {
        const val = parseFloat(exp.results[col]) || 0;
        return val / getMetricMax(col);
      }
    });
  });

  // Calculate Cosine Similarity between vector A and vector B
  const cosineSim = (vecA, vecB) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  const expNames = experiments.map(e => e.name);
  const datasets = [];
  
  expNames.forEach((nameY, yIdx) => {
    expNames.forEach((nameX, xIdx) => {
      const sim = cosineSim(vectors[yIdx], vectors[xIdx]);
      
      const hue = ((sim - 0.5) * 2) * 120; // 0.5 to 1.0 maps to 0 to 120 (green)
      const clampedHue = Math.max(0, Math.min(120, hue));
      const saturation = 100;
      const lightness = isDark ? (sim > 0.9 ? 45 : 30) : (sim > 0.9 ? 65 : 85); 
      const bgCol = `hsla(${clampedHue}, ${saturation}%, ${lightness}%, 0.95)`;
      
      datasets.push({
        label: `${nameY} vs ${nameX}`,
        data: [{ x: xIdx, y: yIdx, r: 18, _sim: sim, _expY: nameY, _expX: nameX }],
        backgroundColor: bgCol,
        borderColor: isDark ? '#1a202c' : '#ffffff',
        borderWidth: 2,
      });
    });
  });

  radarChart = new Chart(ctx, {
    type: 'bubble',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      elements: { point: { pointStyle: 'rectRounded' } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.tooltipBg, titleColor: c.tooltipTitle, bodyColor: c.tooltipBody,
          callbacks: {
            label: (ctx) => {
              const pt = ctx.raw;
              return `${pt._expY} >< ${pt._expX}: ${(pt._sim * 100).toFixed(2)}% Mirip`;
            }
          }
        }
      },
      scales: {
        x: {
          min: -0.5, max: expNames.length - 0.5,
          grid: { display: false },
          ticks: {
            stepSize: 1,
            callback: (val) => expNames[val],
            color: c.textColor, font: { family:'Inter', size:11, weight: '600' },
            maxRotation: 45,
            minRotation: 45
          }
        },
        y: {
          min: -0.5, max: expNames.length - 0.5,
          grid: { display: false },
          ticks: {
            stepSize: 1,
            callback: (val) => expNames[val],
            color: c.textColor, font: { family:'Inter', size:11, weight: '600' }
          }
        }
      }
    }
  });
}

// ─── Baseline Comparison View ──────────────────────────────

let baselineBarChart = null;
const JOURNAL_BASELINE = {
  name: 'Jurnal Referensi',
  results: {
    bleu_1: 0.492,
    bleu_2: 0.296,
    bleu_3: 0.174,
    bleu_4: 0.101,
    meteor: 0.163,
    cider: 0.39,
    rouge_l: 0.358,
    spice: 0.108
  }
};

function renderBaselineComparison(experiments) {
  // Apply mode filter (top3 or by-group)
  const filtered = getBaselineExperiments(experiments);
  const getMetricMax = (metric) => {
    if (metric === 'cider') return 10.0;
    if (metric === 'spice') return 1.0;
    return 1.0; 
  };

  // 1. Calculate top 3 experiments based on average score of METRICS
  const scoredExps = filtered.map(exp => {
    let sum = 0;
    let count = 0;
    METRICS.forEach(m => {
      const val = parseFloat(exp.results[m]);
      if (!isNaN(val)) {
        sum += (val / getMetricMax(m));
        count++;
      }
    });
    return { ...exp, evalScore: count > 0 ? sum / count : 0 };
  });

  scoredExps.sort((a, b) => b.evalScore - a.evalScore);
  const top3 = scoredExps.slice(0, 3);
  
  // 2. Determine which metrics we actually have in the top 3
  const activeMetrics = METRICS.filter(m => 
    top3.some(e => e.results[m] !== undefined && e.results[m] !== null)
  );

  renderBaselineTable(top3, activeMetrics);
  renderBaselineChart(top3, activeMetrics);
  renderBaselineLineChart(top3, activeMetrics);
}

function renderBaselineTable(top3, metrics) {
  const theadTr = document.getElementById('baseline-thead-tr');
  const tbody = document.getElementById('baseline-tbody');
  
  theadTr.innerHTML = '';
  tbody.innerHTML = '';

  // Header row
  const thBlank = document.createElement('th');
  thBlank.textContent = 'Metric';
  theadTr.appendChild(thBlank);

  const thBase = document.createElement('th');
  thBase.textContent = JOURNAL_BASELINE.name;
  theadTr.appendChild(thBase);

  top3.forEach((exp, i) => {
    const th = document.createElement('th');
    th.textContent = exp.name + (i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : ' 🥉');
    theadTr.appendChild(th);
  });

  // Body rows
  metrics.forEach(m => {
    const tr = document.createElement('tr');
    
    // Metric Name
    const tdName = document.createElement('td');
    tdName.style.fontWeight = 'bold';
    tdName.textContent = METRIC_LABELS[m];
    tr.appendChild(tdName);

    // Baseline value
    const baseVal = JOURNAL_BASELINE.results[m] || 0;
    const tdBase = document.createElement('td');
    tdBase.textContent = baseVal.toFixed(4);
    tr.appendChild(tdBase);

    // Top 3 comparison cell
    top3.forEach(exp => {
      const val = parseFloat(exp.results[m]) || 0;
      const diffInfo = calculateDiff(val, baseVal);
      
      const td = document.createElement('td');
      
      const valSpan = document.createElement('span');
      valSpan.className = 'baseline-val';
      valSpan.textContent = val.toFixed(4);
      td.appendChild(valSpan);

      const diffSpan = document.createElement('span');
      diffSpan.style.marginLeft = '8px';
      diffSpan.style.fontSize = '11px';
      
      if (diffInfo.diff > 0.0001) {
        diffSpan.className = 'diff-positive';
        diffSpan.textContent = `(+${diffInfo.diff.toFixed(4)} | +${diffInfo.pct}%)`;
      } else if (diffInfo.diff < -0.0001) {
        diffSpan.className = 'diff-negative';
        diffSpan.textContent = `(${diffInfo.diff.toFixed(4)} | ${diffInfo.pct}%)`;
      } else {
        diffSpan.className = 'diff-neutral';
        diffSpan.textContent = `(0.0000 | 0.00%)`;
      }
      
      td.appendChild(diffSpan);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

function calculateDiff(val, base) {
  const diff = val - base;
  if (base === 0) return { diff, pct: (diff > 0 ? 100 : 0).toFixed(2) };
  const pct = (diff / base) * 100;
  return { diff, pct: pct.toFixed(2) };
}

function renderBaselineChart(top3, metrics) {
  const ctx = document.getElementById('baseline-bar-chart');
  if (baselineBarChart) baselineBarChart.destroy();
  
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? '#94a3b8' : '#475569';

  const datasets = [];
  
  // Baseline Dataset
  datasets.push({
    label: JOURNAL_BASELINE.name,
    data: metrics.map(m => JOURNAL_BASELINE.results[m] || 0),
    backgroundColor: isDark ? 'rgba(156, 163, 175, 0.4)' : 'rgba(107, 114, 128, 0.4)',
    borderColor: isDark ? '#9ca3af' : '#6b7280',
    borderWidth: 1,
    borderRadius: 4
  });

  // Top 3 Datasets
  top3.forEach((exp, idx) => {
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    datasets.push({
      label: exp.name,
      data: metrics.map(m => parseFloat(exp.results[m]) || 0),
      backgroundColor: color + 'CC',
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4
    });
  });

  baselineBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: metrics.map(m => METRIC_LABELS[m]),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: textColor, font: { family: 'Inter', size: 12 } }
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(24,27,37,0.95)' : 'rgba(255,255,255,0.95)',
          titleColor: isDark ? '#e2e8f0' : '#1e293b',
          bodyColor: isDark ? '#94a3b8' : '#475569',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1, padding: 12, cornerRadius: 8,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter' },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { family: 'Inter', size: 11 } },
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

function renderBaselineLineChart(top3, metrics) {
  const ctx = document.getElementById('baseline-line-chart');
  // Need global ref to destroy re-renders
  if (window.baselineLineChartInst) window.baselineLineChartInst.destroy();
  
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? '#94a3b8' : '#475569';

  const datasets = [];
  
  // Baseline Dataset
  datasets.push({
    label: JOURNAL_BASELINE.name,
    data: metrics.map(m => (JOURNAL_BASELINE.results[m] || 0) * 100), // Scale to percentage for visual contrast initially 
    borderColor: isDark ? '#9ca3af' : '#6b7280',
    backgroundColor: 'transparent',
    borderWidth: 3,
    borderDash: [5, 5],
    pointRadius: 6,
    pointBackgroundColor: isDark ? '#4b5563' : '#9ca3af',
  });

  // Top 3 Datasets
  top3.forEach((exp, idx) => {
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    datasets.push({
      label: exp.name,
      data: metrics.map(m => (parseFloat(exp.results[m]) || 0) * 100), // percentage scale
      borderColor: color,
      backgroundColor: color + '20',
      borderWidth: 2.5,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: isDark ? '#1a1b2e' : '#ffffff',
      pointBorderColor: color,
      pointBorderWidth: 2,
      tension: 0.3,
      fill: true
    });
  });

  window.baselineLineChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: metrics.map(m => METRIC_LABELS[m]),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: textColor, font: { family: 'Inter', size: 12 }, usePointStyle: true }
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(24,27,37,0.95)' : 'rgba(255,255,255,0.95)',
          titleColor: isDark ? '#e2e8f0' : '#1e293b',
          bodyColor: isDark ? '#94a3b8' : '#475569',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1, padding: 12, cornerRadius: 8,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter' },
          callbacks: {
             label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y / 100).toFixed(4)}`
          }
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { family: 'Inter', size: 11 } },
        },
        y: {
          grid: { color: gridColor },
          ticks: { 
            color: textColor, font: { family: 'Inter', size: 11 },
            callback: (val) => (val / 100).toFixed(2)
          },
          beginAtZero: true,
        },
      },
    },
  });
}

// ─── Empirical Margin Analysis View ─────────────────────

function renderSignificanceView(experiments) {
  // Apply mode filter (top3 or by-group)
  const filtered = getSigExperiments(experiments);

  const cardsContainer = document.getElementById('sig-cards-container');
  const theadTr = document.getElementById('sig-thead-tr');
  const tbody = document.getElementById('sig-tbody');

  cardsContainer.innerHTML = '';
  theadTr.innerHTML = '';
  tbody.innerHTML = '';

  // 1. Identify Top 3 Models again (similar to baseline)
  const getMetricMax = (metric) => {
    if (metric === 'cider') return 10.0;
    if (metric === 'spice') return 1.0;
    return 1.0; 
  };

  const scoredExps = filtered.map(exp => {
    let sum = 0;
    let count = 0;
    METRICS.forEach(m => {
      const val = parseFloat(exp.results[m]);
      if (!isNaN(val)) {
        sum += (val / getMetricMax(m));
        count++;
      }
    });
    return { ...exp, evalScore: count > 0 ? sum / count : 0 };
  });

  scoredExps.sort((a, b) => b.evalScore - a.evalScore);
  const top3 = scoredExps.slice(0, 3);
  
  const activeMetrics = METRICS.filter(m => 
    top3.some(e => e.results[m] !== undefined && e.results[m] !== null)
  );

  // 2. Define Significance Thresholds (Heuristics)
  // General rule: > 0.015 absolute diff is considered superior for typical NLP metrics 0-1 range
  const isSuperior = (val, base) => (val - base) > 0.015;
  const isInferior = (val, base) => (val - base) < -0.015;
  
  // 3. Evaluate each Top 3 Model
  const evaluations = top3.map(exp => {
    let superiorCount = 0;
    let inferiorCount = 0;
    let tieCount = 0;

    const metricResults = {}; // metric => status string

    activeMetrics.forEach(m => {
      const val = parseFloat(exp.results[m]) || 0;
      const baseVal = JOURNAL_BASELINE.results[m] || 0;
      
      if (isSuperior(val, baseVal)) {
        superiorCount++;
        metricResults[m] = '🟢 Superior';
      } else if (isInferior(val, baseVal)) {
        inferiorCount++;
        metricResults[m] = '🔴 Inferior';
      } else {
        tieCount++;
        metricResults[m] = '🟡 Marginal';
      }
    });

    return { exp, superiorCount, inferiorCount, tieCount, metricResults };
  });

  // 4. Render 3 Summary Cards
  evaluations.forEach((evalData, idx) => {
    const isWin = evalData.superiorCount > evalData.inferiorCount;
    const card = document.createElement('div');
    card.className = 'sig-card';
    
    // Medal logic
    let medal = '🥉';
    if (idx === 0) medal = '🥇';
    if (idx === 1) medal = '🥈';

    card.innerHTML = `
      <div class="sig-card-header">
        <div class="sig-card-title">${medal} ${evalData.exp.name}</div>
        <div style="font-size: 20px;">${isWin ? '🏆' : '⚖️'}</div>
      </div>
      <div class="sig-score">${evalData.superiorCount} <span style="font-size: 16px; color: var(--text-muted); font-weight: normal;">/ ${activeMetrics.length} Metrics</span></div>
      <div class="sig-score-desc">
        Model ini terbukti secara empiris <strong>Superior</strong> (Melampaui margin +0.015) pada ${evalData.superiorCount} metrik melawan Jurnal Referensi.<br><br>
        Tie: ${evalData.tieCount} | Inferior: ${evalData.inferiorCount}
      </div>
    `;
    cardsContainer.appendChild(card);
  });

  // 5. Render Proxy Confidence Matrix
  // Header
  const thBlank = document.createElement('th');
  thBlank.textContent = 'Evaluation Metric';
  thBlank.style.textAlign = 'left';
  theadTr.appendChild(thBlank);

  evaluations.forEach(evalData => {
    const th = document.createElement('th');
    th.textContent = evalData.exp.name;
    theadTr.appendChild(th);
  });

  // Rows
  activeMetrics.forEach(m => {
    const tr = document.createElement('tr');
    
    const tdName = document.createElement('td');
    tdName.style.fontWeight = 'bold';
    tdName.style.textAlign = 'left';
    tdName.textContent = METRIC_LABELS[m];
    tr.appendChild(tdName);

    evaluations.forEach(evalData => {
      const td = document.createElement('td');
      const status = evalData.metricResults[m];
      td.textContent = status;
      
      if (status.includes('Superior')) {
        td.style.color = '#10b981'; // emerald
        td.style.fontWeight = '700';
      } else if (status.includes('Inferior')) {
        td.style.color = '#ef4444'; // red
      } else {
        td.style.color = 'var(--text-muted)';
      }
      
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// ─── Baseline – Settings Panel ──────────────────────────

function renderBaselineSettings() {
  const select = document.getElementById('baseline-group-select');
  if (!select) return;

  // Populate group dropdown
  select.innerHTML = '<option value="">— Pilih Grup —</option>';
  allGroups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    select.appendChild(opt);
  });

  // Wire radio buttons
  document.querySelectorAll('input[name="baseline-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isGroup = radio.value === 'group';
      select.classList.toggle('hidden', !isGroup);
      if (!isGroup) renderBaselineComparison(allExperiments);
    });
  });

  select.addEventListener('change', () => {
    renderBaselineComparison(allExperiments);
  });
}

// ─── Sig – Settings Panel ────────────────────────────────

function renderSigSettings() {
  const select = document.getElementById('sig-group-select');
  if (!select) return;

  select.innerHTML = '<option value="">— Pilih Grup —</option>';
  allGroups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    select.appendChild(opt);
  });

  document.querySelectorAll('input[name="sig-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isGroup = radio.value === 'group';
      select.classList.toggle('hidden', !isGroup);
      if (!isGroup) renderSignificanceView(allExperiments);
    });
  });

  select.addEventListener('change', () => {
    renderSignificanceView(allExperiments);
  });
}

// ─── Helper: get experiments for baseline/sig view ───────

function getBaselineExperiments(allExps) {
  const modeEl = document.querySelector('input[name="baseline-mode"]:checked');
  const mode = modeEl ? modeEl.value : 'top3';
  if (mode === 'group') {
    const gid = document.getElementById('baseline-group-select')?.value;
    if (gid) return allExps.filter(e => e.groupId === gid);
  }
  return allExps;
}

function getSigExperiments(allExps) {
  const modeEl = document.querySelector('input[name="sig-mode"]:checked');
  const mode = modeEl ? modeEl.value : 'top3';
  if (mode === 'group') {
    const gid = document.getElementById('sig-group-select')?.value;
    if (gid) return allExps.filter(e => e.groupId === gid);
  }
  return allExps;
}

// ─── Group Comparison Page ───────────────────────────────

function renderGroupCompare() {
  const picker = document.getElementById('gc-picker');
  const content = document.getElementById('gc-content');
  const empty = document.getElementById('gc-empty');
  if (!picker) return;

  // Fresh groups from localStorage each time
  let liveGroups = allGroups;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.groups)) {
        liveGroups = parsed.groups;
        // Also refresh allGroups
        allGroups = liveGroups;
      }
    }
  } catch {}

  let selectedGroupIds = new Set();

  function rebuildCharts() {
    const chosen = liveGroups.filter(g => selectedGroupIds.has(g.id));
    if (chosen.length < 2) {
      content.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }
    content.classList.remove('hidden');
    empty.classList.add('hidden');

    // Active eval metrics (all of METRICS)
    const activeMetrics = METRICS;

    const selectedExperiments = allExperiments.filter(
      e => selectedGroupIds.has(e.groupId) && e.results && Object.keys(e.results).length > 0
    );

    renderGCPodium(selectedExperiments, activeMetrics, liveGroups);
    renderGCBar(selectedExperiments, activeMetrics, liveGroups);
    renderGCLine(selectedExperiments, activeMetrics, liveGroups);
    renderGCTable(selectedExperiments, activeMetrics, liveGroups);
  }

  // Build picker checkboxes
  picker.innerHTML = '';
  if (liveGroups.length === 0) {
    picker.innerHTML = '<p style="color:var(--text-muted);padding:12px">Belum ada grup. Buat grup di halaman tree terlebih dahulu.</p>';
    content.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'gc-picker-grid';
  liveGroups.forEach(g => {
    const label = document.createElement('label');
    label.className = 'gc-picker-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = g.id;
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (selectedGroupIds.size >= 4) { cb.checked = false; return; }
        selectedGroupIds.add(g.id);
      } else {
        selectedGroupIds.delete(g.id);
      }
      rebuildCharts();
    });
    const dot = document.createElement('span');
    dot.className = 'gc-color-dot';
    dot.style.background = g.color;
    const name = document.createElement('span');
    name.textContent = g.name;
    label.appendChild(cb);
    label.appendChild(dot);
    label.appendChild(name);
    grid.appendChild(label);
  });
  picker.appendChild(grid);

  rebuildCharts();
}

function renderGCLine(experiments, metrics, groups) {
  const ctx = document.getElementById('gc-line-chart');
  if (gcLineChart) gcLineChart.destroy();
  if (!ctx) return;

  const groupMap = new Map((groups || []).map(g => [g.id, g]));
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? '#94a3b8' : '#475569';

  gcLineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: metrics.map(m => METRIC_LABELS[m]),
      datasets: experiments.map((exp, idx) => {
        const group = groupMap.get(exp.groupId);
        const color = group?.color || CHART_COLORS[idx % CHART_COLORS.length];
        return {
          label: `${exp.name} [${group?.name || 'Tanpa Grup'}]`,
          data: metrics.map(m => parseFloat(exp.results[m]) || 0),
          borderColor: color,
          backgroundColor: color + '22',
          borderWidth: 2.5,
          pointRadius: 4.5,
          pointHoverRadius: 6,
          pointBackgroundColor: color,
          pointBorderColor: isDark ? '#1a1b2e' : '#ffffff',
          pointBorderWidth: 2,
          tension: 0.3,
          fill: false,
        };
      }),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Inter', size: 12 }, usePointStyle: true } },
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Inter', size: 11 } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Inter', size: 11 } }, beginAtZero: true },
      },
    },
  });
}

function renderGCBar(experiments, metrics, groups) {
  const ctx = document.getElementById('gc-bar-chart');
  if (gcBarChart) gcBarChart.destroy();
  if (!ctx) return;

  const groupMap = new Map((groups || []).map(g => [g.id, g]));
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? '#94a3b8' : '#475569';

  gcBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: metrics.map(m => METRIC_LABELS[m]),
      datasets: experiments.map((exp, idx) => {
        const group = groupMap.get(exp.groupId);
        const color = group?.color || CHART_COLORS[idx % CHART_COLORS.length];
        return {
          label: `${exp.name} [${group?.name || 'Tanpa Grup'}]`,
          data: metrics.map(m => parseFloat(exp.results[m]) || 0),
          backgroundColor: color + 'CC',
          borderColor: color,
          borderWidth: 1.5,
          borderRadius: 4,
        };
      }),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Inter', size: 12 }, usePointStyle: true } },
        tooltip: {
          backgroundColor: isDark ? 'rgba(24,27,37,0.95)' : 'rgba(255,255,255,0.95)',
          titleColor: isDark ? '#e2e8f0' : '#1e293b',
          bodyColor: isDark ? '#94a3b8' : '#475569',
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(4)}` },
        },
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family:'Inter', size:11 } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family:'Inter', size:11 } }, beginAtZero: true },
      },
    },
  });
}

function renderGCPodium(experiments, metrics, groups) {
  const podium = document.getElementById('gc-podium');
  if (!podium) return;

  if (!Array.isArray(experiments) || experiments.length === 0) {
    podium.innerHTML = '';
    return;
  }

  const groupMap = new Map((groups || []).map(g => [g.id, g]));
  const rankings = {};
  metrics.forEach((metric) => {
    const sorted = experiments
      .map((exp, idx) => ({ idx, val: parseFloat(exp.results[metric]) || 0 }))
      .sort((a, b) => LOWER_IS_BETTER.has(metric) ? a.val - b.val : b.val - a.val);
    rankings[metric] = {};
    sorted.forEach((entry, rank) => { rankings[metric][entry.idx] = rank; });
  });

  const overall = experiments.map((exp, idx) => {
    let totalRank = 0;
    metrics.forEach((metric) => { totalRank += rankings[metric][idx] || 0; });
    const avgRank = metrics.length > 0 ? totalRank / metrics.length : 0;
    const group = groupMap.get(exp.groupId);
    return {
      exp,
      group,
      avgRank,
      aggregateScore: metrics.length > 0
        ? metrics.reduce((sum, metric) => sum + (parseFloat(exp.results[metric]) || 0), 0) / metrics.length
        : 0,
    };
  }).sort((a, b) => a.avgRank - b.avgRank);

  const medals = ['🥇', '🥈', '🥉'];
  const titles = ['Juara 1', 'Juara 2', 'Juara 3'];
  const top = overall.slice(0, Math.min(3, overall.length));

  podium.innerHTML = top.map((entry, idx) => `
    <article class="gc-podium-card gc-podium-${idx + 1}">
      <div class="gc-podium-head">
        <div class="gc-podium-title">${medals[idx]} ${titles[idx]}</div>
        <span class="gc-podium-dot" style="background:${entry.group?.color || '#64748b'}"></span>
      </div>
      <div class="gc-podium-name">${entry.exp.name}</div>
      <div class="gc-podium-meta">
        <span>Grup: <strong>${entry.group?.name || 'Tanpa Grup'}</strong></span>
        <span>Skor agregat: <strong>${entry.aggregateScore.toFixed(4)}</strong></span>
        <span>Rata-rata rank: <strong>${entry.avgRank.toFixed(2)}</strong></span>
      </div>
    </article>
  `).join('');
}

function renderGCTable(experiments, metrics, groups) {
  const theadTr = document.getElementById('gc-thead-tr');
  const tbody = document.getElementById('gc-tbody');
  theadTr.innerHTML = '';
  tbody.innerHTML = '';

  theadTr.innerHTML = `
    <th class="rank-col">#</th>
    <th>Node</th>
    ${metrics.map(m => `<th>${METRIC_LABELS[m]}</th>`).join('')}
  `;

  if (!Array.isArray(experiments) || experiments.length === 0) return;

  const groupMap = new Map((groups || []).map(g => [g.id, g]));

  const rankings = {};
  metrics.forEach((metric) => {
    const sorted = experiments
      .map((exp, idx) => ({ idx, val: parseFloat(exp.results[metric]) || 0 }))
      .sort((a, b) => LOWER_IS_BETTER.has(metric) ? a.val - b.val : b.val - a.val);
    rankings[metric] = {};
    sorted.forEach((entry, rank) => { rankings[metric][entry.idx] = rank; });
  });

  const overallScores = experiments.map((_, idx) => {
    let totalRank = 0;
    metrics.forEach((metric) => { totalRank += rankings[metric][idx] || 0; });
    return { idx, avgRank: totalRank / metrics.length };
  }).sort((a, b) => a.avgRank - b.avgRank);

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

    const group = groupMap.get(exp.groupId);
    const groupColor = group?.color || '#64748b';
    const groupName = group?.name || 'Tanpa Grup';

    const nameTd = document.createElement('td');
    nameTd.className = 'exp-name gc-node-name';
    nameTd.innerHTML = `
      <span class="gc-node-title">${exp.name}</span>
      <span class="gc-group-tag" style="border-color:${groupColor}; background:${groupColor}22;">${groupName}</span>
    `;
    tr.appendChild(nameTd);

    metrics.forEach((metric) => {
      const td = document.createElement('td');
      const rawVal = exp.results[metric];
      const num = parseFloat(rawVal);
      const valueSpan = document.createElement('span');
      valueSpan.textContent = !isNaN(num) ? num.toFixed(4) : (rawVal || '—');
      td.appendChild(valueSpan);

      const metricRank = rankings[metric][idx];
      if (metricRank === 0) td.classList.add('metric-best');
      else if (metricRank === 1) td.classList.add('metric-second');
      else if (metricRank === 2) td.classList.add('metric-third');

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}
