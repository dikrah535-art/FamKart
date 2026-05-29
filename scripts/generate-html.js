import { readdirSync, writeFileSync } from "fs";
import { join } from "path";

const assetsDir = "dist/client/assets";
const files = readdirSync(assetsDir);

const cssFile = files.find(f => f.endsWith(".css") && f.includes("styles"));
const jsFile = files.find(f => f.endsWith(".js") && f.includes("index"));

if (!jsFile) {
  console.error("Could not find main JS bundle in dist/client/assets");
  process.exit(1);
}

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FamKart</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
    ${cssFile ? `<link rel="stylesheet" href="/assets/${cssFile}" />` : ""}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/${jsFile}"></script>
  </body>
</html>`;

writeFileSync("dist/client/index.html", html);
console.log("Generated dist/client/index.html");
console.log("  JS:", jsFile);
console.log("  CSS:", cssFile ?? "none");
