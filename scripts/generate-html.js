const fs = require('fs');
const path = require('path');

const clientDir = path.join(process.cwd(), 'dist/client');
const assetsDir = path.join(clientDir, 'assets');
const files = fs.readdirSync(assetsDir);

const cssFile = files.find(f => f.startsWith('styles-') && f.endsWith('.css'));
const mainJs = files.find(f => 
  f.startsWith('index-') && 
  f.endsWith('.js') && 
  fs.statSync(path.join(assetsDir, f)).size > 500000
);

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FamKart — Family Household Manager</title>
    ${cssFile ? `<link rel="stylesheet" href="/assets/${cssFile}" />` : ''}
  </head>
  <body>
    <div id="root"></div>
    ${mainJs ? `<script type="module" src="/assets/${mainJs}"></script>` : ''}
  </body>
</html>`;

fs.writeFileSync(path.join(clientDir, 'index.html'), html);
console.log('Generated dist/client/index.html');
console.log('CSS:', cssFile);
console.log('JS:', mainJs);
