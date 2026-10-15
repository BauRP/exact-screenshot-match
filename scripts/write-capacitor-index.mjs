import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const clientDir = "dist/client";
const assetsDir = join(clientDir, "assets");
const marker = "wave-notes-capacitor-client-entry";

const files = await readdir(assetsDir);
let entryFile = "";

for (const file of files) {
  if (!file.endsWith(".js")) continue;
  const content = await readFile(join(assetsDir, file), "utf8");
  if (content.includes(marker)) {
    entryFile = file;
    break;
  }
}

if (!entryFile) {
  throw new Error("Capacitor client entry bundle was not found in dist/client/assets");
}

const cssFiles = files.filter((file) => file.endsWith(".css")).sort();
const cssLinks = cssFiles
  .map((file) => `    <link rel="stylesheet" href="./assets/${file}">`)
  .join("\n");

const html = `<!doctype html>
<html lang="ru" class="dark" style="color-scheme: dark;">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#121212">
    <title>Супер заметки</title>
    <link rel="icon" href="./favicon.ico" type="image/x-icon">
${cssLinks}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./assets/${entryFile}"></script>
  </body>
</html>
`;

await writeFile(join(clientDir, "index.html"), html);
console.log(`Wrote Capacitor SPA shell with ${entryFile}`);