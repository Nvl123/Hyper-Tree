import './style.css';
import {
  load, save, getRoots,
  createRootNode, createChildNode,
  updateNode, deleteNode, duplicateNode,
  exportToJSON, importFromJSON,
  getNode,
} from './store.js';
import { initCanvas, renderTree } from './tree.js';
import { initModal, openEditModal } from './modal.js';
import { exportTreeAsPng } from './export.js';
import { initSidebar } from './sidebar.js';

// ─── Initialize ──────────────────────────────────────────

load();
initCanvas();
initModal();
initSidebar();
initTheme();
render();

// ─── Toolbar ─────────────────────────────────────────────

document.getElementById('btn-add-root').addEventListener('click', () => {
  createRootNode();
  render();
});

document.getElementById('btn-export').addEventListener('click', () => {
  exportTreeAsPng();
});

// File Save / Load
document.getElementById('btn-save-file').addEventListener('click', async () => {
  await exportToJSON();
});

document.getElementById('btn-open-file').addEventListener('click', async () => {
  const success = await importFromJSON();
  if (success) render();
});

// Theme toggle
document.getElementById('btn-theme').addEventListener('click', () => {
  toggleTheme();
});

// Sidebar toggle (from toolbar)
const sidebarBtn = document.getElementById('btn-show-sidebar');
if (sidebarBtn) {
  const sidebar = document.getElementById('param-sidebar');
  // Check initial state
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
  // Load initial grid state
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
        // Handle parent change
        if (result.newParentId) {
          if (result.newParentId === '__root__') {
            // Move to root level
            const roots = getRoots();
            const nodeData = removeNode(nodeId, roots);
            if (nodeData) {
              roots.push(nodeData);
              save();
            }
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
        
        if (isAbs) {
          absoluteOpts = { x: leftOffset + 40, y: topOffset + 40 };
        } else {
          absoluteOpts = {
            x: originalSubtree.offsetLeft + leftOffset + 40,
            y: originalSubtree.offsetTop + topOffset + 40
          };
        }
      }
      duplicateNode(nodeId, absoluteOpts);
      render();
      break;
    }

    case 'toggle': {
      const node = getNode(nodeId);
      if (node) {
        node.collapsed = !node.collapsed;
        save();
        render();
      }
      break;
    }

    case 'refresh':
      render();
      break;

    case 'move': {
      // Move node (nodeId) to become child of (extra = targetId)
      const targetId = extra;
      if (!targetId || nodeId === targetId) break;

      // Prevent moving a node into its own descendant
      if (isDescendant(nodeId, targetId)) break;

      moveNodeTo(nodeId, targetId);
      render();
      break;
    }
  }
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
    if (nodes[i].id === id) {
      return nodes.splice(i, 1)[0];
    }
    const found = removeNode(id, nodes[i].children);
    if (found) return found;
  }
  return null;
}

// ─── Render ──────────────────────────────────────────────

function render() {
  renderTree(getRoots(), handleAction);
}

window.addEventListener('resize', () => render());
