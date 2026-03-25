import './style.css';
import {
  load, save, getRoots,
  createRootNode, createChildNode,
  updateNode, deleteNode, duplicateNode,
  exportToJSON, importFromJSON,
  getNode, getEffectiveParams, getAllNodes,
  getGroups, createGroup, deleteGroup, setNodeGroup
} from './store.js';
import { initCanvas, renderTree, panToNode } from './tree.js';
import { initModal, openEditModal, openUniquenessModal, openSimilarityModal } from './modal.js';
import { exportTreeAsPng, exportTreeAsCsv } from './export.js';
import { initSidebar } from './sidebar.js';

const compareState = {
  active: false,
  selectedIds: []
};

// ─── Initialize ──────────────────────────────────────────

load();
initCanvas();
initModal();
initSidebar();
initTheme();
initToolsMenu();
initCompareFeature();
initUniquenessCheck();
initSimilarityCheck();
render();

// ─── Toolbar ─────────────────────────────────────────────

document.getElementById('btn-add-root').addEventListener('click', () => {
  createRootNode();
  render();
});

document.getElementById('btn-export-csv').addEventListener('click', () => {
  exportTreeAsCsv();
});

document.getElementById('btn-export').addEventListener('click', () => {
  exportTreeAsPng();
});

document.getElementById('btn-manage-groups-fab').addEventListener('click', () => {
  openGroupPickerModal(null, render);
});

// File Save / Load
document.getElementById('btn-save-file').addEventListener('click', async () => {
  await exportToJSON();
});

document.getElementById('btn-open-file').addEventListener('click', async () => {
  const success = await importFromJSON();
  if (success) render();
});

// Search nodes
let searchMatches = [];
let searchIndex = -1;
let lastQuery = '';

function updateSearchUI() {
  const counter = document.getElementById('search-counter');
  const btnPrev = document.getElementById('btn-search-prev');
  const btnNext = document.getElementById('btn-search-next');
  const btnClear = document.getElementById('btn-search-clear');
  const input = document.getElementById('input-search-node');

  if (searchMatches.length > 0) {
    counter.textContent = `${searchIndex + 1}/${searchMatches.length}`;
    counter.classList.remove('hidden');
    btnPrev.classList.remove('hidden');
    btnNext.classList.remove('hidden');
  } else {
    counter.classList.add('hidden');
    btnPrev.classList.add('hidden');
    btnNext.classList.add('hidden');
  }

  if (btnClear && input) {
    if (input.value.trim() !== '') {
      btnClear.classList.remove('hidden');
    } else {
      btnClear.classList.add('hidden');
    }
  }
}

function handleSearchClear() {
  const input = document.getElementById('input-search-node');
  if (input) {
    input.value = '';
    input.style.borderColor = '';
  }
  searchMatches = [];
  searchIndex = -1;
  lastQuery = '';
  updateSearchUI();
}

function handleSearchNode() {
  const query = document.getElementById('input-search-node').value.trim().toLowerCase();
  if (!query) {
    searchMatches = [];
    searchIndex = -1;
    lastQuery = '';
    updateSearchUI();
    return;
  }

  if (query === lastQuery && searchMatches.length > 0) {
    handleSearchNext();
    return;
  }

  const roots = getRoots();
  const allNodes = [];

  function flattenNodes(nodes) {
    for (const node of nodes) {
      allNodes.push(node);
      if (node.children?.length) flattenNodes(node.children);
    }
  }
  flattenNodes(roots);

  searchMatches = allNodes.filter(n => {
    if (n.name.toLowerCase().includes(query)) return true;
    const params = getEffectiveParams(n.id) || {};
    return Object.entries(params).some(([k, v]) =>
      k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query)
    );
  });

  lastQuery = query;

  if (searchMatches.length > 0) {
    searchIndex = 0;
    panToNode(searchMatches[searchIndex].id);
    updateSearchUI();
  } else {
    searchIndex = -1;
    updateSearchUI();
    const input = document.getElementById('input-search-node');
    input.style.borderColor = 'var(--danger)';
    setTimeout(() => { input.style.borderColor = ''; }, 1000);
  }
}

function handleSearchNext() {
  if (searchMatches.length === 0) return;
  searchIndex = (searchIndex + 1) % searchMatches.length;
  panToNode(searchMatches[searchIndex].id);
  updateSearchUI();
}

function handleSearchPrev() {
  if (searchMatches.length === 0) return;
  searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
  panToNode(searchMatches[searchIndex].id);
  updateSearchUI();
}

const btnClearId = document.getElementById('btn-search-clear');
if (btnClearId) btnClearId.addEventListener('click', handleSearchClear);

document.getElementById('btn-search-node').addEventListener('click', handleSearchNode);
document.getElementById('btn-search-next').addEventListener('click', handleSearchNext);
document.getElementById('btn-search-prev').addEventListener('click', handleSearchPrev);

