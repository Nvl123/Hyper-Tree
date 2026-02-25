// ─── Parameter Sidebar (Drag & Drop Source) ─────────────

const DEFAULT_ITEMS = [
  'learning_rate',
  'epochs',
  'batch_size',
  'optimizer',
  'dropout',
  'weight_decay',
  'momentum',
  'lr_scheduler',
  'num_layers',
  'hidden_size',
  'activation',
  'loss_function',
];

const STORAGE_KEY = 'hypertree_sidebar_items';

let sidebarEl, listEl, customItems;

export function initSidebar() {
  sidebarEl = document.getElementById('param-sidebar');
  listEl = document.getElementById('param-list');

  // Load custom items from localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    customItems = raw ? JSON.parse(raw) : [];
  } catch {
    customItems = [];
  }

  renderItems();

  // Toggle button
  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    sidebarEl.classList.toggle('collapsed');
  });

  // Add custom item
  const addInput = document.getElementById('sidebar-add-input');
  const addBtn = document.getElementById('sidebar-add-btn');

  addBtn.addEventListener('click', () => addCustomItem(addInput));
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCustomItem(addInput);
  });
}

function addCustomItem(input) {
  const val = input.value.trim();
  if (!val) return;
  if (customItems.includes(val) || DEFAULT_ITEMS.includes(val)) {
    input.value = '';
    return;
  }
  customItems.push(val);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customItems));
  input.value = '';
  renderItems();
}

function renderItems() {
  listEl.innerHTML = '';

  const allItems = [...DEFAULT_ITEMS, ...customItems];

  allItems.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'sidebar-item';
    el.draggable = true;
    el.dataset.paramKey = item;

    const icon = document.createElement('span');
    icon.className = 'sidebar-item-drag-icon';
    icon.textContent = '⠿';

    const label = document.createElement('span');
    label.className = 'sidebar-item-label';
    label.textContent = item;

    el.appendChild(icon);
    el.appendChild(label);

    // If custom, add delete button
    if (customItems.includes(item)) {
      const delBtn = document.createElement('button');
      delBtn.className = 'sidebar-item-del';
      delBtn.textContent = '✕';
      delBtn.title = 'Remove';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        customItems = customItems.filter((c) => c !== item);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(customItems));
        renderItems();
      });
      el.appendChild(delBtn);
    }

    // Drag events
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', item);
      e.dataTransfer.setData('application/hypertree-param', item);
      e.dataTransfer.effectAllowed = 'copy';
      el.classList.add('dragging');
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
    });

    listEl.appendChild(el);
  });
}
