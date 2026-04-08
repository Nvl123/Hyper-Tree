import { toPng } from 'html-to-image';
import { getAllNodes, getEffectiveParams, getGroups, getParentNode, isRootNode } from './store.js';

/**
 * Export the entire tree canvas to PNG and trigger download.
 */
export async function exportTreeAsPng() {
  const canvas = document.getElementById('canvas');
  if (!canvas) return;

  // Temporarily reset transform for a clean capture
  const originalTransform = canvas.style.transform;
  canvas.style.transform = 'none';

  // Wait for reflow
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const dataUrl = await toPng(canvas, {
      backgroundColor: '#0f1117',
      pixelRatio: 2,
      filter: (node) => {
        // Exclude the SVG connections from being filtered (include everything)
        return true;
      },
    });

    const link = document.createElement('a');
    link.download = `hypertree-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error('Export failed:', err);
    alert('Export failed. Please try again.');
  } finally {
    canvas.style.transform = originalTransform;
  }
}

/**
 * Export the tree nodes, hyperparameters, and results to a CSV file.
 */
export function exportTreeAsCsv() {
  const nodes = getAllNodes();
  if (!nodes || nodes.length === 0) {
    alert('No nodes to export.');
    return;
  }

  // Define result metrics
  const RESULT_FIELDS = [
    'bleu_1', 'bleu_2', 'bleu_3', 'bleu_4',
    'meteor', 'rouge_l', 'cider', 'spice',
    'loss', 'accuracy',
  ];

  function getResultValue(results, field) {
    if (!results || typeof results !== 'object') return '';
    const candidates = [
      field,
      field.toLowerCase(),
      field.toUpperCase(),
      field.replace(/_/g, ''),
      field.replace(/_/g, '-'),
      field.replace(/_/g, ' '),
    ];
    for (const key of candidates) {
      if (Object.prototype.hasOwnProperty.call(results, key)) {
        return results[key];
      }
    }
    return '';
  }

  // Gather all unique hyperparameters keys
  const allParamKeys = new Set();
  nodes.forEach((node) => {
    const params = getEffectiveParams(node.id) || {};
    Object.keys(params).forEach((k) => allParamKeys.add(k));
  });
  const paramKeys = Array.from(allParamKeys).sort();

  // Create Header Row
  const headers = [
    'Node Name',
    'Node ID',
    'Node Type',
    'Group ID',
    'Group Name',
    'Parent ID',
    'Parent Name',
    'Secondary Parent IDs',
    'Secondary Parent Names',
    'Children Count',
    'Children Names',
    'Results Info',
    'Parameters Info',
    ...paramKeys,
    ...RESULT_FIELDS.map((f) => f.toUpperCase().replace('_', ' ')),
  ];

  const rows = [headers];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const groupById = new Map((getGroups() || []).map((g) => [g.id, g]));

  nodes.forEach((node) => {
    const isRoot = isRootNode(node.id);
    const params = getEffectiveParams(node.id) || {};
    const results = node.results || {};
    const group = node.groupId ? groupById.get(node.groupId) : null;
    const parent = getParentNode(node.id);
    const secondaryParentIds = Array.isArray(node.secondaryParentIds) ? node.secondaryParentIds : [];
    const secondaryParentNames = secondaryParentIds
      .map((id) => nodeById.get(id)?.name || '')
      .filter(Boolean);
    const childrenNames = (node.children || []).map((child) => child.name).filter(Boolean);

    // Keterangan parameter format: "param_a = val_a, param_b = val_b"
    const paramInfoStr = Object.entries(params)
      .map(([k, v]) => `${k} = ${v}`)
      .join(' | ');
    const resultInfoStr = RESULT_FIELDS
      .map((field) => {
        const val = getResultValue(results, field);
        return (val !== undefined && val !== null && val !== '') ? `${field} = ${val}` : '';
      })
      .filter(Boolean)
      .join(' | ');

    const row = [
      node.name,
      node.id,
      isRoot ? 'Root' : 'Child',
      node.groupId || '',
      group?.name || '',
      parent?.id || '',
      parent?.name || '',
      secondaryParentIds.join(' | '),
      secondaryParentNames.join(' | '),
      String((node.children || []).length),
      childrenNames.join(' | '),
      resultInfoStr,
      paramInfoStr
    ];

    // Add dynamic parameter columns
    paramKeys.forEach((key) => {
      row.push(params[key] !== undefined ? params[key] : '');
    });

    // Add result columns
    RESULT_FIELDS.forEach((field) => {
      const val = getResultValue(results, field);
      row.push(val !== undefined && val !== null && val !== '' ? String(val).replace('.', ',') : '');
    });

    rows.push(row);
  });

  // Convert to CSV safely
  const csvContent = rows
    .map((r) =>
      r.map((val) => {
        const strVal = String(val || '');
        // Escape quotes, commas, newlines
        if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n') || strVal.includes('\r')) {
          return `"${strVal.replace(/"/g, '""')}"`;
        }
        return strVal;
      }).join(',')
    )
    .join('\n');

  // Create download link
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `hypertree-export-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
