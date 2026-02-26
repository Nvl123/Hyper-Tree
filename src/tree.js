import { renderNodeCard } from './node.js';
import { updateNode, save, getRoots, getEffectiveParams, getNode } from './store.js';

// Soft, dashboard-matching color palette for shared params
const PARAM_COLORS = [
  { color: '#63b3ed', bg: 'rgba(99, 179, 237, 0.12)' },   // blue
  { color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)' },   // purple
  { color: '#f687b3', bg: 'rgba(246, 135, 179, 0.12)' },   // pink
  { color: '#68d391', bg: 'rgba(104, 211, 145, 0.12)' },   // green
  { color: '#fbd38d', bg: 'rgba(251, 211, 141, 0.15)' },   // amber
  { color: '#fc8181', bg: 'rgba(252, 129, 129, 0.12)' },   // red
  { color: '#76e4f7', bg: 'rgba(118, 228, 247, 0.12)' },   // cyan
  { color: '#f6ad55', bg: 'rgba(246, 173, 85, 0.12)' },    // orange
  { color: '#9ae6b4', bg: 'rgba(154, 230, 180, 0.12)' },   // mint
  { color: '#b794f4', bg: 'rgba(183, 148, 244, 0.12)' },   // violet
];

let scale = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.0;
const ZOOM_STEP = 0.1;

let canvas, svg, treeContainer, zoomLabel;

// Drag state for node dragging
let dragState = null;

export function initCanvas() {
  canvas = document.getElementById('canvas');
  svg = document.getElementById('connections');
  treeContainer = document.getElementById('tree-container');
  zoomLabel = document.getElementById('zoom-level');

  const wrapper = document.getElementById('canvas-wrapper');

  // Pan — Figma/draw.io style: middle-click anywhere, or left-click on non-interactive areas
  wrapper.addEventListener('pointerdown', (e) => {
    // Middle mouse button (button 1) → always pan
    if (e.button === 1) {
      e.preventDefault();
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      wrapper.style.cursor = 'grabbing';
      return;
    }

    // Left click → pan only from non-interactive targets
    if (e.button !== 0) return;

    // Don't pan if clicking on interactive elements
    const isInteractive = e.target.closest('button, input, textarea, select, a, .node-actions, .modal-content');
    if (isInteractive) return;

    // Pan from background, canvas, SVG, tree-container, subtree wrappers, children containers, roots-wrapper
    const panTargets = [wrapper, canvas, svg, treeContainer];
    const isPanTarget = panTargets.includes(e.target)
      || e.target.classList.contains('tree-container')
      || e.target.classList.contains('roots-wrapper')
      || e.target.classList.contains('children-container')
      || e.target.classList.contains('subtree');

    if (isPanTarget) {
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      wrapper.style.cursor = 'grabbing';
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (dragState) {
      handleDragMove(e);
      return;
    }
    if (!isPanning) return;
    panX = e.clientX - panStartX;
    panY = e.clientY - panStartY;
    applyTransform();
  });

  window.addEventListener('pointerup', (e) => {
    if (dragState) {
      handleDragEnd(e);
      return;
    }
    isPanning = false;
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) wrapper.style.cursor = '';
  });

  // Zoom
  wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setScale(scale + delta);
  }, { passive: false });

  document.getElementById('btn-zoom-in').addEventListener('click', () => setScale(scale + ZOOM_STEP));
  document.getElementById('btn-zoom-out').addEventListener('click', () => setScale(scale - ZOOM_STEP));
  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    scale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  });

  applyTransform();
}

function setScale(newScale) {
  scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  applyTransform();
}

function applyTransform() {
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
}

export function getScale() {
  return scale;
}

// ─── Render full tree ────────────────────────────────────

let currentOnAction = null;

