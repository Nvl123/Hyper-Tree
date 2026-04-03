import { renderNodeCard } from './node.js';
import { updateNode, save, getRoots, getEffectiveParams, getNode, getAreas, createArea, updateArea, deleteArea, getAllNodes } from './store.js';

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

// Drawing state for Area
let isDrawingArea = false;
let drawStartX = 0;
let drawStartY = 0;
let tempAreaEl = null;

const nodeResizeObserver = new window.ResizeObserver(() => {
  const roots = getRoots();
  if (roots && roots.length > 0 && !dragState) {
    requestAnimationFrame(() => drawAllConnections(roots));
  }
});

export function startDrawingArea() {
  if (isDrawingArea) {
    cancelDrawingArea();
    return;
  }
  isDrawingArea = true;
  document.getElementById('canvas-wrapper').style.cursor = 'crosshair';
  const btn = document.getElementById('btn-add-area');
  if (btn) btn.classList.add('active-drawing');
}

export function cancelDrawingArea() {
  isDrawingArea = false;
  const wrapper = document.getElementById('canvas-wrapper');
  if (wrapper) wrapper.style.cursor = '';
  const btn = document.getElementById('btn-add-area');
  if (btn) btn.classList.remove('active-drawing');
  if (tempAreaEl) {
    tempAreaEl.remove();
    tempAreaEl = null;
  }
}

export function initCanvas() {
  canvas = document.getElementById('canvas');
  svg = document.getElementById('connections');
  treeContainer = document.getElementById('tree-container');
  zoomLabel = document.getElementById('zoom-level');

  const wrapper = document.getElementById('canvas-wrapper');

  // Pan — Figma/draw.io style: middle-click anywhere, or left-click on non-interactive areas
  wrapper.addEventListener('pointerdown', (e) => {
    if (isDrawingArea) {
      if (e.target.closest('button, input, textarea, select, a, .node-actions, .modal-content')) {
        return; // Don't draw if clicking on interactive elements
      }
      e.stopPropagation();
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      drawStartX = (e.clientX - rect.left) / scale;
      drawStartY = (e.clientY - rect.top) / scale;

      tempAreaEl = document.createElement('div');
      tempAreaEl.className = 'temp-drawing-area';
      tempAreaEl.style.left = drawStartX + 'px';
      tempAreaEl.style.top = drawStartY + 'px';
      tempAreaEl.style.width = '0px';
      tempAreaEl.style.height = '0px';
      
      const areasContainer = document.getElementById('areas-container');
      if (areasContainer) areasContainer.appendChild(tempAreaEl);
      return;
    }

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
    if (isDrawingArea && tempAreaEl) {
      const rect = canvas.getBoundingClientRect();
      const currentX = (e.clientX - rect.left) / scale;
      const currentY = (e.clientY - rect.top) / scale;

      const x = Math.min(drawStartX, currentX);
      const y = Math.min(drawStartY, currentY);
      const w = Math.abs(currentX - drawStartX);
      const h = Math.abs(currentY - drawStartY);

      tempAreaEl.style.left = x + 'px';
      tempAreaEl.style.top = y + 'px';
      tempAreaEl.style.width = w + 'px';
      tempAreaEl.style.height = h + 'px';
      return;
    }

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
    if (isDrawingArea && tempAreaEl) {
      isDrawingArea = false;
      const wrapper = document.getElementById('canvas-wrapper');
      if (wrapper) wrapper.style.cursor = '';
      const btn = document.getElementById('btn-add-area');
      if (btn) btn.classList.remove('active-drawing');

      const w = parseFloat(tempAreaEl.style.width);
      const h = parseFloat(tempAreaEl.style.height);
      const x = parseFloat(tempAreaEl.style.left);
      const y = parseFloat(tempAreaEl.style.top);

      tempAreaEl.remove();
      tempAreaEl = null;

      if (w > 5 && h > 5) {
        try {
          const area = createArea('Area Eksperimen', x, y, w, h);
          renderTree(getRoots(), currentOnAction);
          
          // Auto-focus name input
          setTimeout(() => {
            const areaEl = document.querySelector(`.tree-area[data-id="${area.id}"]`);
            if (areaEl) {
              const input = areaEl.querySelector('.tree-area-name-input');
              if (input) {
                input.focus();
                input.select();
              }
            }
          }, 50);
        } catch (err) {
          alert("Error creating area: " + err.message);
          console.error(err);
        }
      } else {
         // clicked without dragging much, cancel drawing
      }
      return;
    }

    if (dragState) {
      handleDragEnd(e);
      return;
    }
    isPanning = false;
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) wrapper.style.cursor = '';
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isDrawingArea) cancelDrawingArea();
    }
  });

  // Zoom & Pan via touchpad/wheel
  wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey) {
      // Pinch-to-zoom or Ctrl+Wheel
      // Dynamic step based on deltaY for smoother trackpad feel
      // A typical mouse wheel gives ~100 deltaY; trackpad gives smaller values
      const zoomModifier = e.deltaY * -0.01; 
      zoomAt(e.clientX, e.clientY, scale + zoomModifier);
    } else {
      // Two-finger scroll (pan)
      panX -= e.deltaX;
      panY -= e.deltaY;
      applyTransform();
    }
  }, { passive: false });

  document.getElementById('btn-zoom-in').addEventListener('click', () => zoomCenter(ZOOM_STEP));
  document.getElementById('btn-zoom-out').addEventListener('click', () => zoomCenter(-ZOOM_STEP));
  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    scale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  });
  
  document.getElementById('btn-recenter').addEventListener('click', recenterView);

  applyTransform();
}

