export function flattenNodes(nodes, list = []) {
  for (const node of nodes) {
    list.push(node);
    if (node.children) flattenNodes(node.children, list);
  }
  return list;
}

export function calculateDiff(val, base) {
  const diff = val - base;
  if (base === 0) return { diff, pct: (diff > 0 ? 100 : 0).toFixed(2) };
  const pct = (diff / base) * 100;
  return { diff, pct: pct.toFixed(2) };
}

export function getMetricMax(metric, experiments) {
  if (metric === 'cider') return 10.0;
  if (metric === 'spice') return 1.0;
  if (metric === 'loss') {
    const mx = Math.max(...experiments.map(e => parseFloat(e.results.loss) || 0));
    return mx > 0 ? mx : 1.0;
  }
  return 1.0;
}

/**
 * Heuristic Significance Proxy
 */
export const significanceHeuristic = {
  isSuperior: (val, base) => (val - base) > 0.015,
  isInferior: (val, base) => (val - base) < -0.015,
};
