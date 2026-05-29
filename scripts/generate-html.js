import { readdirSync, writeFileSync } from "fs";

const assetsDir = "dist/client/assets";
const files = readdirSync(assetsDir);

const cssFile = files.find(f => f.endsWith(".css"));
const jsFile = files.find(f => f.endsWith(".js") && f.startsWith("index"));

if (!jsFile) {
  const allJs = files.filter(f => f.endsWith(".js"));
  console.error("Could not find main JS bundle. Found:", allJs);
  process.exit(1);
}

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FamKart</title>
    ${cssFile ? `<link rel="stylesheet" href="/assets/${cssFile}" />` : ""}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/${jsFile}"></script>
  </body>
</html>`;

writeFileSync("dist/client/index.html", html);
console.log("✓ Generated dist/client/index.html");
console.log("  JS:", jsFile);
console.log("  CSS:", cssFile ?? "none");
