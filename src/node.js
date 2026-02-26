import { getEffectiveParams, getOverriddenKeys, isRootNode, getNodeDepth, getNode, updateNode, save } from './store.js';

// Depth color palette — each depth level gets a distinct accent
const DEPTH_COLORS = [
  { accent: '#63b3ed', bg: 'rgba(99,179,237,0.08)',  border: 'rgba(99,179,237,0.25)'  },  // blue
  { accent: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)' },  // purple
  { accent: '#f687b3', bg: 'rgba(246,135,179,0.08)', border: 'rgba(246,135,179,0.25)' },  // pink
  { accent: '#68d391', bg: 'rgba(104,211,145,0.08)', border: 'rgba(104,211,145,0.25)' },  // green
  { accent: '#fbd38d', bg: 'rgba(251,211,141,0.08)', border: 'rgba(251,211,141,0.25)' },  // yellow
  { accent: '#fc8181', bg: 'rgba(252,129,129,0.08)', border: 'rgba(252,129,129,0.25)' },  // red
  { accent: '#76e4f7', bg: 'rgba(118,228,247,0.08)', border: 'rgba(118,228,247,0.25)' },  // cyan
];

/**
 * Render a single node card.
 * @param {object} node
 * @param {function} onAction - callback(action, nodeId, [extra])
 */
