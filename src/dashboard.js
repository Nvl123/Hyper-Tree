import './dashboard.css';
import { state, loadFromLocalStorage } from './dashboard/state.js';
import { setStorageNamespace } from './store.js';
import { initTheme, setupSidebar, setupToolbar } from './dashboard/ui.js';
import { buildFilters } from './dashboard/filters.js';
import { renderExploreView } from './dashboard/views/explore.js';
import { renderBaselineView } from './dashboard/views/baseline.js';
import { renderSignificanceView } from './dashboard/views/significance.js';
import { renderGroupCompareView } from './dashboard/views/group-compare.js';

/**
 * HyperTree Dashboard - Main Bootstrapper
 */

// 1. Initialize Global UI state
initTheme();

// 2. Setup Navigation and Toolbar
setupSidebar((page) => {
  state.activePage = page;
  refreshDashboard();
});

setupToolbar(() => {
  // Callback when view mode (eval/lossacc/etc) changes
  buildFilters();
  refreshDashboard();
});

// 3. Register state hooks for reactivity
state.onRefresh = refreshDashboard;
state.onBuildFilters = buildFilters;

// 4. Load initial data
// Ensure store uses the same storage namespace as dashboard state
setStorageNamespace(state.STORAGE_NAMESPACE);
loadFromLocalStorage();

/**
 * Main switch-board to determine what to render
 */
function refreshDashboard() {
  const mainContent = document.getElementById('dashboard-main');
  const emptyContent = document.getElementById('dashboard-empty');
  const baselineContent = document.getElementById('baseline-main');
  const significanceContent = document.getElementById('significance-main');
  const groupCompareContent = document.getElementById('group-compare-main');

  const allContents = [mainContent, emptyContent, baselineContent, significanceContent, groupCompareContent];
  allContents.forEach(c => {
    if (!c) return;
    c.style.display = 'none';
    c.classList.add('hidden');
  });

  if (!state.allExperiments || state.allExperiments.length === 0) {
    if (emptyContent) {
      emptyContent.style.display = 'block';
      emptyContent.classList.remove('hidden');
    }
    return;
  }

  // Determine active view
  switch (state.activePage) {
    case 'explore':
      if (mainContent) {
        mainContent.style.display = 'flex';
        mainContent.classList.remove('hidden');
      }
      renderExploreView();
      break;
    case 'baseline':
      if (baselineContent) {
        baselineContent.style.display = 'flex';
        baselineContent.classList.remove('hidden');
      }
      renderBaselineView();
      break;
    case 'significance':
      if (significanceContent) {
        significanceContent.style.display = 'flex';
        significanceContent.classList.remove('hidden');
      }
      renderSignificanceView();
      break;
    case 'group-compare':
      if (groupCompareContent) {
        groupCompareContent.style.display = 'flex';
        groupCompareContent.classList.remove('hidden');
      }
      renderGroupCompareView();
      break;
  }
}

// Global buildFilters call for initial layout
buildFilters();
refreshDashboard();