export function renderTree(roots, onAction) {
  currentOnAction = onAction;
  treeContainer.innerHTML = '';
  svg.innerHTML = '';

  const emptyState = document.getElementById('empty-state');
  if (roots.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  const rootsWrapper = document.createElement('div');
  rootsWrapper.className = 'roots-wrapper';

  roots.forEach((root) => {
    const subtree = buildSubtree(root, onAction);
    rootsWrapper.appendChild(subtree);
  });

  treeContainer.appendChild(rootsWrapper);

  requestAnimationFrame(() => {
    drawAllConnections(roots);
    highlightSharedParams(roots);
  });
}

// ─── Shared Param Highlighting ──────────────────────────

function flattenAllNodes(nodes, list = []) {
  for (const node of nodes) {
    list.push(node);
    if (node.children && node.children.length > 0) {
      flattenAllNodes(node.children, list);
    }
  }
  return list;
}

function highlightSharedParams(roots) {
  const allNodes = flattenAllNodes(roots);
  const paramMap = new Map(); // "key=value" -> [nodeId, ...]

  for (const node of allNodes) {
    const params = getEffectiveParams(node.id);
    for (const [key, value] of Object.entries(params)) {
      const groupKey = `${key}=${value}`;
      if (!paramMap.has(groupKey)) paramMap.set(groupKey, []);
      paramMap.get(groupKey).push(node.id);
    }
  }

  // Assign colors only to groups shared across 2+ nodes
  const nodeColorMap = new Map(); // nodeId -> Map<paramKey, colorObj>
  let colorIdx = 0;
  for (const [groupKey, nodeIds] of paramMap) {
    if (nodeIds.length < 2) continue;
    const paramKey = groupKey.split('=')[0];
    const palette = PARAM_COLORS[colorIdx % PARAM_COLORS.length];
    colorIdx++;
    for (const nodeId of nodeIds) {
      if (!nodeColorMap.has(nodeId)) nodeColorMap.set(nodeId, new Map());
      nodeColorMap.get(nodeId).set(paramKey, palette);
    }
  }

  // Apply colors to param rows
  document.querySelectorAll('.node-card').forEach((card) => {
    const nodeId = card.dataset.id;
    const colorMap = nodeColorMap.get(nodeId);
    if (!colorMap) return;

    card.querySelectorAll('.params-table tr').forEach((row) => {
      const keyCell = row.querySelector('.param-key');
      if (!keyCell) return;
      const key = keyCell.textContent.trim();
      if (colorMap.has(key)) {
        const { color, bg } = colorMap.get(key);
        row.classList.add('param-shared');
        row.style.setProperty('--shared-color', color);
        row.style.setProperty('--shared-bg', bg);
      }
    });
  });
}

function buildSubtree(node, onAction) {
  const wrapper = document.createElement('div');
  wrapper.className = 'subtree';
  wrapper.dataset.nodeId = node.id;

  const card = renderNodeCard(node, onAction);

  // Make card draggable
  card.setAttribute('draggable', 'false'); // we use pointer events instead
  setupNodeDrag(card, node.id);

  wrapper.appendChild(card);

  if (node.children.length > 0 && !node.collapsed) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'children-container';

    node.children.forEach((child) => {
      const childSubtree = buildSubtree(child, onAction);
      childrenContainer.appendChild(childSubtree);
    });

    wrapper.appendChild(childrenContainer);
  }
  // Apply saved position offset
  if (node.position) {
    wrapper.style.position = 'relative';
    wrapper.style.left = node.position.x + 'px';
    wrapper.style.top = node.position.y + 'px';
  }

  return wrapper;
}

// ─── Node Dragging ───────────────────────────────────────

function setupNodeDrag(card, nodeId) {
  card.addEventListener('pointerdown', (e) => {
    // Only allow drag from the header area, not buttons/inputs
    const header = card.querySelector('.node-header');
    if (!header || !header.contains(e.target)) return;
    if (e.target.closest('button') || e.target.closest('input')) return;

    e.stopPropagation();
    e.preventDefault();

    const rect = card.getBoundingClientRect();
    dragState = {
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      clone: null,
      moved: false,
    };
  });
}