export function renderNodeCard(node, onAction) {
  const card = document.createElement('div');
  card.className = 'node-card';
  card.dataset.id = node.id;

  const effectiveParams = getEffectiveParams(node.id);
  const overriddenKeys = getOverriddenKeys(node.id);
  const isRoot = isRootNode(node.id);
  const depth = getNodeDepth(node.id);
  const colorScheme = DEPTH_COLORS[depth % DEPTH_COLORS.length];

  // Apply depth-based color as CSS custom properties
  card.style.setProperty('--depth-accent', colorScheme.accent);
  card.style.setProperty('--depth-bg', colorScheme.bg);
  card.style.setProperty('--depth-border', colorScheme.border);

  // Header
  const header = document.createElement('div');
  header.className = 'node-header';
  header.style.borderLeft = `3px solid ${colorScheme.accent}`;

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'collapse-btn';
  collapseBtn.textContent = node.collapsed ? '▶' : '▼';
  collapseBtn.title = node.collapsed ? 'Expand' : 'Collapse';
  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onAction('toggle', node.id);
  });

  // Editable name — double-click to edit inline
  const nameEl = document.createElement('span');
  nameEl.className = 'node-name';
  nameEl.textContent = node.name;
  nameEl.title = 'Double-click to rename';
  nameEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startInlineNameEdit(nameEl, node, onAction);
  });

  const depthBadge = document.createElement('span');
  depthBadge.className = 'depth-badge';
  depthBadge.textContent = `L${depth}`;
  depthBadge.style.color = colorScheme.accent;

  header.appendChild(collapseBtn);
  header.appendChild(nameEl);
  header.appendChild(depthBadge);

  // Secondary parents indicator
  if (node.secondaryParentIds && node.secondaryParentIds.length > 0) {
    const secBadge = document.createElement('span');
    secBadge.className = 'sec-parent-badge';
    secBadge.title = 'Has secondary parents (parameter union)';
    const names = node.secondaryParentIds
      .map(id => { const n = getNode(id); return n ? n.name : '?'; })
      .join(', ');
    secBadge.textContent = `🔗 +${node.secondaryParentIds.length}`;
    secBadge.title = `Secondary: ${names}`;
    header.appendChild(secBadge);
  }

  card.appendChild(header);

  // Params table
  const paramKeys = Object.keys(effectiveParams);
  if (paramKeys.length > 0) {
    const table = document.createElement('table');
    table.className = 'params-table';

    paramKeys.forEach((key) => {
      const tr = document.createElement('tr');
      const isOverridden = overriddenKeys.has(key);

      tr.className = isOverridden ? 'param-overridden' : 'param-inherited';

      const tdKey = document.createElement('td');
      tdKey.className = 'param-key';
      tdKey.textContent = key;

      const tdVal = document.createElement('td');
      tdVal.className = 'param-value';
      tdVal.textContent = effectiveParams[key];

      if (!isOverridden && !isRoot) {
        const badge = document.createElement('span');
        badge.className = 'inherited-badge';
        badge.textContent = '↑';
        badge.title = 'Inherited from parent';
        tdVal.appendChild(badge);
      }

      tr.appendChild(tdKey);
      tr.appendChild(tdVal);
      table.appendChild(tr);
    });

    card.appendChild(table);
  }

  // Results section
  const results = node.results || {};
  const resultKeys = Object.keys(results);
  if (resultKeys.length > 0) {
    const resultsWrap = document.createElement('div');
    resultsWrap.className = 'node-results';

    const resultsTitle = document.createElement('div');
    resultsTitle.className = 'results-title';
    resultsTitle.textContent = '📊 Results';
    resultsWrap.appendChild(resultsTitle);

    const resultsGrid = document.createElement('div');
    resultsGrid.className = 'results-grid';

    resultKeys.forEach((key) => {
      if (!results[key]) return; // skip empty values
      const item = document.createElement('div');
      item.className = 'results-item';

      const label = document.createElement('span');
      label.className = 'results-label';
      label.textContent = key.replace(/_/g, ' ');

      const val = document.createElement('span');
      val.className = 'results-value';
      const num = parseFloat(results[key]);
      val.textContent = isNaN(num) ? results[key] : num.toFixed(4);

      item.appendChild(label);
      item.appendChild(val);
      resultsGrid.appendChild(item);
    });

    resultsWrap.appendChild(resultsGrid);
    card.appendChild(resultsWrap);
  }

  // Actions
  const actions = document.createElement('div');
  actions.className = 'node-actions';

  const btnAdd = createBtn('➕', 'Add Child', () => onAction('addChild', node.id));
  const btnEdit = createBtn('✏️', 'Edit', () => onAction('edit', node.id));
  const btnDup = createBtn('📋', 'Duplicate', () => onAction('duplicate', node.id));
  const btnDel = createBtn('🗑️', 'Delete', () => onAction('delete', node.id));

  actions.appendChild(btnAdd);
  actions.appendChild(btnEdit);
  actions.appendChild(btnDup);
  actions.appendChild(btnDel);
  card.appendChild(actions);

  // Child count badge
  if (node.children.length > 0 && node.collapsed) {
    const badge = document.createElement('div');
    badge.className = 'children-badge';
    badge.textContent = `${countDescendants(node)} hidden`;
    card.appendChild(badge);
  }

  // ── Drop zone for sidebar parameters ──
  card.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('application/hypertree-param')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      card.classList.add('param-drop-target');
    }
  });

  card.addEventListener('dragleave', (e) => {
    // Only remove if we actually left the card
    if (!card.contains(e.relatedTarget)) {
      card.classList.remove('param-drop-target');
    }
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('param-drop-target');
    const paramKey = e.dataTransfer.getData('application/hypertree-param');
    if (paramKey) {
      // Add parameter as override if not already present
      const currentOverrides = node.overrides || {};
      if (!(paramKey in currentOverrides)) {
        currentOverrides[paramKey] = '';
        updateNode(node.id, { overrides: currentOverrides });
        onAction('refresh', node.id);
      }
    }
  });

  return card;
}

// ─── Inline Name Editing ─────────────────────────────────

function startInlineNameEdit(nameEl, node, onAction) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-name-input';
  input.value = node.name;

  const commitEdit = () => {
    const newName = input.value.trim() || 'Untitled';
    updateNode(node.id, { name: newName });
    onAction('refresh', node.id);
  };

  input.addEventListener('blur', commitEdit);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.value = node.name; // revert
      input.blur();
    }
  });

  nameEl.replaceWith(input);
  input.focus();
  input.select();
}

// ─── Helpers ─────────────────────────────────────────────

function createBtn(icon, title, onClick) {
  const btn = document.createElement('button');
  btn.className = 'node-action-btn';
  btn.innerHTML = icon;
  btn.title = title;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function countDescendants(node) {
  let count = node.children.length;
  node.children.forEach((c) => (count += countDescendants(c)));
  return count;
}
