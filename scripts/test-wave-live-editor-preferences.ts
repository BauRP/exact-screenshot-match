import {strict as assert} from "node:assert";
import {validSpellcheckLanguage} from "../src/lib/editor-preferences";
import {readFileSync} from "node:fs";
const pref=readFileSync("src/lib/editor-preferences.ts","utf8");
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
const settings=readFileSync("src/routes/settings.tsx","utf8");
for(const m of ["EDITOR_PREFS_CHANGED","window.dispatchEvent(new Event(EDITOR_PREFS_CHANGED))"])assert.ok(pref.includes(m),m);
for(const m of ["window.addEventListener(EDITOR_PREFS_CHANGED,refresh)","window.addEventListener(\"storage\",refresh)","setPrefs(readEditorPreferences())","setSearchDecoration(findQuery,findActive)","targetPos=Math.min(editor.state.doc.content.size"])assert.ok(editor.includes(m),m);
assert.ok(settings.includes("saveEditorPreferences(patch)"));
assert.ok(!editor.includes("editor.view.domAtPos(item.pos+1)"));
console.log("Live editor preferences, search highlight and page navigation wiring passed");

const liveSpellcheck=readFileSync("src/routes/editor.$id.tsx","utf8");
assert.ok(liveSpellcheck.includes('editor.view.dom.setAttribute("spellcheck",prefs.spellcheck?"true":"false")'));
assert.ok(liveSpellcheck.includes("observer.observe(document.documentElement"));

for(const lang of ["ru","kk","en","ar","he","fa","ur"] as const)assert.equal(validSpellcheckLanguage(lang),lang);
assert.equal(validSpellcheckLanguage("xx"),"auto");
assert.ok(editor.includes('prefs.spellcheckLanguage==="auto"'));
assert.ok(settings.includes('aria-label="Язык проверки правописания"'));

// Spellcheck uses OS dictionaries; selecting a script does not enable
// a proprietary dictionary or automatic word replacement.
for(const script of ["العربية","עברית","فارسی","اردو"])
 assert.ok(pref.includes(script),"Language must be visible in the existing picker");
