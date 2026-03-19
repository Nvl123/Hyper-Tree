const fs = require('fs');
let js = fs.readFileSync('src/main.js', 'utf8');

// fix 1
js = js.replace(/updateSearchUI\(\);[\r\n\s]+\}[\r\n\s]+\}/g, 'updateSearchUI();\n}');

// fix 2
js = js.replace(/updateSearchUI\(\);[\r\n\s]+\/\/\s*Theme toggle/g, 'updateSearchUI();\n});\n\n// Theme toggle');

fs.writeFileSync('src/main.js', js);
console.log('Done fixing');
