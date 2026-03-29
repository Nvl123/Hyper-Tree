import { state, initExperiments, loadFromFile } from './state.js';

export function initTheme() {
  const saved = localStorage.getItem('hypertree_theme') || 'dark';
  applyTheme(saved);
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('hypertree_theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.innerHTML = theme === 'dark'
      ? '<span class="btn-icon">☀️</span> Light'
      : '<span class="btn-icon">🌙</span> Dark';
  }
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
  if (state.onRefresh) state.onRefresh();
}

export function setupSidebar(switchPageCallback) {
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.getElementById('app-sidebar');
  const btnExplore = document.getElementById('nav-explore');
  const btnBaseline = document.getElementById('nav-baseline');
  const btnSignificance = document.getElementById('nav-significance');
  const btnGroupCompare = document.getElementById('nav-group-compare');

  // Toggle Sidebar
  toggleBtn.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  const btnMap = {
    explore: btnExplore,
    baseline: btnBaseline,
    significance: btnSignificance,
    'group-compare': btnGroupCompare,
  };

  const handleClick = (page) => {
    // UI update
    Object.keys(btnMap).forEach(p => {
      btnMap[p].classList.toggle('active', p === page);
    });
    
    if (window.innerWidth <= 768) sidebar.classList.remove('mobile-open');
    
    // Page switch
    switchPageCallback(page);
  };

  btnExplore.addEventListener('click', () => handleClick('explore'));
  btnBaseline.addEventListener('click', () => handleClick('baseline'));
  btnSignificance.addEventListener('click', () => handleClick('significance'));
  btnGroupCompare.addEventListener('click', () => handleClick('group-compare'));
}

export function setupToolbar(toggleViewModeCallback) {
  const backBtn = document.getElementById('btn-back');
  if (backBtn && state.STORAGE_NAMESPACE) {
    backBtn.href = `/?ws=${encodeURIComponent(state.STORAGE_NAMESPACE)}`;
  }

  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  document.getElementById('btn-open-file').addEventListener('click', async () => {
    const data = await loadFromFile();
    if (data) {
      initExperiments(data);
    }
  });

  const lossAccBtn = document.getElementById('btn-loss-acc');
  const corrBtn = document.getElementById('btn-correlation');
  const simBtn = document.getElementById('btn-similarity');

  const btns = [lossAccBtn, corrBtn, simBtn];

  const handleToggle = (btn, mode) => {
    const isActivating = state.viewMode !== mode;
    state.viewMode = isActivating ? mode : 'eval';
    
    // Update UI
    btns.forEach(b => b.classList.remove('active'));
    if (isActivating) btn.classList.add('active');
    
    toggleViewModeCallback(state.viewMode);
  };

  lossAccBtn.addEventListener('click', () => handleToggle(lossAccBtn, 'lossacc'));
  corrBtn.addEventListener('click', () => handleToggle(corrBtn, 'correlation'));
  simBtn.addEventListener('click', () => handleToggle(simBtn, 'similarity'));

  // Page transition helper
  document.querySelectorAll('a.toolbar-btn').forEach((link) => {
    link.addEventListener('click', (e) => {
      if (link.id === 'btn-back') {
        e.preventDefault();
        const href = link.getAttribute('href');
        document.body.classList.add('page-exit');
        setTimeout(() => { window.location.href = href; }, 250);
      }
    });
  });
}