document.getElementById('input-search-node').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    handleSearchNode();
  } else {
    e.target.style.borderColor = '';
  }
});

document.getElementById('input-search-node').addEventListener('input', () => {
  updateSearchUI();
});

// Theme toggle
document.getElementById('btn-theme').addEventListener('click', () => {
  toggleTheme();
});

// Sidebar toggle (from toolbar)
const sidebarBtn = document.getElementById('btn-show-sidebar');
if (sidebarBtn) {
  const sidebar = document.getElementById('param-sidebar');
  if (!sidebar.classList.contains('collapsed')) {
    sidebarBtn.classList.add('active');
  }
  sidebarBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    sidebarBtn.classList.toggle('active', !sidebar.classList.contains('collapsed'));
  });
}

// Grid toggle
const gridBtn = document.getElementById('btn-toggle-grid');
if (gridBtn) {
  const canvasWrapper = document.getElementById('canvas-wrapper');
  const isGridOn = localStorage.getItem('hypertree_grid') === 'true';
  if (isGridOn) {
    canvasWrapper.classList.add('show-grid');
    gridBtn.classList.add('active');
  }
  gridBtn.addEventListener('click', () => {
    canvasWrapper.classList.toggle('show-grid');
    const isActive = canvasWrapper.classList.contains('show-grid');
    gridBtn.classList.toggle('active', isActive);
    localStorage.setItem('hypertree_grid', isActive);
  });
}

// ─── Smooth Page Transitions ─────────────────────────────
document.querySelectorAll('a.toolbar-btn').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const href = link.getAttribute('href');
    document.body.classList.add('page-exit');
    setTimeout(() => { window.location.href = href; }, 250);
  });
});

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
}

// ─── Tree actions ────────────────────────────────────────

async function handleAction(action, nodeId, extra) {
  switch (action) {
    case 'addChild':
      createChildNode(nodeId);
      render();
      break;

    case 'edit': {
      const result = await openEditModal(nodeId);
      if (result) {
        updateNode(nodeId, {
          name: result.name,
          overrides: result.overrides,
          results: result.results || {},
          secondaryParentIds: result.secondaryParentIds || [],
        });
        if (result.newParentId) {
          if (result.newParentId === '__root__') {
            const roots = getRoots();
            const nodeData = removeNode(nodeId, roots);
            if (nodeData) { roots.push(nodeData); save(); }
          } else {
            moveNodeTo(nodeId, result.newParentId);
          }
        }
        render();
      }
      break;
    }

    case 'delete':
      if (confirm('Delete this node and all its children?')) {
        deleteNode(nodeId);
        render();
      }
      break;

    case 'duplicate': {
      const originalSubtree = document.querySelector(`.subtree[data-node-id="${nodeId}"]`);
      let absoluteOpts = null;
      if (originalSubtree) {
        const isAbs = originalSubtree.style.position === 'absolute';
        const leftOffset = parseFloat(originalSubtree.style.left) || 0;
        const topOffset = parseFloat(originalSubtree.style.top) || 0;
        absoluteOpts = isAbs
          ? { x: leftOffset + 40, y: topOffset + 40 }
          : { x: originalSubtree.offsetLeft + leftOffset + 40, y: originalSubtree.offsetTop + topOffset + 40 };
      }
      duplicateNode(nodeId, absoluteOpts);
      render();
      break;
    }

    case 'toggle': {
      const node = getNode(nodeId);
      if (node) { node.collapsed = !node.collapsed; save(); render(); }
      break;
    }

    case 'setGroup':
      openGroupPickerModal(nodeId, render);
      break;

    case 'refresh':
      render();
      break;

    case 'move': {
      const targetId = extra;
      if (!targetId || nodeId === targetId) break;
      if (isDescendant(nodeId, targetId)) break;
      moveNodeTo(nodeId, targetId);
      render();
      break;
    }
  }
}

// ─── Group Picker Modal ──────────────────────────────────