function handleDragMove(e) {
  if (!dragState) return;

  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;

  // Only start visual drag after 5px threshold
  if (!dragState.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

  if (!dragState.moved) {
    dragState.moved = true;
    const original = document.querySelector(`.node-card[data-id="${dragState.nodeId}"]`);
    if (original) {
      original.classList.add('drag-source');
      dragState.subtree = original.closest('.subtree');
      dragState.origLeft = parseFloat(dragState.subtree?.style.left) || 0;
      dragState.origTop = parseFloat(dragState.subtree?.style.top) || 0;
    }
    // Start connection animation
    animateConnectionsDuringDrag();
  }

  // Move the actual subtree
  if (dragState.subtree) {
    const moveX = dx / scale;
    const moveY = dy / scale;
    dragState.subtree.style.position = 'relative';
    dragState.subtree.style.left = (dragState.origLeft + moveX) + 'px';
    dragState.subtree.style.top = (dragState.origTop + moveY) + 'px';
  }
}

function handleDragEnd(e) {
  if (!dragState) return;

  const original = document.querySelector(`.node-card[data-id="${dragState.nodeId}"]`);
  if (original) original.classList.remove('drag-source');

  if (dragState.moved && dragState.subtree) {
    // Persist the position that was already applied during drag
    const finalX = parseFloat(dragState.subtree.style.left) || 0;
    const finalY = parseFloat(dragState.subtree.style.top) || 0;

    updateNode(dragState.nodeId, { position: { x: finalX, y: finalY } });
    save();

    // Final connection redraw
    const roots = getRoots();
    requestAnimationFrame(() => drawAllConnections(roots));
  }

  dragState = null;
}

function getDropTarget(e) {
  const elements = document.elementsFromPoint(e.clientX, e.clientY);
  for (const el of elements) {
    if (el.classList.contains('node-card') && !el.classList.contains('drag-clone')) {
      return el;
    }
  }
  return null;
}

// ─── SVG Connections ─────────────────────────────────────

function drawAllConnections(roots) {
  svg.innerHTML = '';
  const canvasRect = canvas.getBoundingClientRect();
  roots.forEach((root) => drawNodeConnections(root, canvasRect));
  drawSecondaryConnections(roots, canvasRect);
}

function drawNodeConnections(node, canvasRect) {
  if (node.collapsed || node.children.length === 0) return;

  const parentCard = document.querySelector(`.node-card[data-id="${node.id}"]`);
  if (!parentCard) return;

  node.children.forEach((child) => {
    const childCard = document.querySelector(`.node-card[data-id="${child.id}"]`);
    if (!childCard) return;

    const parentRect = parentCard.getBoundingClientRect();
    const childRect = childCard.getBoundingClientRect();

    const x1 = (parentRect.left + parentRect.width / 2 - canvasRect.left) / scale;
    const y1 = (parentRect.bottom - canvasRect.top) / scale;
    const x2 = (childRect.left + childRect.width / 2 - canvasRect.left) / scale;
    const y2 = (childRect.top - canvasRect.top) / scale;

    const midY = (y1 + y2) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
    path.setAttribute('class', 'connection-line');
    svg.appendChild(path);

    drawNodeConnections(child, canvasRect);
  });
}

export function redrawConnections(roots) {
  const canvasRect = canvas.getBoundingClientRect();
  svg.innerHTML = '';
  roots.forEach((root) => drawNodeConnections(root, canvasRect));
}

// Continuously redraw connections during drag
function animateConnectionsDuringDrag() {
  if (!dragState) return;
  const roots = getRoots();
  drawAllConnections(roots);
  requestAnimationFrame(animateConnectionsDuringDrag);
}

// ─── Secondary Parent Connections (dashed, different color) ─

function drawSecondaryConnections(roots, canvasRect) {
  const allNodes = flattenAllNodes(roots);

  for (const node of allNodes) {
    if (!node.secondaryParentIds || node.secondaryParentIds.length === 0) continue;

    const childCard = document.querySelector(`.node-card[data-id="${node.id}"]`);
    if (!childCard) continue;

    for (const spId of node.secondaryParentIds) {
      const spCard = document.querySelector(`.node-card[data-id="${spId}"]`);
      if (!spCard) continue;

      const parentRect = spCard.getBoundingClientRect();
      const childRect = childCard.getBoundingClientRect();

      const x1 = (parentRect.left + parentRect.width / 2 - canvasRect.left) / scale;
      const y1 = (parentRect.bottom - canvasRect.top) / scale;
      const x2 = (childRect.left + childRect.width / 2 - canvasRect.left) / scale;
      const y2 = (childRect.top - canvasRect.top) / scale;

      const midY = (y1 + y2) / 2;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
      path.setAttribute('class', 'connection-line-secondary');
      svg.appendChild(path);
    }
  }
}
