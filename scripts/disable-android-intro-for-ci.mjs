// Diagnostic-only transformation of the *generated* Android index file.
// Never edit source HTML or publish this build variant. Same repository,
// same native app and tests: the sole difference is the startup overlay.
import { readFileSync, writeFileSync } from "node:fs";
const path = "dist/client/index.html";
const html = readFileSync(path, "utf8");
function uniqueAnchor(source, text) {
  const first = source.indexOf(text);
  if (first < 0 || source.indexOf(text, first + text.length) >= 0) {
    throw new Error("Missing or duplicate diagnostic intro anchor: " + text);
  }
  return first;
}
const startStyle = uniqueAnchor(html, '<style id="wave-intro-style">');
const endStyle = html.indexOf("</style>", startStyle);
const startIntro = uniqueAnchor(html, '<div id="wave-intro" aria-hidden="true">');
const endIntro = uniqueAnchor(html, '<div id="root"></div>');
if (endStyle < startStyle || startIntro < endStyle || endIntro <= startIntro) {
  throw new Error("Unexpected order in generated launch intro. Refusing to modify APK.");
}
// Remove CSS and the exact launch layer (including its timer and JS).
// Preserve the root React mount, all assets, and the native Capacitor code.
const withoutStyle = html.slice(0, startStyle) + html.slice(endStyle + "</style>".length);
const introStart = uniqueAnchor(withoutStyle, '<div id="wave-intro" aria-hidden="true">');
const rootStart = uniqueAnchor(withoutStyle, '<div id="root"></div>');
const result = withoutStyle.slice(0, introStart) + withoutStyle.slice(rootStart);
if (result.includes('id="wave-intro"') ||
    result.includes("window.__waveNotesIntro =") ||
    !result.includes('<div id="root"></div>') ||
    !result.includes('type="module"')) {
  throw new Error("Diagnostic variant failed validation: production HTML not preserved.");
}
writeFileSync(path, result);
console.log("WAVE_DIAG_INTRO_DISABLED; no animation, same app bundle and native code.");
