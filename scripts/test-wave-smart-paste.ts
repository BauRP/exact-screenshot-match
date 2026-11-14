import {strict as assert} from "node:assert";import {readFileSync} from "node:fs";
import {safeClipboardColor} from "../src/lib/wave-smart-paste";
const paste=readFileSync("src/lib/wave-smart-paste.ts","utf8");
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const name of ["safeBrowserClipboardHtml","SCRIPT","IFRAME","PICTURE","http:","https:","MAX_PASTE_HTML"])assert.ok(paste.includes(name),name);
for(const name of ["PMDOMParser.fromSchema","parseSlice(container)","replaceSelection(slice)","safeBrowserClipboardHtml(html)"])assert.ok(editor.includes(name),name);
for(const tag of ["TABLE","THEAD","TBODY","TR","TH","TD","TEMPLATE","SELECT","TEXTAREA"])assert.ok(paste.includes(`"${tag}"`),tag);
assert.ok(editor.includes("if(!cleaned)return false;"));
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
assert.ok(paste.includes('!url.username&&!url.password&&url.href.length<=2048'),
 "Imported browser links must not contain embedded credentials or huge URLs");
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
