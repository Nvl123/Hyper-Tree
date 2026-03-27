import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY_BASE = 'hypertree_data';
let STORAGE_KEY = STORAGE_KEY_BASE;

// Default hyperparameters for root nodes
const DEFAULT_PARAMS = {
  learning_rate: '0.001',
  epochs: '50',
  batch_size: '32',
  optimizer: 'adam',
  dropout: '0.3',
};

/** @type {{ roots: object[], groups: object[] }} */
let treeData = { roots: [], groups: [] };

// ─── Helpers ──────────────────────────────────────────────

function findNodeAndParent(id, nodes = treeData.roots, parent = null) {
  for (const node of nodes) {
    if (node.id === id) return { node, parent, siblings: nodes };
    const found = findNodeAndParent(id, node.children, node);
    if (found) return found;
  }
  return null;
}

function getAncestorChain(id) {
  const chain = [];
  const result = findNodeAndParent(id);
  if (!result) return chain;

  chain.unshift(result.node);
  let current = result.parent;
  while (current) {
    chain.unshift(current);
    const parentResult = findNodeAndParent(current.id);
    current = parentResult ? parentResult.parent : null;
  }
  return chain;
}

function deepCloneNode(node, isRootClone = true, absoluteOpts = null) {
  const isAbs = isRootClone && absoluteOpts ? true : node.isAbsolute;
  const clonePos = isRootClone && absoluteOpts 
                     ? { x: absoluteOpts.x, y: absoluteOpts.y } 
                     : (node.position ? { x: node.position.x + (isRootClone ? 40 : 0), y: node.position.y + (isRootClone ? 40 : 0) } : undefined);

  return {
    id: uuidv4(),
    name: isRootClone ? node.name + ' (copy)' : node.name,
    overrides: { ...node.overrides },
    results: { ...(node.results || {}) },
    secondaryParentIds: node.secondaryParentIds ? [...node.secondaryParentIds] : [],
    position: clonePos,
    isAbsolute: isAbs,
    collapsed: node.collapsed,
    children: (node.children || []).map(child => deepCloneNode(child, false))
  };
}


// ─── Public API ───────────────────────────────────────────

export function getRoots() {
  return treeData.roots;
}

export function createRootNode() {
  const node = {
    id: uuidv4(),
    name: 'Root Experiment',
    overrides: {},
    results: {},
    children: [],
    collapsed: false,
  };
  treeData.roots.push(node);
  save();
  return node;
}

export function createChildNode(parentId) {
  const result = findNodeAndParent(parentId);
  if (!result) return null;

  const child = {
    id: uuidv4(),
    name: 'Child Experiment',
    overrides: {},
    results: {},
    children: [],
    collapsed: false,
  };
  result.node.children.push(child);
  save();
  return child;
}

export function updateNode(id, changes) {
  const result = findNodeAndParent(id);
  if (!result) return;
  Object.assign(result.node, changes);
  save();
}

export function deleteNode(id) {
  const result = findNodeAndParent(id);
  if (!result) return;
  const idx = result.siblings.indexOf(result.node);
  if (idx !== -1) result.siblings.splice(idx, 1);
  save();
}

export function duplicateNode(id, absoluteOpts = null) {
  const result = findNodeAndParent(id);
  if (!result) return null;
  const clone = deepCloneNode(result.node, true, absoluteOpts);
  const idx = result.siblings.indexOf(result.node);
  result.siblings.splice(idx + 1, 0, clone);
  save();
  return clone;
}

function getRawEffectiveParams(id, visited = new Set()) {
  if (visited.has(id)) return {};
  visited.add(id);

  const chain = getAncestorChain(id);
  const merged = {};

  for (const node of chain) {
    if (node.secondaryParentIds && node.secondaryParentIds.length > 0) {
      for (const spId of node.secondaryParentIds) {
        const spMerged = getRawEffectiveParams(spId, visited);
        for (const [key, val] of Object.entries(spMerged)) {
          if (!(key in merged)) {
            merged[key] = val;
          }
        }
      }
    }
    if (node.overrides) {
      Object.assign(merged, node.overrides);
    }
  }

  visited.delete(id);
  return merged;
}

export function getEffectiveParams(id) {
  const merged = getRawEffectiveParams(id);

  // Remove tombstones (keys explicitly deleted in child)
  const finalMerged = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v !== null) finalMerged[k] = v;
  }

  return finalMerged;
}

export function getInheritedParams(id) {
  const result = findNodeAndParent(id);
  // Root nodes have no parents thus no inherited params
  if (!result || !result.parent) return {};

  const node = result.node;
  const backup = node.overrides;
  node.overrides = {};
  const inherited = getEffectiveParams(id);
  node.overrides = backup;
  return inherited;
}

