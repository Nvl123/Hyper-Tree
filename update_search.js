const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(
  '<button id="btn-search-next" class="toolbar-btn small hidden" title="Next match">↓</button>',
  '<button id="btn-search-next" class="toolbar-btn small hidden" title="Next match">↓</button>\n        <button id="btn-search-clear" class="toolbar-btn small hidden" title="Clear search">✕</button>'
);
fs.writeFileSync('index.html', html);

let js = fs.readFileSync('src/main.js', 'utf8');

js = js.replace(
  "const counter = document.getElementById('search-counter');\r\n  const btnPrev = document.getElementById('btn-search-prev');\r\n  const btnNext = document.getElementById('btn-search-next');",
  "const counter = document.getElementById('search-counter');\n  const btnPrev = document.getElementById('btn-search-prev');\n  const btnNext = document.getElementById('btn-search-next');\n  const btnClear = document.getElementById('btn-search-clear');\n  const input = document.getElementById('input-search-node');"
) || js.replace(
  "const counter = document.getElementById('search-counter');\n  const btnPrev = document.getElementById('btn-search-prev');\n  const btnNext = document.getElementById('btn-search-next');",
  "const counter = document.getElementById('search-counter');\n  const btnPrev = document.getElementById('btn-search-prev');\n  const btnNext = document.getElementById('btn-search-next');\n  const btnClear = document.getElementById('btn-search-clear');\n  const input = document.getElementById('input-search-node');"
);

js = js.replace(
  "btnNext.classList.add('hidden');\r\n  }\r\n}",
  "btnNext.classList.add('hidden');\n  }\n\n  if (btnClear && input) {\n    if (input.value.trim() !== '') {\n      btnClear.classList.remove('hidden');\n    } else {\n      btnClear.classList.add('hidden');\n    }\n  }\n}\n\nfunction handleSearchClear() {\n  const input = document.getElementById('input-search-node');\n  if (input) {\n    input.value = '';\n    input.style.borderColor = '';\n  }\n  searchMatches = [];\n  searchIndex = -1;\n  lastQuery = '';\n  updateSearchUI();\n}"
) || js.replace(
  "btnNext.classList.add('hidden');\n  }\n}",
  "btnNext.classList.add('hidden');\n  }\n\n  if (btnClear && input) {\n    if (input.value.trim() !== '') {\n      btnClear.classList.remove('hidden');\n    } else {\n      btnClear.classList.add('hidden');\n    }\n  }\n}\n\nfunction handleSearchClear() {\n  const input = document.getElementById('input-search-node');\n  if (input) {\n    input.value = '';\n    input.style.borderColor = '';\n  }\n  searchMatches = [];\n  searchIndex = -1;\n  lastQuery = '';\n  updateSearchUI();\n}"
);

js = js.replace(
  "document.getElementById('btn-search-node').addEventListener('click', handleSearchNode);",
  "const btnClearId = document.getElementById('btn-search-clear');\nif (btnClearId) btnClearId.addEventListener('click', handleSearchClear);\n\ndocument.getElementById('btn-search-node').addEventListener('click', handleSearchNode);"
);

js = js.replace(
  "     e.target.style.borderColor = '';\r\n  }\r\n});",
  "     e.target.style.borderColor = '';\n  }\n});\n\ndocument.getElementById('input-search-node').addEventListener('input', () => {\n  updateSearchUI();\n});"
) || js.replace(
  "     e.target.style.borderColor = '';\n  }\n});",
  "     e.target.style.borderColor = '';\n  }\n});\n\ndocument.getElementById('input-search-node').addEventListener('input', () => {\n  updateSearchUI();\n});"
);

fs.writeFileSync('src/main.js', js);
console.log('Update Complete!');
