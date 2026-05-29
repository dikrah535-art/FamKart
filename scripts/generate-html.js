import { readdirSync, writeFileSync, statSync } from "fs";

const assetsDir = "dist/client/assets";
const files = readdirSync(assetsDir);

let mainJs = null;
let maxSize = 0;
for (const f of files.filter(f => f.endsWith(".js"))) {
  const size = statSync(`${assetsDir}/${f}`).size;
  if (size > maxSize) { maxSize = size; mainJs = f; }
}

const mainCss = files.find(f => f.endsWith(".css"));

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
console.log("Generated index.html — JS:", mainJs, "CSS:", mainCss);
