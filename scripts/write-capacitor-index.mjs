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
if (!/\.fixed\s*\{[^}]*\bposition\s*:\s*fixed\s*;/m.test(legacyText)) {
  const matches = legacyText.match(/.{0,65}position\s*:\s*fixed.{0,65}/g) ?? [];
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
  
    <style id="wave-intro-style">
      /* Android-only Capacitor boot screen. Rendered outside the React app. */
      #wave-intro {
        position: fixed; inset: 0; z-index: 2147483000; overflow: hidden;
        display: flex; justify-content: center; align-items: center;
        background: #050609; color: #fff; isolation: isolate;
        font-family: system-ui, -apple-system, "Roboto", Arial, sans-serif;
        transition: opacity .34s ease-out; opacity: 1;
      }
      #wave-intro.wave-intro-leave { opacity: 0; pointer-events: none; }
      #wave-intro-beam {
        position: absolute; top: -14%; left: 50%;
        width: min(96vw, 410px); height: 86%;
        transform: translateX(-50%); opacity: .1;
        background: linear-gradient(90deg, transparent 2%, rgba(200,222,246,.025) 28%, rgba(227,239,255,.28) 50%, rgba(200,222,246,.025) 72%, transparent 98%);
        clip-path: polygon(40% 0,60% 0,100% 100%,0 100%);
        filter: blur(19px);
      }
      #wave-intro-content {
        position: relative; z-index: 1; width: min(94vw, 360px);
        display: flex; flex-direction: column; align-items: center;
        transform: translateY(-2.5vh); text-align: center;
      }
      #wave-intro-logo { width: clamp(120px, 39vw, 162px); max-width: 45%; height: auto; overflow: visible; }
      #wave-intro-logo .wave-intro-outline {
        fill: none; stroke: #f8fbff; stroke-width: 2;
        stroke-linejoin: round; stroke-linecap: round;
        stroke-dasharray: 1000; stroke-dashoffset: 0;
        opacity: 0; filter: drop-shadow(0 0 6px rgba(255,255,255,.7));
      }
      #wave-intro-logo .wave-intro-solid {
        fill: #fff; opacity: 1;
        filter: drop-shadow(0 0 8px rgba(235,245,255,.28));
      }
      #wave-intro-title {
        margin-top: 12px; font-weight: 700;
        font-size: clamp(19px, 5.45vw, 25px); line-height: 1.2;
        white-space: nowrap; letter-spacing: .1px;
        text-shadow: 0 0 14px rgba(246,250,255,.22);
      }
      #wave-intro-subtitle {
        margin-top: 8px; padding-left: 4px;
        color: rgba(241,245,252,.78);
        font-size: 10px; font-weight: 500; letter-spacing: 4px;
        line-height: 1.3; white-space: nowrap;
      }
      #wave-intro.wave-intro-play #wave-intro-beam {
        animation: wave-light 2.8s ease-out both;
      }
      #wave-intro.wave-intro-play .wave-intro-outline {
        animation: wave-stroke 1.35s ease-out .30s both;
      }
      #wave-intro.wave-intro-play .wave-intro-solid {
        animation: wave-fill .75s ease-out 1.18s both;
      }
      #wave-intro.wave-intro-play #wave-intro-title {
        animation: wave-words .70s ease-out 1.75s both;
      }
      #wave-intro.wave-intro-play #wave-intro-subtitle {
        animation: wave-words .70s ease-out 2.07s both;
      }
      @keyframes wave-light {
        0% { opacity: 0; transform: translateX(-50%) scaleY(.65); }
        30% { opacity: .62; } 70% { opacity: .3; }
        100% { opacity: .09; transform: translateX(-50%) scaleY(1); }
      }
      @keyframes wave-stroke {
        0% { opacity: 0; stroke-dashoffset: 1000; }
        15% { opacity: 1; }
        85% { opacity: 1; stroke-dashoffset: 0; }
        100% { opacity: 0; stroke-dashoffset: 0; }
      }
      @keyframes wave-fill {
        from { opacity: 0; transform: translateY(7px) scale(.97); transform-origin: center; }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes wave-words {
        from { opacity: 0; transform: translateY(7px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @media (prefers-reduced-motion: reduce) {
        #wave-intro *, #wave-intro *::before, #wave-intro *::after { animation: none !important; }
        #wave-intro-beam { opacity: .08 !important; }
        #wave-intro-logo .wave-intro-outline { opacity: 0 !important; }
        #wave-intro-logo .wave-intro-solid, #wave-intro-title, #wave-intro-subtitle { opacity: 1 !important; }
      }
    </style>
  </head>
  <body>
    <div id="wave-intro" aria-hidden="true">
      <div id="wave-intro-beam"></div>
      <div id="wave-intro-content">
        <svg id="wave-intro-logo" viewBox="0 0 400 380" aria-hidden="true">
          <path class="wave-intro-outline" pathLength="1000" d="M16,55 L42,168 L53,162 L66,158 L90,157 L141,169 L151,173 L151,277 L148,285 L139,300 L132,308 L132,310 L200,352 L268,310 L257,296 L248,278 L248,173 L270,166 L308,157 L327,157 L337,159 L357,167 L376,89 L377,80 L382,64 L383,55 L385,51 L367,55 L354,60 L303,73 L257,87 L227,94 L224,98 L220,113 L217,118 L202,163 L200,165 L196,161 L174,95 L120,81 L117,79 L109,78 L103,75 L31,55 L23,54 L16,51 Z"></path>
          <path class="wave-intro-outline" pathLength="1000" d="M189,15 L185,22 L185,30 L188,36 L195,40 L207,38 L214,29 L214,22 L209,15 L202,12 L195,12 Z"></path>
          <path class="wave-intro-solid" d="M16,55 L42,168 L53,162 L66,158 L90,157 L141,169 L151,173 L151,277 L148,285 L139,300 L132,308 L132,310 L200,352 L268,310 L257,296 L248,278 L248,173 L270,166 L308,157 L327,157 L337,159 L357,167 L376,89 L377,80 L382,64 L383,55 L385,51 L367,55 L354,60 L303,73 L257,87 L227,94 L224,98 L220,113 L217,118 L202,163 L200,165 L196,161 L174,95 L120,81 L117,79 L109,78 L103,75 L31,55 L23,54 L16,51 Z"></path>
          <path class="wave-intro-solid" d="M189,15 L185,22 L185,30 L188,36 L195,40 L207,38 L214,29 L214,22 L209,15 L202,12 L195,12 Z"></path>
        </svg>
        <div id="wave-intro-title">Tengrize Studio</div>
        <div id="wave-intro-subtitle">WAVE NOTES</div>
      </div>
    </div>
    <script>
      /* The startup clock begins before the main application bundle loads.
         Never block navigation if the app fails to render or Android is slow. */
      (function () {
        var intro = document.getElementById("wave-intro");
        var born = Date.now();
        var active = false, closed = false, finishTimer;
        function finish() {
          if (closed) return;
          closed = true;
          clearTimeout(finishTimer);
          intro.classList.add("wave-intro-leave");
          setTimeout(function () { if (intro.parentNode) intro.parentNode.removeChild(intro); }, 375);
        }
        function begin() {
          if (active || closed) return;
          active = true;
          intro.classList.add("wave-intro-play");
          var elapsed = Date.now() - born;
          // About 4–5 s overall; short and smooth on normal Android starts.
          var left = Math.max(2250, Math.min(3550, 4350 - elapsed));
          finishTimer = setTimeout(finish, left);
        }
        // Failsafe: the logo can never trap the user on a black screen.
        var safety = setTimeout(finish, 5800);
        window.__waveNotesIntro = {
          begin: begin,
          finish: function () { clearTimeout(safety); finish(); }
        };
      }());
    </script>
    <div id="root"></div>
    <script type="module" src="./assets/${entryFile}"></script>
  </body>
</html>
`;

await writeFile(join(clientDir, "index.html"), html);
console.log(`Wrote Capacitor SPA shell with ${entryFile}`);