function zoomAt(clientX, clientY, newScale) {
  const wrapper = document.getElementById('canvas-wrapper');
  if (!wrapper) return;
  const rect = wrapper.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  if (scale === newScale) return;

  // Compute new panX and panY to keep the point (x, y) at the same position in viewport
  panX = x - (x - panX) * (newScale / scale);
  panY = y - (y - panY) * (newScale / scale);
  scale = newScale;

  applyTransform();
}

function zoomCenter(zoomModifier) {
  const wrapper = document.getElementById('canvas-wrapper');
  if (!wrapper) return;
  const rect = wrapper.getBoundingClientRect();
  const x = rect.width / 2;
  const y = rect.height / 2;
  zoomAt(rect.left + x, rect.top + y, scale + zoomModifier);
}

function setScale(newScale) {
  scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  applyTransform();
}

export function recenterView() {
  const container = document.getElementById('tree-container');
  if (!container || !container.querySelector('.roots-wrapper')) {
    // Fallback if empty
    scale = 1; panX = 0; panY = 0;
    applyTransform();
    return;
  }

  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const wrapperElement = document.getElementById('canvas-wrapper');
  if (!wrapperElement) return;
  const viewWidth = wrapperElement.clientWidth;
  const viewHeight = wrapperElement.clientHeight;

  // Get original (unscaled) dimensions
  const width = rect.width / scale;
  const height = rect.height / scale;

  const rectLeftInWrapper = rect.left;
  const rectTopInWrapper = rect.top - 56; // Subtract toolbar height

  // Get original (unscaled/unpanned) origin
  const originalX = (rectLeftInWrapper - panX) / scale;
  const originalY = (rectTopInWrapper - panY) / scale;

  const padding = 80;
  const scaleX = (viewWidth - padding * 2) / width;
  const scaleY = (viewHeight - padding * 2) / height;

  // Don't scale up past 100% just to fit small graphs (keeps it looking sane)
  let newScale = Math.min(scaleX, scaleY, 1);
  newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

  const cx = originalX + width / 2;
  const cy = originalY + height / 2;

  panX = Math.round((viewWidth / 2) - (cx * newScale));
  panY = Math.round((viewHeight / 2) - (cy * newScale));
  scale = Math.round(newScale * 100) / 100;

  applyTransform();
}

function applyTransform() {
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;

  // Sync grid background
  const wrapper = document.getElementById('canvas-wrapper');
  if (wrapper) {
    wrapper.style.setProperty('--grid-scale', scale);
    wrapper.style.setProperty('--grid-pan-x', `${panX}px`);
    wrapper.style.setProperty('--grid-pan-y', `${panY}px`);
  }
}

export function getScale() {
  return scale;
}

