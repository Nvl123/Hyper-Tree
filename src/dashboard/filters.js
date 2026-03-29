import { state } from './state.js';
import { METRICS, METRIC_LABELS, LOSS_ACC_METRICS, LOSS_ACC_LABELS, CHART_COLORS } from './constants.js';

export function buildFilters() {
  const container = document.getElementById('filter-container');
  if (!container) return;
  container.innerHTML = '';

  // — Group selection —
  if (state.allGroups.length > 0) {
    const groupSection = document.createElement('div');
    groupSection.className = 'filter-group';

    const groupTitle = document.createElement('div');
    groupTitle.className = 'filter-title';
    groupTitle.textContent = '📁 Filter by Group';
    groupSection.appendChild(groupTitle);

    const groupList = document.createElement('div');
    groupList.className = 'filter-checklist';
    groupList.id = 'group-checklist';

    state.allGroups.forEach((group) => {
      const label = document.createElement('label');
      label.className = 'filter-check-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.groupId = group.id;

      // Determine initial state
      const experimentsInGroup = state.allExperiments.filter(e => e.groupId === group.id);
      const selectedInGroup = experimentsInGroup.filter(e => state.selectedIds.has(e.id));

      if (selectedInGroup.length === experimentsInGroup.length && experimentsInGroup.length > 0) {
        checkbox.checked = true;
      } else if (selectedInGroup.length > 0) {
        checkbox.indeterminate = true;
      }

      checkbox.addEventListener('change', () => {
        experimentsInGroup.forEach(exp => {
          if (checkbox.checked) state.selectedIds.add(exp.id);
          else state.selectedIds.delete(exp.id);
        });
        updateCheckboxes();
        if (state.onRefresh) state.onRefresh();
      });

      const dot = document.createElement('span');
      dot.className = 'filter-color-dot';
      dot.style.background = group.color || '#ccc';

      const text = document.createElement('span');
      text.className = 'filter-check-label';
      text.textContent = group.name;

      label.appendChild(checkbox);
      label.appendChild(dot);
      label.appendChild(text);
      groupList.appendChild(label);
    });

    groupSection.appendChild(groupList);
    container.appendChild(groupSection);
  }

  // — Experiment selection —
  const expSection = document.createElement('div');
  expSection.className = 'filter-group';

  const expTitle = document.createElement('div');
  expTitle.className = 'filter-title';
  expTitle.textContent = '🧪 Experiments';
  expSection.appendChild(expTitle);

  const expBtns = document.createElement('div');
  expBtns.className = 'filter-actions';

  const selectAllBtn = document.createElement('button');
  selectAllBtn.className = 'filter-action-btn';
  selectAllBtn.textContent = 'Select All';
  selectAllBtn.addEventListener('click', () => {
    state.selectedIds = new Set(state.allExperiments.map(e => e.id));
    updateCheckboxes();
    if (state.onRefresh) state.onRefresh();
  });

  const deselectAllBtn = document.createElement('button');
  deselectAllBtn.className = 'filter-action-btn';
  deselectAllBtn.textContent = 'Deselect All';
  deselectAllBtn.addEventListener('click', () => {
    state.selectedIds.clear();
    updateCheckboxes();
    if (state.onRefresh) state.onRefresh();
  });

  expBtns.appendChild(selectAllBtn);
  expBtns.appendChild(deselectAllBtn);
  expSection.appendChild(expBtns);

  const expList = document.createElement('div');
  expList.className = 'filter-checklist';
  expList.id = 'exp-checklist';

  state.allExperiments.forEach((exp, i) => {
    const label = document.createElement('label');
    label.className = 'filter-check-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedIds.has(exp.id);
    checkbox.dataset.expId = exp.id;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selectedIds.add(exp.id);
      else state.selectedIds.delete(exp.id);
      if (state.onRefresh) state.onRefresh();
      updateCheckboxes();
    });

    const dot = document.createElement('span');
    dot.className = 'filter-color-dot';
    dot.style.background = CHART_COLORS[i % CHART_COLORS.length];

    const text = document.createElement('span');
    text.className = 'filter-check-label';
    text.textContent = exp.name;

    label.appendChild(checkbox);
    label.appendChild(dot);
    label.appendChild(text);
    expList.appendChild(label);
  });

  expSection.appendChild(expList);
  container.appendChild(expSection);

  // — Metric selection —
  const currentMetricsList = state.viewMode === 'lossacc' ? LOSS_ACC_METRICS : METRICS;
  const currentMetricLabels = state.viewMode === 'lossacc' ? LOSS_ACC_LABELS : METRIC_LABELS;
  const currentSelectedMetrics = state.viewMode === 'lossacc' ? state.selectedLAMetrics : state.selectedMetrics;

  const metSection = document.createElement('div');
  metSection.className = 'filter-group';

  const metTitle = document.createElement('div');
  metTitle.className = 'filter-title';
  let titleText = '📏 Metrics';
  if (state.viewMode === 'lossacc') titleText = '📉 Loss & Acc Metrics';
  else if (state.viewMode === 'correlation') titleText = '🔗 Eval Metrics (Sumbu X)';
  metTitle.textContent = titleText;
  metSection.appendChild(metTitle);

  const metList = document.createElement('div');
  metList.className = 'filter-checklist';
  metList.id = 'metric-checklist';

  currentMetricsList.forEach((m) => {
    const label = document.createElement('label');
    label.className = 'filter-check-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = currentSelectedMetrics.has(m);
    checkbox.dataset.metric = m;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) currentSelectedMetrics.add(m);
      else currentSelectedMetrics.delete(m);
      if (state.onRefresh) state.onRefresh();
    });

    const text = document.createElement('span');
    text.className = 'filter-check-label';
    text.textContent = currentMetricLabels[m];

    label.appendChild(checkbox);
    label.appendChild(text);
    metList.appendChild(label);
  });

  metSection.appendChild(metList);
  container.appendChild(metSection);

  // — Sort —
  const sortSection = document.createElement('div');
  sortSection.className = 'filter-group';

  const sortTitle = document.createElement('div');
  sortTitle.className = 'filter-title';
  sortTitle.textContent = '↕️ Sort By';
  sortSection.appendChild(sortTitle);

  const sortSelect = document.createElement('select');
  sortSelect.className = 'filter-select';
  sortSelect.innerHTML = `<option value="">Overall Rank</option>` +
    currentMetricsList.map(m => `<option value="${m}" ${state.sortMetric === m ? 'selected' : ''}>${currentMetricLabels[m]}</option>`).join('');
  sortSelect.addEventListener('change', () => {
    state.sortMetric = sortSelect.value;
    if (state.onRefresh) state.onRefresh();
  });
  sortSection.appendChild(sortSelect);

  const sortDirBtn = document.createElement('button');
  sortDirBtn.className = 'filter-action-btn sort-dir-btn';
  sortDirBtn.textContent = state.sortDir === 'desc' ? '↓ Highest First' : '↑ Lowest First';
  sortDirBtn.addEventListener('click', () => {
    state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
    sortDirBtn.textContent = state.sortDir === 'desc' ? '↓ Highest First' : '↑ Lowest First';
    if (state.onRefresh) state.onRefresh();
  });
  sortSection.appendChild(sortDirBtn);

  container.appendChild(sortSection);
}

export function updateCheckboxes() {
  // Update experiment checkboxes
  document.querySelectorAll('#exp-checklist input[type="checkbox"]').forEach((cb) => {
    cb.checked = state.selectedIds.has(cb.dataset.expId);
  });

  // Update group checkboxes
  document.querySelectorAll('#group-checklist input[type="checkbox"]').forEach((cb) => {
    const gid = cb.dataset.groupId;
    const experimentsInGroup = state.allExperiments.filter(e => e.groupId === gid);
    const selectedInGroup = experimentsInGroup.filter(e => state.selectedIds.has(e.id));

    if (selectedInGroup.length === experimentsInGroup.length && experimentsInGroup.length > 0) {
      cb.checked = true;
      cb.indeterminate = false;
    } else if (selectedInGroup.length > 0) {
      cb.checked = false;
      cb.indeterminate = true;
    } else {
      cb.checked = false;
      cb.indeterminate = false;
    }
  });
}
