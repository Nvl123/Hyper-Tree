import { getEffectiveParams, getOverriddenKeys, getNode, isRootNode } from './store.js';

let modalEl, backdropEl;
let currentResolve = null;

export function initModal() {
  modalEl = document.getElementById('modal');
  backdropEl = document.getElementById('modal-backdrop');

  backdropEl.addEventListener('click', () => closeModal(null));
}

/**
 * Open the edit modal for a node.
 * Returns a Promise that resolves with { name, overrides } or null if cancelled.
 */
export function openEditModal(nodeId) {
  return new Promise((resolve) => {
    currentResolve = resolve;

    const node = getNode(nodeId);
    if (!node) { resolve(null); return; }

    const effectiveParams = getEffectiveParams(nodeId);
    const overriddenKeys = getOverriddenKeys(nodeId);
    const isRoot = isRootNode(nodeId);

    modalEl.innerHTML = '';
    modalEl.classList.remove('hidden');
    backdropEl.classList.remove('hidden');

    // ── Modal content ──
    const container = document.createElement('div');
    container.className = 'modal-content';

    // Title
    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = 'Edit Experiment';
    container.appendChild(title);

    // Name field
    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Experiment Name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'form-input';
    nameInput.id = 'modal-name-input';
    nameInput.value = node.name;
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    container.appendChild(nameGroup);

    // Params section
    const paramTitle = document.createElement('h3');
    paramTitle.className = 'modal-subtitle';
    paramTitle.textContent = 'Hyperparameters';
    container.appendChild(paramTitle);

    if (!isRoot) {
      const legend = document.createElement('div');
      legend.className = 'modal-legend';
      legend.innerHTML = '<span class="legend-inherited">■ Inherited (read-only)</span> <span class="legend-overridden">■ Overridden (editable)</span>';
      container.appendChild(legend);
    }

    // Params table
    const tableWrap = document.createElement('div');
    tableWrap.className = 'modal-table-wrap';
    const table = document.createElement('table');
    table.className = 'modal-params-table';
    table.id = 'modal-params-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Key</th><th>Value</th><th></th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.id = 'modal-params-tbody';

    // Render rows
    const allKeys = Object.keys(effectiveParams);
    allKeys.forEach((key) => {
      const isOverridden = overriddenKeys.has(key);
      const row = createParamRow(key, effectiveParams[key], isOverridden, isRoot);
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);

    // Add row button
    const addRowBtn = document.createElement('button');
    addRowBtn.className = 'modal-btn add-row-btn';
    addRowBtn.textContent = '＋ Add Parameter';
    addRowBtn.addEventListener('click', () => {
      const row = createParamRow('', '', true, true);
      tbody.appendChild(row);
      row.querySelector('.param-key-input').focus();
    });
    container.appendChild(addRowBtn);

    // ── Results Section ──
    const resultsTitle = document.createElement('h3');
    resultsTitle.className = 'modal-subtitle';
    resultsTitle.textContent = '📊 Results';
    container.appendChild(resultsTitle);

    // Guide hint
    const resultsHint = document.createElement('div');
    resultsHint.className = 'modal-results-hint';
    resultsHint.innerHTML = '💡 Gunakan <strong>titik</strong> sebagai desimal (contoh: <code>0.4134</code>). Koma akan otomatis dikonversi. Ditampilkan 4 angka di belakang koma.';
    container.appendChild(resultsHint);

    const RESULT_FIELDS = [
      'bleu_1', 'bleu_2', 'bleu_3', 'bleu_4',
      'meteor', 'rouge_l', 'cider', 'spice',
      'loss', 'accuracy',
    ];

    const currentResults = node.results || {};
    const resultsGrid = document.createElement('div');
    resultsGrid.className = 'modal-results-grid';
    resultsGrid.id = 'modal-results-grid';

    RESULT_FIELDS.forEach((field) => {
      const group = document.createElement('div');
      group.className = 'modal-result-field';

      const label = document.createElement('label');
      label.textContent = field.replace(/_/g, ' ').toUpperCase();

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'result-input';
      input.dataset.resultKey = field;
      input.placeholder = '0.0000';

      // Format existing value to 4 decimals
      const rawVal = currentResults[field];
      if (rawVal !== undefined && rawVal !== '' && rawVal !== null) {
        const num = parseFloat(String(rawVal).replace(',', '.'));
        input.value = isNaN(num) ? rawVal : num.toFixed(4);
      }

      // Auto-convert comma to period on input
      input.addEventListener('input', () => {
        input.value = input.value.replace(',', '.');
      });

      // Validate on blur
      input.addEventListener('blur', () => {
        const val = input.value.trim();
        if (val === '') {
          input.classList.remove('result-input-error');
          return;
        }
        const num = parseFloat(val);
        if (isNaN(num)) {
          input.classList.add('result-input-error');
        } else {
          input.classList.remove('result-input-error');
          input.value = num.toFixed(4);
        }
      });

      group.appendChild(label);
      group.appendChild(input);
      resultsGrid.appendChild(group);
    });

    container.appendChild(resultsGrid);

    // Warning message (hidden initially)
    const warningMsg = document.createElement('div');
    warningMsg.className = 'modal-warning hidden';
    warningMsg.id = 'modal-validation-warning';
    warningMsg.textContent = '⚠️ Ada input hasil yang tidak valid. Pastikan semua kolom berisi angka atau kosong.';
    container.appendChild(warningMsg);

    // Action buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => closeModal(null));

    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      // Validate all result inputs before saving
      const resultInputs = resultsGrid.querySelectorAll('.result-input');
      let hasError = false;

      resultInputs.forEach((input) => {
        const val = input.value.trim();
        if (val === '') {
          input.classList.remove('result-input-error');
          return;
        }
        const num = parseFloat(val);
        if (isNaN(num)) {
          input.classList.add('result-input-error');
          hasError = true;
        } else {
          input.classList.remove('result-input-error');
          input.value = num.toFixed(4);
        }
      });

      if (hasError) {
        warningMsg.classList.remove('hidden');
        // Scroll to warning
        warningMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return; // Block save
      }

      warningMsg.classList.add('hidden');
      const result = collectFormData(nameInput, tbody, isRoot, resultsGrid);
      closeModal(result);
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    container.appendChild(btnRow);

    modalEl.appendChild(container);

    // Focus name input
    setTimeout(() => nameInput.focus(), 100);

    // Escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal(null);
        window.removeEventListener('keydown', escHandler);
      }
    };
    window.addEventListener('keydown', escHandler);
  });
}