export function panToNode(nodeId) {
  const card = document.querySelector(`.node-card[data-id="${nodeId}"]`);
  if (!card) return;

  const wrapperElement = document.getElementById('canvas-wrapper');
  const viewWidth = wrapperElement.clientWidth;
  const viewHeight = wrapperElement.clientHeight;

  const cardRect = card.getBoundingClientRect();
  
  // Calculate the center of the card relative to the unscaled canvas origin
  const canvasRect = canvas.getBoundingClientRect();
  const cardCenterX = (cardRect.left + cardRect.width / 2 - canvasRect.left) / scale;
  const cardCenterY = (cardRect.top + cardRect.height / 2 - canvasRect.top) / scale;

  panX = Math.round((viewWidth / 2) - (cardCenterX * scale));
  panY = Math.round((viewHeight / 2) - (cardCenterY * scale));
  
  applyTransform();

  // Highlight
  card.classList.remove('node-highlight-match');
  // Trigger reflow to restart animation
  void card.offsetWidth;
  card.classList.add('node-highlight-match');
  
  setTimeout(() => {
    card.classList.remove('node-highlight-match');
  }, 1000); // matches animation duration
}

// ─── Render full tree ────────────────────────────────────

let currentOnAction = null;

export function renderTree(roots, onAction) {
  currentOnAction = onAction;
  
  // Clear previous observers to prevent memory leaks and redundant calls
  if (nodeResizeObserver) {
    nodeResizeObserver.disconnect();
  }

  treeContainer.innerHTML = '';
  svg.innerHTML = '';

  let areasContainer = document.getElementById('areas-container');
  if (!areasContainer) {
    areasContainer = document.createElement('div');
    areasContainer.id = 'areas-container';
    canvas.insertBefore(areasContainer, svg);
  } else {
    areasContainer.innerHTML = '';
  }

  const areas = getAreas();
  areas.forEach(area => {
    renderArea(area, areasContainer);
  });

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

function renderArea(area, container) {
  const el = document.createElement('div');
  el.className = 'tree-area';
  el.dataset.id = area.id;
  el.style.left = area.x + 'px';
  el.style.top = area.y + 'px';
  el.style.width = area.width + 'px';
  el.style.height = area.height + 'px';
  el.style.setProperty('--area-color', area.color);

  el.innerHTML = `
    <div class="tree-area-header">
      <input type="text" class="tree-area-name-input" value="${area.name}" />
      <div class="tree-area-actions">
        <input type="color" class="area-color-picker" value="${area.color || '#63b3ed'}" title="Ubah Warna" />
        <button class="area-btn-delete" title="Hapus Area">🗑️</button>
      </div>
    </div>
    <div class="tree-area-resize-handle"></div>
  `;

  container.appendChild(el);

  setupAreaDrag(el, area.id);
  setupAreaResize(el, area.id);

  el.querySelector('.area-btn-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`Hapus area "${area.name}"?`)) {
      deleteArea(area.id);
      renderTree(getRoots(), currentOnAction);
    }
  });

  const nameInput = el.querySelector('.tree-area-name-input');
  const colorInput = el.querySelector('.area-color-picker');

  nameInput.addEventListener('pointerdown', (e) => e.stopPropagation());
  colorInput.addEventListener('pointerdown', (e) => e.stopPropagation());

  const syncAreaNameInputWidth = () => {
    const minWidthPx = 64;
    nameInput.style.width = '0px';
    const contentWidthPx = Math.ceil(nameInput.scrollWidth) + 4;
    nameInput.style.width = `${Math.max(minWidthPx, contentWidthPx)}px`;
  };

  syncAreaNameInputWidth();

  nameInput.addEventListener('input', () => {
    syncAreaNameInputWidth();
  });

  nameInput.addEventListener('change', (e) => {
    const normalizedName = e.target.value.trim() || 'Area';
    e.target.value = normalizedName;
    updateArea(area.id, { name: normalizedName });
    syncAreaNameInputWidth();
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.target.blur();
  });

  colorInput.addEventListener('input', (e) => {
    el.style.setProperty('--area-color', e.target.value);
    el.querySelector('.tree-area-header').style.borderColor = e.target.value;
  });

  colorInput.addEventListener('change', (e) => {
    updateArea(area.id, { color: e.target.value });
  });
}

let areaDragState = null;

