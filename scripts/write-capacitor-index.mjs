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

/**
 * Tailwind v4 CSS uses cascade layers and modern color functions, which are
 * unsupported by Android 8/10 WebView. Keep modern CSS untouched, but generate
 * an explicit legacy-only CSS asset from the actual compiled utility classes.
 * Source parity: no hand-maintained reduced set of screen styles.
 */
import postcss from "postcss";
import { transform as transformCss, browserslistToTargets } from "lightningcss";
import browserslist from "browserslist";

function toSrgb(oklch) {
  const parts = oklch.trim().match(/^([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?$/);
  if (!parts) return null;
  const L = Number(parts[1]), C = Number(parts[2]);
  const h = Number(parts[3]) * Math.PI / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
    -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
    -0.0041960863*l - 0.7034186147*m + 1.707614701*s];
  const bytes = rgb.map(v => {
    const c = v <= 0.0031308 ? 12.92*v : 1.055*Math.pow(v,1/2.4)-0.055;
    return Math.round(Math.max(0, Math.min(1,c))*255);
  });
  if (parts[4] !== undefined) {
    const alpha = Math.max(0, Math.min(1, Number(parts[4]) / (parts[5] === "%" ? 100 : 1)));
    return "rgba(" + bytes.join(",") + "," + alpha + ")";
  }
  return "rgb(" + bytes.join(",") + ")";
}
function legacyColorValue(value) {
  return value
    .replace(/oklch\(([^)]+)\)/g, (whole, color) => toSrgb(color) ?? whole)
    .replace(/color-mix\(in [a-z-]+,\s*(var\(--[\w-]+\))\s+[\d.]+%,\s*transparent\)/g,
      (_whole, foreground) => foreground);
}
const legacyOutput = [];
for (const file of cssFiles) {
  const css = await readFile(join(assetsDir, file), "utf8");
  const root = postcss.parse(css, { from: file });
  root.walkAtRules("layer", atRule => {
    if (atRule.nodes) atRule.replaceWith(...atRule.nodes);
    else atRule.remove();
  });
  // Old WebView does not understand @property; the non-animated
  // fallback remains usable without typed custom properties.
  root.walkAtRules("property", atRule => atRule.remove());
  root.walkDecls(decl => { decl.value = legacyColorValue(decl.value); });
  const lowered = transformCss({
    filename: file,
    code: Buffer.from(root.toString()),
    targets: browserslistToTargets(browserslist(["chrome >= 61", "android >= 8"])),
    minify: false,
    errorRecovery: false,
  });
  legacyOutput.push(lowered.code.toString("utf8"));
}
const legacyFile = "wave-notes-legacy.css";
const legacyText = "html,body{margin:0;padding:0;width:100%;max-width:100%;overflow-x:hidden;}" +
  "*,*::before,*::after{box-sizing:border-box;}\n" + legacyOutput.join("\n");
// Lightning CSS pretty-prints declarations with whitespace: "position: fixed".
 // Validate actual CSS, not the formatting of the serialized output.
if (!/\\.fixed\\s*\\{[^}]*\\bposition\\s*:\\s*fixed\\s*;/m.test(legacyText)) {
  const matches = legacyText.match(/.{0,65}position\\s*:\\s*fixed.{0,65}/g) ?? [];
  throw new Error("Legacy CSS missing .fixed utility; candidate declarations: " +
    JSON.stringify(matches.slice(0, 5)) + "; output bytes=" + legacyText.length);
}
await writeFile(join(assetsDir, legacyFile), legacyText);
console.log("Generated legacy WebView stylesheet for Android 7/8/10");

const cssLinks = cssFiles
  .map((file) => `    <link rel="stylesheet" href="./assets/${file}">`)
  .join("\n");

const html = `<!doctype html>
<html lang="ru" class="dark" style="color-scheme: dark;">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#121212">
    <title>Wave Notes</title>
    <link rel="icon" href="./favicon.ico" type="image/x-icon">
${cssLinks}
    <script>
      // Keep the modern Tailwind build for recent Android. Only load the
      // compiled compatibility stylesheet on WebViews without color-mix/OKLCH.
      (function () {
        if (!window.CSS || !CSS.supports ||
            !CSS.supports('color', 'oklch(0.5 0.1 180)') ||
            !CSS.supports('color', 'color-mix(in srgb, red 50%, blue)')) {
          var style = document.createElement('link');
          style.rel = 'stylesheet';
          style.href = './assets/wave-notes-legacy.css';
          document.head.appendChild(style);
        }
      }());
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./assets/${entryFile}"></script>
  </body>
</html>
`;

await writeFile(join(clientDir, "index.html"), html);
console.log(`Wrote Capacitor SPA shell with ${entryFile}`);