// ─── Shared Parameter Links ─────────────────────────────
// Finds matching param key=value pairs across nodes and draws
// dashed SVG lines connecting them + highlights matching rows.

import { getEffectiveParams, getRoots } from './store.js';
import { getScale } from './tree.js';

// Color palette for shared param groups
const SHARED_COLORS = [
  '#f6ad55', // orange
  '#68d391', // green
  '#fc8181', // red
  '#63b3ed', // blue
  '#b794f4', // purple
  '#f687b3', // pink
  '#76e4f7', // cyan
  '#fbd38d', // yellow
  '#9ae6b4', // light green
  '#feb2b2', // light red
];

let sharedSvg = null;
let linksVisible = true;

export function initLinks() {
  sharedSvg = document.getElementById('shared-links');
}

/**
 * Collect all nodes from the tree into a flat list.
 */
function flattenNodes(nodes, list = []) {
  for (const node of nodes) {
    list.push(node);
    if (node.children && node.children.length > 0) {
      flattenNodes(node.children, list);
    }
  }
  return list;
}

/**
 * Find groups of nodes that share the same key=value pair.
 * Returns: Map<string, { color: string, nodeIds: string[] }>
 *   key format: "paramKey=paramValue"
 */
export function findSharedGroups(roots) {
  const allNodes = flattenNodes(roots);
  const paramMap = new Map(); // "key=value" -> [nodeId, ...]

  for (const node of allNodes) {
    const params = getEffectiveParams(node.id);
    for (const [key, value] of Object.entries(params)) {
      const groupKey = `${key}=${value}`;
      if (!paramMap.has(groupKey)) {
        paramMap.set(groupKey, []);
      }
      paramMap.get(groupKey).push(node.id);
    }
  }

  // Only keep groups with 2+ nodes
  const groups = new Map();
  let colorIdx = 0;
  for (const [groupKey, nodeIds] of paramMap) {
    if (nodeIds.length >= 2) {
      groups.set(groupKey, {
        color: SHARED_COLORS[colorIdx % SHARED_COLORS.length],
        nodeIds,
      });
      colorIdx++;
    }
  }

  return groups;
}

/**
 * Draw dashed SVG lines between nodes that share parameters.
 * Lines connect from the sides of the cards using smooth bezier curves.
 */
export function drawSharedLinks(roots) {
  if (!sharedSvg) return;
  sharedSvg.innerHTML = '';

  if (!linksVisible) return;

  const groups = findSharedGroups(roots);
  const canvas = document.getElementById('canvas');
  if (!canvas) return;
  const canvasRect = canvas.getBoundingClientRect();
  const scale = getScale();

  for (const [, group] of groups) {
    const { color, nodeIds } = group;

    // Draw lines between each pair
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const cardA = document.querySelector(`.node-card[data-id="${nodeIds[i]}"]`);
        const cardB = document.querySelector(`.node-card[data-id="${nodeIds[j]}"]`);
        if (!cardA || !cardB) continue;

        const rectA = cardA.getBoundingClientRect();
        const rectB = cardB.getBoundingClientRect();

        // Determine connection points on card sides (left or right edge)
        const centerAx = (rectA.left + rectA.width / 2 - canvasRect.left) / scale;
        const centerBx = (rectB.left + rectB.width / 2 - canvasRect.left) / scale;
        const centerAy = (rectA.top + rectA.height / 2 - canvasRect.top) / scale;
        const centerBy = (rectB.top + rectB.height / 2 - canvasRect.top) / scale;

        let x1, y1, x2, y2;

        // Connect from the closer sides
        if (centerAx <= centerBx) {
          // A is to the left, connect A's right to B's left
          x1 = (rectA.right - canvasRect.left) / scale;
          x2 = (rectB.left - canvasRect.left) / scale;
        } else {
          // A is to the right, connect A's left to B's right
          x1 = (rectA.left - canvasRect.left) / scale;
          x2 = (rectB.right - canvasRect.left) / scale;
        }
        y1 = centerAy;
        y2 = centerBy;

        // Bezier control points — horizontal curve
        const dx = Math.abs(x2 - x1);
        const cpOffset = Math.max(60, dx * 0.4);

        const cp1x = centerAx <= centerBx ? x1 + cpOffset : x1 - cpOffset;
        const cp2x = centerAx <= centerBx ? x2 - cpOffset : x2 + cpOffset;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`);
        path.setAttribute('class', 'shared-link-line');
        path.setAttribute('stroke', color);
        sharedSvg.appendChild(path);
      }
    }
  }
}

/**
 * Apply highlight colors to matching param rows in node cards.
 */
export function highlightSharedParams(roots) {
  const groups = findSharedGroups(roots);

  // Build a map: nodeId -> { paramKey -> color }
  const nodeColorMap = new Map();
  for (const [groupKey, group] of groups) {
    const paramKey = groupKey.split('=')[0];
    for (const nodeId of group.nodeIds) {
      if (!nodeColorMap.has(nodeId)) {
        nodeColorMap.set(nodeId, new Map());
      }
      nodeColorMap.get(nodeId).set(paramKey, group.color);
    }
  }

  // Apply colors to param rows
  document.querySelectorAll('.node-card').forEach((card) => {
    const nodeId = card.dataset.id;
    const colorMap = nodeColorMap.get(nodeId);
    if (!colorMap) return;

    const rows = card.querySelectorAll('.params-table tr');
    rows.forEach((row) => {
      const keyCell = row.querySelector('.param-key');
      if (!keyCell) return;
      const key = keyCell.textContent.trim();
      if (colorMap.has(key)) {
        row.classList.add('param-shared');
        row.style.setProperty('--shared-color', colorMap.get(key));
      }
    });
  });
}

/**
 * Toggle shared links visibility.
 */
export function toggleLinks() {
  linksVisible = !linksVisible;
  if (sharedSvg) {
    sharedSvg.style.display = linksVisible ? '' : 'none';
  }
  return linksVisible;
}

export function areLinksVisible() {
  return linksVisible;
}