function createParamRow(key, value, isEditable, isRoot) {
  const tr = document.createElement('tr');
  tr.className = isEditable ? 'modal-row-overridden' : 'modal-row-inherited';

  const tdKey = document.createElement('td');
  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.className = 'param-key-input';
  keyInput.value = key;
  keyInput.readOnly = !isEditable;
  if (!isEditable) keyInput.classList.add('readonly');
  tdKey.appendChild(keyInput);

  const tdVal = document.createElement('td');
  const valInput = document.createElement('input');
  valInput.type = 'text';
  valInput.className = 'param-value-input';
  valInput.value = value;

  if (!isEditable) {
    valInput.readOnly = true;
    valInput.classList.add('readonly');

    // Allow clicking to override
    valInput.addEventListener('dblclick', () => {
      valInput.readOnly = false;
      valInput.classList.remove('readonly');
      keyInput.readOnly = false;
      keyInput.classList.remove('readonly');
      tr.className = 'modal-row-overridden';
      valInput.focus();
    });
  }
  tdVal.appendChild(valInput);

  const tdAction = document.createElement('td');
  if (isEditable || isRoot) {
    const delBtn = document.createElement('button');
    delBtn.className = 'param-del-btn';
    delBtn.textContent = '✕';
    delBtn.title = 'Remove parameter';
    delBtn.addEventListener('click', () => tr.remove());
    tdAction.appendChild(delBtn);
  }

  tr.appendChild(tdKey);
  tr.appendChild(tdVal);
  tr.appendChild(tdAction);

  return tr;
}

function collectFormData(nameInput, tbody, isRoot, resultsGrid) {
  const overrides = {};
  const rows = tbody.querySelectorAll('tr');

  rows.forEach((row) => {
    const keyEl = row.querySelector('.param-key-input');
    const valEl = row.querySelector('.param-value-input');
    if (!keyEl || !valEl) return;

    const key = keyEl.value.trim();
    const val = valEl.value.trim();
    if (!key) return;

    // If row is overridden (editable) or is root, include it
    const isOverridden = row.classList.contains('modal-row-overridden');
    if (isOverridden || isRoot) {
      overrides[key] = val;
    }
  });

  // Collect results
  const results = {};
  if (resultsGrid) {
    resultsGrid.querySelectorAll('.result-input').forEach((input) => {
      const key = input.dataset.resultKey;
      const val = input.value.trim();
      if (key && val) {
        results[key] = val;
      }
    });
  }

  return {
    name: nameInput.value.trim() || 'Untitled',
    overrides,
    results,
  };
}

function closeModal(result) {
  modalEl.classList.add('hidden');
  backdropEl.classList.add('hidden');
  if (currentResolve) {
    currentResolve(result);
    currentResolve = null;
  }
}
