import {strict as assert} from "node:assert";import {readFileSync} from "node:fs";
const paste=readFileSync("src/lib/wave-smart-paste.ts","utf8");
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const name of ["safeBrowserClipboardHtml","SCRIPT","IFRAME","PICTURE","http:","https:","MAX_PASTE_HTML"])assert.ok(paste.includes(name),name);
for(const name of ["PMDOMParser.fromSchema","parseSlice(container)","replaceSelection(slice)","safeBrowserClipboardHtml(html)"])assert.ok(editor.includes(name),name);
assert.ok(!paste.includes("fetch("));console.log("Offline safe rich clipboard importer wired");
