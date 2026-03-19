$c = Get-Content src\main.js -Raw
$c = $c -replace '(?s)updateSearchUI\(\);\r?\n\s*\}\r?\n\s*\}\r?\n\r?\nfunction handleSearchNode\(\) \{', "updateSearchUI();`r`n}`r`n`r`nfunction handleSearchNode() {"
$c = $c -replace '(?s)document\.getElementById\(''input-search-node''\)\.addEventListener\(''input'', \(\) => \{\r?\n\s*updateSearchUI\(\);\r?\n\r?\n// Theme toggle', "document.getElementById('input-search-node').addEventListener('input', () => {`r`n  updateSearchUI();`r`n});`r`n`r`n// Theme toggle"
Set-Content src\main.js $c
Write-Host "Fixed syntax"
