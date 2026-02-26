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
document.getElementById('btn-show-sidebar').addEventListener('click', () => {
  const sidebar = document.getElementById('param-sidebar');
  sidebar.classList.toggle('collapsed');
});

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

    case 'duplicate':
      duplicateNode(nodeId);
      render();
      break;

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
