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
        opacity: 1; transition: opacity 420ms cubic-bezier(.22,1,.36,1);
      }
      #wave-intro.wave-intro-leave { opacity: 0; pointer-events: none; }
      #wave-intro-atmosphere, #wave-intro-beam {
        position: absolute; inset: 0; opacity: 0; pointer-events: none;
        /* Static full-viewport gradients: animate alpha, not paint geometry. */
      }
      #wave-intro-atmosphere {
        background:
          linear-gradient(180deg, rgba(24,39,58,.20) 0%,
            rgba(17,29,45,.15) 46%, rgba(9,17,28,.07) 78%, transparent 100%),
          radial-gradient(ellipse 145% 110% at 50% 7%,
            rgba(101,130,166,.17) 0%, rgba(62,88,121,.12) 52%, transparent 96%);
      }
      #wave-intro-beam {
        /* No white spotlight: low-energy blue mist distributed edge to edge. */
        background:
          radial-gradient(ellipse 130% 115% at 50% -11%,
            rgba(141,172,207,.14) 0%, rgba(98,133,172,.085) 48%,
            transparent 96%),
          linear-gradient(90deg, rgba(31,49,72,.035) 0%,
            rgba(75,101,130,.085) 50%, rgba(31,49,72,.035) 100%);
      }
      #wave-intro-glow {
        /* Replace the visible circular halo with broad, barely visible fog. */
        position: absolute; inset: 0; opacity: 0; pointer-events: none;
        background: radial-gradient(ellipse 105% 78% at 50% 45%,
          rgba(89,118,151,.075) 0%, rgba(71,99,134,.035) 51%,
          transparent 100%);
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
        animation: wave-halo 3.0s ease-in-out .12s both;
      }
      #wave-intro.wave-intro-play #wave-intro-logo {
        animation: wave-mark-arrive 1.73s cubic-bezier(.22,.7,.25,1) .07s both;
      }
      #wave-intro.wave-intro-play .wave-intro-outline {
        animation: wave-contour 1.32s ease-in-out .13s both;
      }
      #wave-intro.wave-intro-play .wave-intro-solid {
        animation: wave-mark-fill .88s ease-out 1.02s both;
      }
      #wave-intro.wave-intro-play #wave-intro-title {
        animation: wave-words .78s ease-out 1.73s both;
      }
      #wave-intro.wave-intro-play #wave-intro-subtitle {
        animation: wave-words .78s ease-out 2.08s both;
      }
      @keyframes wave-atmosphere {
        0% { opacity: .15; } 12% { opacity: .45; }
        34% { opacity: .72; } 65% { opacity: .63; } 100% { opacity: .49; }
      }
      @keyframes wave-beam {
        0% { opacity: .025; } 12% { opacity: .21; }
        32% { opacity: .60; } 58% { opacity: .48; }
        78% { opacity: .53; } 100% { opacity: .31; }
      }
      @keyframes wave-halo {
        0% { opacity: 0; } 42% { opacity: .34; }
        76% { opacity: .27; } 100% { opacity: .16; }
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
        #wave-intro-atmosphere { opacity: .49 !important; }
        #wave-intro-beam { opacity: .31 !important; }
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
      /* Start light immediately on the first WebView frame; on slower devices
         the Android system layer is kept brief and uses the identical dark
         background. Never restart the animation when React subsequently mounts. */
      (function () {
        var intro = document.getElementById("wave-intro");
        if (!intro) return;
        var born = Date.now(), started = false, closed = false;
        var finishTimer, safety, exitStarted = false;

        function finish() {
          if (closed) return;
          closed = true;
          clearTimeout(finishTimer);
          clearTimeout(safety);
          intro.classList.add("wave-intro-leave");
          window.__waveNotesIntro = null;
          setTimeout(function () {
            if (intro.parentNode) intro.parentNode.removeChild(intro);
          }, 460);
        }
        function appHasPainted() {
          var root = document.getElementById("root");
          return !!(root && root.childElementCount);
        }
        function exitWhenReady() {
          if (exitStarted || closed) return;
          // A nearly complete React mount can otherwise cause a black flash
          // between the branding frame and the first usable app frame.
          if (!appHasPainted() && Date.now() - born < 4900) {
            finishTimer = setTimeout(exitWhenReady, 80);
            return;
          }
          exitStarted = true;
          finish();
        }
        function begin() {
          if (started || closed) return;
          started = true;
          intro.classList.add("wave-intro-play");
          finishTimer = setTimeout(exitWhenReady, Math.max(0, 4210 - (Date.now() - born)));
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