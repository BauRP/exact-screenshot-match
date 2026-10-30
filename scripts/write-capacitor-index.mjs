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
      /* Premium startup: continuous, screen-wide illumination. No static T,
         full-screen blur, SVG filters, animated clipping or descending strips. */
      #wave-intro {
        position: fixed; inset: 0; z-index: 2147483000; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        background: #050609; color: #fff; isolation: isolate;
        font-family: system-ui, -apple-system, Roboto, Arial, sans-serif;
        opacity: 1; transition: opacity .30s ease-out;
      }
      #wave-intro.wave-intro-leave { opacity: 0; pointer-events: none; }
      #wave-intro-atmosphere, #wave-intro-beam {
        position: absolute; inset: 0; opacity: 0; pointer-events: none;
        will-change: opacity;
      }
      #wave-intro-atmosphere {
        background:
          linear-gradient(180deg, rgba(27,44,67,.37) 0%,
            rgba(17,30,48,.22) 45%, rgba(8,16,30,.10) 75%, transparent 100%),
          radial-gradient(ellipse 125% 90% at 50% 15%,
            rgba(158,188,220,.22), rgba(80,112,145,.11) 54%, transparent 96%);
      }
      #wave-intro-beam {
        background:
          radial-gradient(ellipse 100% 97% at 50% -6%,
            rgba(243,249,255,.35), rgba(177,211,240,.17) 36%,
            rgba(86,116,151,.06) 74%, transparent 100%),
          linear-gradient(90deg, rgba(112,145,182,.02) 0%,
            rgba(170,204,235,.07) 25%, rgba(240,248,255,.17) 50%,
            rgba(170,204,235,.07) 75%, rgba(112,145,182,.02) 100%);
      }
      #wave-intro-glow {
        position: absolute; left: 50%; top: 44%;
        width: min(86vw, 350px); height: min(46vw, 200px);
        transform: translate(-50%,-50%); opacity: 0; pointer-events: none;
        border-radius: 50%;
        background: radial-gradient(ellipse,
          rgba(247,251,255,.28), rgba(183,211,240,.10) 45%, transparent 77%);
      }
      #wave-intro-content {
        position: relative; z-index: 1; width: min(94vw, 390px);
        display: flex; flex-direction: column; align-items: center;
        transform: translateY(-3vh); text-align: center;
      }
      #wave-intro-logo {
        width: clamp(146px, 43vw, 190px); max-width: 52%; height: auto;
        overflow: visible; transform: translateY(12px) scale(.925);
        transform-origin: center;
      }
      #wave-intro-logo .wave-intro-outline {
        fill: none; stroke: #eaf4ff; stroke-width: 2.1;
        stroke-linecap: round; stroke-linejoin: round; opacity: 0;
      }
      #wave-intro-logo .wave-intro-solid { fill: #fff; opacity: 0; }
      #wave-intro-title {
        margin-top: 12px; font-size: clamp(20px, 5.6vw, 26px);
        font-weight: 700; line-height: 1.2; letter-spacing: .1px;
        white-space: nowrap; opacity: 0; transform: translateY(7px);
      }
      #wave-intro-subtitle {
        margin-top: 9px; padding-left: 4px; font-size: 10px;
        font-weight: 500; line-height: 1.3; letter-spacing: 4px;
        white-space: nowrap; color: rgba(242,246,253,.79);
        opacity: 0; transform: translateY(6px);
      }
      /* Each static full-screen light field changes alpha continuously,
         never slides from top to bottom in sections. The small glyph moves. */
      #wave-intro.wave-intro-play #wave-intro-atmosphere {
        animation: wave-atmosphere 4.14s ease-in-out both;
      }
      #wave-intro.wave-intro-play #wave-intro-beam {
        animation: wave-beam 4.14s ease-in-out both;
      }
      #wave-intro.wave-intro-play #wave-intro-glow {
        animation: wave-halo 2.8s ease-in-out .38s both;
      }
      #wave-intro.wave-intro-play #wave-intro-logo {
        animation: wave-mark-arrive 1.85s cubic-bezier(.17,.76,.26,1) .22s both;
      }
      #wave-intro.wave-intro-play .wave-intro-outline {
        animation: wave-contour 1.35s ease-in-out .35s both;
      }
      #wave-intro.wave-intro-play .wave-intro-solid {
        animation: wave-mark-fill .93s ease-out 1.17s both;
      }
      #wave-intro.wave-intro-play #wave-intro-title {
        animation: wave-words .72s ease-out 1.90s both;
      }
      #wave-intro.wave-intro-play #wave-intro-subtitle {
        animation: wave-words .72s ease-out 2.24s both;
      }
      @keyframes wave-atmosphere {
        0% { opacity: .04; } 12% { opacity: .55; }
        34% { opacity: .9; } 65% { opacity: .7; } 100% { opacity: .46; }
      }
      @keyframes wave-beam {
        0% { opacity: 0; } 11% { opacity: .38; }
        28% { opacity: .88; } 51% { opacity: .65; }
        74% { opacity: .78; } 100% { opacity: .31; }
      }
      @keyframes wave-halo {
        0% { opacity: 0; transform: translate(-50%,-50%) scale(.84); }
        42% { opacity: .78; } 76% { opacity: .48; }
        100% { opacity: .18; transform: translate(-50%,-50%) scale(1.04); }
      }
      @keyframes wave-mark-arrive {
        0% { transform: translateY(12px) scale(.925); }
        55% { transform: translateY(1px) scale(.99); }
        100% { transform: translateY(0) scale(1); }
      }
      @keyframes wave-contour {
        0% { opacity: 0; } 24% { opacity: .84; }
        61% { opacity: .93; } 100% { opacity: 0; }
      }
      @keyframes wave-mark-fill {
        0% { opacity: 0; } 60% { opacity: .88; } 100% { opacity: 1; }
      }
      @keyframes wave-words {
        from { opacity: 0; transform: translateY(7px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @media (prefers-reduced-motion: reduce) {
        #wave-intro *, #wave-intro *::before, #wave-intro *::after {
          animation: none !important;
        }
        #wave-intro-atmosphere { opacity: .46 !important; }
        #wave-intro-beam { opacity: .3 !important; }
        #wave-intro-glow { opacity: .16 !important; }
        #wave-intro-logo { transform: none !important; }
        #wave-intro-logo .wave-intro-outline { opacity: 0 !important; }
        #wave-intro-logo .wave-intro-solid,
        #wave-intro-title, #wave-intro-subtitle {
          opacity: 1 !important; transform: none !important;
        }
      }
    </style>
  </head>
  <body>
    <div id="wave-intro" aria-hidden="true">
      <div id="wave-intro-atmosphere"></div>
      <div id="wave-intro-beam"></div>
      <div id="wave-intro-glow"></div>
      <div id="wave-intro-content">
        <svg id="wave-intro-logo" viewBox="0 0 400 380" aria-hidden="true">
          <path class="wave-intro-outline" pathLength="1000" d="M16,55 L42,168 L53,162 L66,158 L90,157 L141,169 L151,173 L151,277 L148,285 L139,300 L132,308 L132,310 L200,352 L268,310 L257,296 L248,278 L248,173 L270,166 L308,157 L327,157 L337,159 L357,167 L376,89 L377,80 L382,64 L383,55 L385,51 L367,55 L354,60 L303,73 L257,87 L227,94 L224,98 L220,113 L217,118 L202,163 L200,165 L196,161 L174,95 L120,81 L117,79 L109,78 L103,75 L31,55 L23,54 L16,51 Z"></path>
          <path class="wave-intro-outline" pathLength="1000" d="M199,1 C212,1 223,12 223,25 C223,38 212,49 199,49 C186,49 175,38 175,25 C175,12 186,1 199,1 Z"></path>
          <path class="wave-intro-solid" d="M16,55 L42,168 L53,162 L66,158 L90,157 L141,169 L151,173 L151,277 L148,285 L139,300 L132,308 L132,310 L200,352 L268,310 L257,296 L248,278 L248,173 L270,166 L308,157 L327,157 L337,159 L357,167 L376,89 L377,80 L382,64 L383,55 L385,51 L367,55 L354,60 L303,73 L257,87 L227,94 L224,98 L220,113 L217,118 L202,163 L200,165 L196,161 L174,95 L120,81 L117,79 L109,78 L103,75 L31,55 L23,54 L16,51 Z"></path>
          <path class="wave-intro-solid" d="M199,1 C212,1 223,12 223,25 C223,38 212,49 199,49 C186,49 175,38 175,25 C175,12 186,1 199,1 Z"></path>
        </svg>
        <div id="wave-intro-title">Tengrize Studio</div>
        <div id="wave-intro-subtitle">WAVE NOTES</div>
      </div>
    </div>
    <script>
      /* Begin on first WebView frame instead of waiting for React boot.
         Capacitor's later begin() call is idempotent and cannot restart this
         ~4.6 second studio intro. A 5.2s watchdog prevents a blocked startup. */
      (function () {
        var intro = document.getElementById("wave-intro");
        if (!intro) return;
        var born = Date.now(), started = false, closed = false, finishTimer, safety;
        function finish() {
          if (closed) return;
          closed = true;
          clearTimeout(finishTimer);
          clearTimeout(safety);
          intro.classList.add("wave-intro-leave");
          window.__waveNotesIntro = null;
          setTimeout(function () {
            if (intro.parentNode) intro.parentNode.removeChild(intro);
          }, 325);
        }
        function begin() {
          if (started || closed) return;
          started = true;
          intro.classList.add("wave-intro-play");
          finishTimer = setTimeout(finish, Math.max(0, 4320 - (Date.now() - born)));
        }
        safety = setTimeout(finish, 5200);
        window.__waveNotesIntro = { begin: begin, finish: finish };
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(begin);
        } else {
          setTimeout(begin, 0);
        }
      }());
    </script>
    <div id="root"></div>
    <script type="module" src="./assets/${entryFile}"></script>
  </body>
</html>
`;

await writeFile(join(clientDir, "index.html"), html);
console.log(`Wrote Capacitor SPA shell with ${entryFile}`);