function setupAreaDrag(el, areaId) {
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || e.target.classList.contains('tree-area-resize-handle')) return;
    e.stopPropagation();
    
    // Find nodes inside this area
    const areaRect = el.getBoundingClientRect();
    const allNodes = getAllNodes();
    const containedNodeIds = [];

    allNodes.forEach(node => {
      const card = document.querySelector(`.node-card[data-id="${node.id}"]`);
      if (card) {
        const cardRect = card.getBoundingClientRect();
        const cardCenterX = cardRect.left + cardRect.width / 2;
        const cardCenterY = cardRect.top + cardRect.height / 2;

        if (cardCenterX >= areaRect.left && cardCenterX <= areaRect.right &&
            cardCenterY >= areaRect.top && cardCenterY <= areaRect.bottom) {
          containedNodeIds.push(node.id);
        }
      }
    });

    const roots = getRoots();
    const parentMap = buildParentMap(roots);
    const containedSet = new Set(containedNodeIds);
    const topLevelContainedNodeIds = containedNodeIds.filter((id) => {
      let current = parentMap.get(id);
      while (current) {
        if (containedSet.has(current)) return false;
        current = parentMap.get(current);
      }
      return true;
    });

    areaDragState = {
      areaId,
      startX: e.clientX,
      startY: e.clientY,
      origX: parseFloat(el.style.left) || 0,
      origY: parseFloat(el.style.top) || 0,
      containedNodeIds: topLevelContainedNodeIds,
      nodeOrigins: topLevelContainedNodeIds.map(id => {
        const subtree = document.querySelector(`.subtree[data-node-id="${id}"]`);
        return {
          id,
          x: parseFloat(subtree.style.left) || 0,
          y: parseFloat(subtree.style.top) || 0
        };
      })
    };

    const onPointerMove = (moveEvent) => {
      if (!areaDragState) return;
      const dx = (moveEvent.clientX - areaDragState.startX) / scale;
      const dy = (moveEvent.clientY - areaDragState.startY) / scale;

      el.style.transition = 'none';
      el.style.left = (areaDragState.origX + dx) + 'px';
      el.style.top = (areaDragState.origY + dy) + 'px';

      // Move contained nodes
      areaDragState.nodeOrigins.forEach(origin => {
        const subtree = document.querySelector(`.subtree[data-node-id="${origin.id}"]`);
        if (subtree) {
           subtree.style.transition = 'none';
           subtree.style.left = (origin.x + dx) + 'px';
           subtree.style.top = (origin.y + dy) + 'px';
        }
      });
      
      requestAnimationFrame(() => drawAllConnections(getRoots()));
    };

    const onPointerUp = () => {
      if (!areaDragState) return;
      
      // Persist Area Position
      updateArea(areaId, {
        x: parseFloat(el.style.left),
        y: parseFloat(el.style.top)
      });

      // Persist Node Positions
      areaDragState.containedNodeIds.forEach(id => {
        const subtree = document.querySelector(`.subtree[data-node-id="${id}"]`);
        if (subtree) {
          updateNode(id, {
            position: {
              x: parseFloat(subtree.style.left),
              y: parseFloat(subtree.style.top)
            }
          });
        }
      });

      save();
      el.style.transition = '';
      areaDragState.nodeOrigins.forEach(origin => {
        const subtree = document.querySelector(`.subtree[data-node-id="${origin.id}"]`);
        if (subtree) subtree.style.transition = '';
      });

      areaDragState = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });
}

function setupAreaResize(el, areaId) {
  const handle = el.querySelector('.tree-area-resize-handle');
  handle.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = parseFloat(el.style.width);
    const startHeight = parseFloat(el.style.height);

    const onPointerMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) / scale;
      const dy = (moveEvent.clientY - startY) / scale;
      el.style.width = Math.max(100, startWidth + dx) + 'px';
      el.style.height = Math.max(100, startHeight + dy) + 'px';
    };

    const onPointerUp = () => {
      updateArea(areaId, {
        width: parseFloat(el.style.width),
        height: parseFloat(el.style.height)
      });
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });
}

function buildParentMap(roots) {
  const parentMap = new Map();

  function walk(node, parentId = null) {
    parentMap.set(node.id, parentId);
    if (!node.children?.length) return;
    node.children.forEach((child) => walk(child, node.id));
  }

  roots.forEach((root) => walk(root, null));
  return parentMap;
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
  nodeResizeObserver.observe(card);

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
  if (node.isAbsolute) {
    wrapper.style.position = 'absolute';
    wrapper.style.left = (node.position?.x || 0) + 'px';
    wrapper.style.top = (node.position?.y || 0) + 'px';
    wrapper.style.zIndex = '10'; // ensure it renders above flex standard items
  } else if (node.position) {
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
      dragState.isAbsolute = dragState.subtree?.style.position === 'absolute';
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
    if (!dragState.isAbsolute) {
       dragState.subtree.style.position = 'relative';
    }
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