export function getOverriddenKeys(id) {
  const result = findNodeAndParent(id);
  if (!result) return new Set();
  return new Set(Object.keys(result.node.overrides));
}

export function getNode(id) {
  const result = findNodeAndParent(id);
  return result ? result.node : null;
}

export function isRootNode(id) {
  return treeData.roots.some(r => r.id === id);
}

/**
 * Get the depth of a node (0 = root).
 */
export function getNodeDepth(id) {
  const chain = getAncestorChain(id);
  return Math.max(0, chain.length - 1);
}

/**
 * Get all nodes as a flat array.
 */
export function getAllNodes() {
  const list = [];
  function walk(nodes) {
    for (const node of nodes) {
      list.push(node);
      if (node.children) walk(node.children);
    }
  }
  walk(treeData.roots);
  return list;
}

/**
 * Get the parent of a node (null if root).
 */
export function getParentNode(id) {
  const result = findNodeAndParent(id);
  return result ? result.parent : null;
}

// ─── Persistence ─────────────────────────────────────────

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(treeData));
  } catch (e) {
    console.warn('Failed to save to localStorage', e);
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      treeData = JSON.parse(raw);
      // Backward compat: old data may not have groups
      if (!Array.isArray(treeData.groups)) treeData.groups = [];
    }
  } catch (e) {
    console.warn('Failed to load from localStorage', e);
    treeData = { roots: [], groups: [] };
  }
}

export function setStorageNamespace(namespace) {
  const ns = String(namespace || '').trim();
  STORAGE_KEY = ns ? `${STORAGE_KEY_BASE}_${ns}` : STORAGE_KEY_BASE;
}

// ─── File Save / Load (File System Access API) ──────────

let fileHandle = null;

export function getCurrentFileName() {
  return fileHandle ? fileHandle.name : null;
}

export async function exportToJSON() {
  const jsonStr = JSON.stringify(treeData, null, 2);

  // If we already have a file handle, write directly to it
  if (fileHandle) {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(jsonStr);
      await writable.close();
      return;
    } catch (err) {
      // Permission revoked or handle invalid — fall through to picker
      console.warn('Could not write to existing handle, opening picker...', err);
      fileHandle = null;
    }
  }

  // Try File System Access API (Chrome/Edge)
  if (window.showSaveFilePicker) {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: 'hypertree.json',
        types: [{
          description: 'JSON Files',
          accept: { 'application/json': ['.json'] },
        }],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(jsonStr);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user cancelled
      console.warn('showSaveFilePicker failed, using fallback', err);
    }
  }

  // Fallback: classic download
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `hypertree-${Date.now()}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Groups API ──────────────────────────────────────────

export function getGroups() {
  return treeData.groups || [];
}

export function createGroup(name, color) {
  const group = { id: uuidv4(), name, color: color || '#63b3ed' };
  if (!Array.isArray(treeData.groups)) treeData.groups = [];
  treeData.groups.push(group);
  save();
  return group;
}

export function updateGroup(id, changes) {
  const group = (treeData.groups || []).find(g => g.id === id);
  if (!group) return;
  Object.assign(group, changes);
  save();
}

export function deleteGroup(id) {
  if (!Array.isArray(treeData.groups)) return;
  treeData.groups = treeData.groups.filter(g => g.id !== id);
  // Remove groupId from all nodes that belonged to this group
  function clearGroup(nodes) {
    for (const n of nodes) {
      if (n.groupId === id) n.groupId = null;
      if (n.children) clearGroup(n.children);
    }
  }
  clearGroup(treeData.roots);
  save();
}

export function setNodeGroup(nodeId, groupId) {
  const result = findNodeAndParent(nodeId);
  if (!result) return;
  result.node.groupId = groupId || null;
  save();
}

export async function importFromJSON() {
  // Try File System Access API
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'JSON Files',
          accept: { 'application/json': ['.json'] },
        }],
        multiple: false,
      });
      const file = await handle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      if (data && Array.isArray(data.roots)) {
        treeData = data;
        if (!Array.isArray(treeData.groups)) treeData.groups = [];
        fileHandle = handle; // remember handle for subsequent saves
        save();
        return true;
      } else {
        alert('Invalid file format: missing "roots" array.');
        return false;
      }
    } catch (err) {
      if (err.name === 'AbortError') return false; // user cancelled
      console.warn('showOpenFilePicker failed, using fallback', err);
    }
  }

  // Fallback: classic file input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) { resolve(false); return; }

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data && Array.isArray(data.roots)) {
            treeData = data;
            if (!Array.isArray(treeData.groups)) treeData.groups = [];
            fileHandle = null; // no handle in fallback mode
            save();
            resolve(true);
          } else {
            alert('Invalid file format: missing "roots" array.');
            resolve(false);
          }
        } catch (err) {
          alert('Failed to parse JSON file.');
          resolve(false);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  });
}
