import { METRICS, LOSS_ACC_METRICS } from './constants.js';
import { flattenNodes } from './utils.js';

const STORAGE_NAMESPACE = new URLSearchParams(window.location.search).get('ws') || '';
const STORAGE_KEY = STORAGE_NAMESPACE ? `hypertree_data_${STORAGE_NAMESPACE}` : 'hypertree_data';

export const state = {
  allExperiments: [],
  allGroups: [],
  selectedIds: new Set(),
  selectedMetrics: new Set(METRICS),
  selectedLAMetrics: new Set(LOSS_ACC_METRICS),
  sortMetric: '',
  sortDir: 'desc',
  viewMode: 'eval', // 'eval', 'lossacc', 'correlation', or 'similarity'
  activePage: 'explore', // 'explore', 'baseline', 'significance', 'group-compare'
  
  // Storage handle
  STORAGE_NAMESPACE,
  STORAGE_KEY,

  // Event callbacks
  onRefresh: null,
  onBuildFilters: null,
};

export function initExperiments(data) {
  const allNodes = flattenNodes(data.roots || []);
  console.log('[debug] allNodes count:', allNodes.length);
  if (allNodes.length > 0) {
    console.log('[debug] Sample node structure:', JSON.stringify(allNodes[0]).substring(0, 200));
    console.log('[debug] Sample node results:', allNodes[0].results);
  }
  state.allExperiments = allNodes.filter(n => {
    const hasRes = n.results && Object.keys(n.results).length > 0;
    return hasRes;
  });
  console.log('[debug] allExperiments count:', state.allExperiments.length);
  state.allGroups = Array.isArray(data.groups) ? data.groups : [];
  state.selectedIds = new Set(state.allExperiments.map(e => e.id));
  state.selectedMetrics = new Set(METRICS);
  console.log('[debug] selectedMetrics:', Array.from(state.selectedMetrics));
  if (state.allExperiments.length > 0) console.log('[debug] sample experiment results:', state.allExperiments[0].results);
  state.selectedLAMetrics = new Set(LOSS_ACC_METRICS);
  state.sortMetric = '';
  state.sortDir = 'desc';

  if (state.onBuildFilters) state.onBuildFilters();
  if (state.onRefresh) state.onRefresh();
}

export function loadFromLocalStorage() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    let data = raw ? JSON.parse(raw) : null;
    if (!data) {
      // Fallback to base key without namespace
      const baseKey = 'hypertree_data';
      const rawBase = localStorage.getItem(baseKey);
      data = rawBase ? JSON.parse(rawBase) : null;
    }
    if (!data || !Array.isArray(data.roots) || data.roots.length === 0) {
      // Fallback: try all namespaced workspace keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('hypertree_data_')) continue;
        const candidateRaw = localStorage.getItem(key);
        if (!candidateRaw) continue;
        try {
          const candidate = JSON.parse(candidateRaw);
          if (candidate && Array.isArray(candidate.roots) && candidate.roots.length > 0) {
            data = candidate;
            break;
          }
        } catch {
          // ignore invalid JSON entry
        }
      }
    }
    if (data && data.roots && data.roots.length > 0) {
      console.log('[debug] Found data in localStorage, initializing...');
      initExperiments(data);
    } else {
      console.log('[debug] No valid data found in localStorage for key:', STORAGE_KEY);
    }
  } catch (err) {
    console.error('Failed to load from localStorage', err);
  }
}

export function getTreeDataFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function loadFromFile() {
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
