import { readdirSync, writeFileSync, existsSync } from "fs";

const assetsDir = "dist/client/assets";

if (!existsSync(assetsDir)) {
  console.error("dist/client/assets not found");
  process.exit(1);
}

const files = readdirSync(assetsDir);
console.log("All files in dist/client/assets:", files);

const cssFiles = files.filter(f => f.endsWith(".css"));
const jsFiles = files.filter(f => f.endsWith(".js"));

// Pick the largest JS file — that's the main bundle
let mainJs = null;
let maxSize = 0;
import { statSync } from "fs";
for (const f of jsFiles) {
  const size = statSync(`${assetsDir}/${f}`).size;
  console.log(`  ${f} → ${(size / 1024).toFixed(1)} kB`);
  if (size > maxSize) {
    maxSize = size;
    mainJs = f;
  }
}

// Pick the largest CSS file
let mainCss = null;
let maxCssSize = 0;
for (const f of cssFiles) {
  const size = statSync(`${assetsDir}/${f}`).size;
  if (size > maxCssSize) {
    maxCssSize = size;
    mainCss = f;
  }
}

if (!mainJs) {
  console.error("No JS files found in dist/client/assets");
  process.exit(1);
}

console.log("Selected JS:", mainJs);
console.log("Selected CSS:", mainCss ?? "none");

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FamKart</title>
    ${mainCss ? `<link rel="stylesheet" href="/assets/${mainCss}" />` : ""}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/${mainJs}"></script>
  </body>
</html>`;

writeFileSync("dist/client/index.html", html);
console.log("✓ Generated dist/client/index.html");