function openGroupPickerModal(nodeId, onDone) {
  const node = nodeId ? getNode(nodeId) : null;
  if (nodeId && !node) return;

  // Remove any existing picker
  document.querySelector('.group-picker-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'group-picker-overlay';

  const modal = document.createElement('div');
  modal.className = 'group-picker-modal';
  
  const titleHtml = node 
    ? `<span>🏷️ Assign Group — <em>${node.name}</em></span>` 
    : `<span>🏷️ Manage Groups</span>`;

  modal.innerHTML = `
    <div class="group-picker-header">
      ${titleHtml}
      <button class="group-picker-close" title="Close">✕</button>
    </div>
    <div class="gpm-list" id="gpm-list"></div>
    <div class="gpm-create">
      <input type="text" id="gpm-new-name" placeholder="New group name…" maxlength="40" />
      <input type="color" id="gpm-new-color" value="#63b3ed" title="Group color" />
      <button id="gpm-create-btn">＋ Create</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => { overlay.remove(); onDone && onDone(); };
  modal.querySelector('.group-picker-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  function renderList() {
    const list = modal.querySelector('#gpm-list');
    list.innerHTML = '';
    const groups = getGroups();

    if (node) {
      // "No group" option
      const noGrp = document.createElement('div');
      noGrp.className = 'gpm-item' + (!node.groupId ? ' gpm-active' : '');
      noGrp.innerHTML = `<span class="gpm-dot" style="background:#555"></span><span>— No Group —</span>`;
      noGrp.addEventListener('click', () => { setNodeGroup(nodeId, null); close(); });
      list.appendChild(noGrp);
    }

    if (groups.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'gpm-empty';
      empty.textContent = 'No groups yet. Create one below.';
      list.appendChild(empty);
      return;
    }

    groups.forEach(grp => {
      const item = document.createElement('div');
      const isActive = node && node.groupId === grp.id;
      item.className = 'gpm-item' + (isActive ? ' gpm-active' : '');
      item.innerHTML = `
        <span class="gpm-dot" style="background:${grp.color}"></span>
        <span class="gpm-name">${grp.name}</span>
        <button class="gpm-del" title="Delete group">🗑</button>
      `;
      if (node) {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.gpm-del')) return;
          setNodeGroup(nodeId, grp.id);
          close();
        });
      } else {
        item.style.cursor = 'default';
      }
      item.querySelector('.gpm-del').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete group "${grp.name}"? Nodes in this group will be ungrouped.`)) {
          deleteGroup(grp.id);
          renderList();
          onDone && onDone();
        }
      });
      list.appendChild(item);
    });
  }

  renderList();

  modal.querySelector('#gpm-create-btn').addEventListener('click', () => {
    const nameInput = modal.querySelector('#gpm-new-name');
    const colorInput = modal.querySelector('#gpm-new-color');
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); nameInput.style.borderColor = 'var(--danger)'; return; }
    nameInput.style.borderColor = '';
    const grp = createGroup(name, colorInput.value);
    
    if (node) {
      setNodeGroup(nodeId, grp.id);
      close();
    } else {
      nameInput.value = '';
      renderList();
      onDone && onDone();
    }
  });

  modal.querySelector('#gpm-new-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') modal.querySelector('#gpm-create-btn').click();
    else e.target.style.borderColor = '';
  });

  // Auto-focus name input
  setTimeout(() => modal.querySelector('#gpm-new-name').focus(), 60);
}

function isDescendant(ancestorId, nodeId) {
  const node = getNode(ancestorId);
  if (!node) return false;
  for (const child of node.children) {
    if (child.id === nodeId) return true;
    if (isDescendant(child.id, nodeId)) return true;
  }
  return false;
}

function moveNodeTo(nodeId, newParentId) {
  const roots = getRoots();
  const nodeData = removeNode(nodeId, roots);
  if (!nodeData) return;
  const parent = getNode(newParentId);
  if (!parent) return;
  parent.children.push(nodeData);
  save();
}

function removeNode(id, nodes) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return nodes.splice(i, 1)[0];
    const found = removeNode(id, nodes[i].children);
    if (found) return found;
  }
  return null;
}

// ─── Render ──────────────────────────────────────────────

function render() {
  renderTree(getRoots(), handleAction);
  syncCompareSelection();
  updateCompareUI();
}

window.addEventListener('resize', () => render());

// ─── Tools Menu ─────────────────────────────────────────

function initToolsMenu() {
  const btnToggle = document.getElementById('btn-tools-toggle');
  const btnClose = document.getElementById('btn-tools-close');
  const menu = document.getElementById('tools-menu');

  if (btnToggle && btnClose && menu) {
    btnToggle.addEventListener('click', () => {
      btnToggle.style.opacity = '0';
      btnToggle.style.transform = 'scale(0.8)';
      btnToggle.style.pointerEvents = 'none';
      menu.style.opacity = '1';
      menu.style.transform = 'translateY(0) scale(1)';
      menu.style.pointerEvents = 'auto';
    });

    btnClose.addEventListener('click', () => {
      menu.style.opacity = '0';
      menu.style.transform = 'translateY(20px) scale(0.9)';
      menu.style.pointerEvents = 'none';
      btnToggle.style.opacity = '1';
      btnToggle.style.transform = 'scale(1)';
      btnToggle.style.pointerEvents = 'auto';
    });
  }
}

// ─── Similarity Check ───────────────────────────────────

