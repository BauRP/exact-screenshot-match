import {strict as assert} from "node:assert";import {readFileSync} from "node:fs";
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
 'if(/^#[0-9a-f]{6}$/i.test(highlight))',
 'if(/^(?:[8-9]|[1-6][0-9]|7[0-2])px$/.test(size))']){
 assert.ok(paste.includes(token),token);
}
assert.ok(!paste.includes("out.style.cssText"),"Never paste arbitrary clipboard styles");
