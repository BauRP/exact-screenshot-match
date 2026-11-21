import {strict as assert} from "node:assert";import {readFileSync} from "node:fs";
import {safeClipboardColor,safeMarkdownInline} from "../src/lib/wave-smart-paste";
const paste=readFileSync("src/lib/wave-smart-paste.ts","utf8");
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const name of ["safeBrowserClipboardHtml","SCRIPT","IFRAME","PICTURE","http:","https:","MAX_PASTE_HTML"])assert.ok(paste.includes(name),name);
for(const name of ["PMDOMParser.fromSchema","parseSlice(container)","replaceSelection(slice)","safeBrowserClipboardHtml(html)"])assert.ok(editor.includes(name),name);
for(const tag of ["TABLE","THEAD","TBODY","TR","TH","TD","TEMPLATE","SELECT","TEXTAREA"])assert.ok(paste.includes(`"${tag}"`),tag);
assert.ok(editor.includes("if(!cleaned)return pastePlain();"),
 "Rejected HTML must not fall through to an unfiltered default rich paste");
assert.ok(editor.includes("_view.state.tr.insertText(plain)"),
 "When rejecting pasted HTML, retain ordinary text rather than silently losing it");
assert.ok(editor.includes("if(!slice.content.size)return false;"));
assert.ok(!paste.includes("fetch("));console.log("Offline safe rich clipboard importer wired");

for(const token of ["element.style.backgroundColor","out.style.backgroundColor=highlight",
 "out.style.fontSize=size","out.style.fontWeight=\"bold\"",
 'out.style.fontStyle="italic"',"out.style.textDecorationLine=line",
 'const highlight=safeClipboardColor(element.style.backgroundColor)',
 'if(/^(?:[8-9]|[1-6][0-9]|7[0-2])px$/.test(size))']){
 assert.ok(paste.includes(token),token);
}
assert.ok(!paste.includes("out.style.cssText"),"Never paste arbitrary clipboard styles");
assert.ok(paste.includes('normalizedSafeNoteLink(element.getAttribute("href")||"")'),
 "Pasted links must use the shared strict URL allowlist");
assert.ok(paste.includes('if(url.protocol==="http:"||url.protocol==="https:")')===false,
 "No permissive unconditional URL acceptance");


// Browser/WebView typically normalizes #ff0000 into rgb(255, 0, 0).
// These are behavioral tests of the actual sanitizer shared by both styles.
for(const [input,want] of [
 ["#A1b2C3","#a1b2c3"],["#f08","#ff0088"],
 ["rgb(255, 0, 17)","#ff0011"],["rgba(10, 20, 30, 1)","#0a141e"],
 ["rgb(0,0,0)","#000000"],["rgba(255, 255, 255, 1.0)","#ffffff"]
])assert.equal(safeClipboardColor(input),want,input);
for(const input of [
 "rgba(1,2,3,.5)","rgba(1,2,3,0)","rgba(1,2,3,1.5)",
 "rgb(256, 0, 0)","rgb(-1, 0, 0)","rgb(0,0,999)",
 "transparent","currentColor","var(--secret)","url(javascript:alert(1))",
 "#abcd","red","rgb(10%,20%,30%)","", "rgb(0,0,0);background:url(x)"
])assert.equal(safeClipboardColor(input),"","Unsafe or lossy CSS must not survive: "+input);
assert.ok(paste.includes("if(ink)out.style.color=ink"));
assert.ok(paste.includes("if(highlight)out.style.backgroundColor=highlight"));

assert.ok(paste.includes('if(href)out.setAttribute("href",href)'));
assert.equal(paste.split('getAttribute("dir")?.trim().toLowerCase()==="rtl"').length-1,2,
 "Copied rich text and checklist rows must preserve case-insensitive RTL");

assert.equal(safeMarkdownInline("[Почта](mailto:notes@example.kz)"),
 '<a href="mailto:notes@example.kz">Почта</a>');
assert.equal(safeMarkdownInline("[Телефон](tel:+77001234567)"),
 '<a href="tel:+77001234567">Телефон</a>');
assert.equal(safeMarkdownInline("[Сайт](https://example.kz/path?a=1&b=2)"),
 '<a href="https://example.kz/path?a=1&amp;b=2">Сайт</a>');
assert.equal(safeMarkdownInline("[Нельзя](mailto:broken-address)"),
 "[Нельзя](mailto:broken-address)");
assert.ok(!safeMarkdownInline("[Нельзя](javascript:alert(1))").includes("<a "));
assert.ok(!safeMarkdownInline("[Нельзя](https://user:pass@example.kz)").includes("<a "));