function initSimilarityCheck() {
  const btn = document.getElementById('btn-check-similarity');
  if (!btn) return;
  btn.addEventListener('click', () => { openSimilarityModal(); });
}

// ─── Uniqueness Check ───────────────────────────────────

function initUniquenessCheck() {
  const btn = document.getElementById('btn-check-uniqueness');
  if (!btn) return;
  btn.addEventListener('click', () => { openUniquenessModal(); });
}

// ─── Node Compare ───────────────────────────────────────

function initCompareFeature() {
  const toggleBtn = document.getElementById('btn-compare-toggle');
  const clearBtn = document.getElementById('btn-compare-clear');
  const treeContainer = document.getElementById('tree-container');

  if (!toggleBtn || !clearBtn || !treeContainer) return;

  toggleBtn.addEventListener('click', () => {
    compareState.active = !compareState.active;
    if (!compareState.active) compareState.selectedIds = [];
    updateCompareUI();
  });

  clearBtn.addEventListener('click', () => {
    compareState.selectedIds = [];
    updateCompareUI();
  });

  treeContainer.addEventListener('click', (e) => {
    if (!compareState.active) return;
    if (e.target.closest('button, input, textarea, select, a')) return;
    const card = e.target.closest('.node-card');
    if (!card) return;
    const nodeId = card.dataset.id;
    if (!nodeId) return;
    toggleCompareNode(nodeId);
    updateCompareUI();
  });
}

function toggleCompareNode(nodeId) {
  const idx = compareState.selectedIds.indexOf(nodeId);
  if (idx >= 0) { compareState.selectedIds.splice(idx, 1); return; }
  if (compareState.selectedIds.length >= 2) compareState.selectedIds.shift();
  compareState.selectedIds.push(nodeId);
}

function syncCompareSelection() {
  compareState.selectedIds = compareState.selectedIds.filter((id) => !!getNode(id));
}

function updateCompareUI() {
  const toggleBtn = document.getElementById('btn-compare-toggle');
  const panel = document.getElementById('compare-panel');
  const nodeAEl = document.getElementById('compare-node-a');
  const nodeBEl = document.getElementById('compare-node-b');
  const resultsEl = document.getElementById('compare-results');

  if (!toggleBtn || !panel || !nodeAEl || !nodeBEl || !resultsEl) return;

  toggleBtn.classList.toggle('active', compareState.active);
  panel.classList.toggle('hidden', !compareState.active);

  const nodeA = compareState.selectedIds[0] ? getNode(compareState.selectedIds[0]) : null;
  const nodeB = compareState.selectedIds[1] ? getNode(compareState.selectedIds[1]) : null;

  nodeAEl.textContent = `Node 1: ${nodeA ? nodeA.name : '-'}`;
  nodeBEl.textContent = `Node 2: ${nodeB ? nodeB.name : '-'}`;

  document.querySelectorAll('.node-card').forEach((card) => {
    card.classList.toggle('compare-selected-card', compareState.selectedIds.includes(card.dataset.id));
  });

  if (!compareState.active) return;
  if (!nodeA || !nodeB) { resultsEl.textContent = 'Pilih 2 node untuk melihat perbedaan.'; return; }

  const diffs = getParamDiff(compareState.selectedIds[0], compareState.selectedIds[1]);
  if (diffs.length === 0) { resultsEl.textContent = 'Tidak ada perbedaan hyperparameter.'; return; }

  const nodeAName = escapeHtml(nodeA.name || 'Node 1');
  const nodeBName = escapeHtml(nodeB.name || 'Node 2');
  const rowsHtml = diffs.map((diff) => `
    <tr>
      <td>${escapeHtml(diff.key)}</td>
      <td>${escapeHtml(diff.aValue)}</td>
      <td>${escapeHtml(diff.bValue)}</td>
    </tr>
  `).join('');

  resultsEl.innerHTML = `
    <table class="compare-diff-table">
      <thead>
        <tr>
          <th>Hyperparameter</th>
          <th>${nodeAName}</th>
          <th>${nodeBName}</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function getParamDiff(nodeAId, nodeBId) {
  const paramsA = getEffectiveParams(nodeAId) || {};
  const paramsB = getEffectiveParams(nodeBId) || {};
  const allKeys = new Set([...Object.keys(paramsA), ...Object.keys(paramsB)]);
  const diffs = [];

  for (const key of [...allKeys].sort()) {
    const hasA = Object.prototype.hasOwnProperty.call(paramsA, key);
    const hasB = Object.prototype.hasOwnProperty.call(paramsB, key);
    const valA = hasA ? String(paramsA[key]) : '(tidak ada)';
    const valB = hasB ? String(paramsB[key]) : '(tidak ada)';
    if (!hasA || !hasB || valA !== valB) {
      diffs.push({ key, aValue: valA, bValue: valB });
    }
  }

  return diffs;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
