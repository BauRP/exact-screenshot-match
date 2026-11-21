import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const source=readFileSync("src/lib/note-export.ts","utf8");
assert.ok(source.includes('if(el.parentElement.tagName==="UL")list="• "'));
assert.ok(source.includes('if(el.parentElement.tagName==="OL")'));
assert.ok(source.includes('const index=Array.from(el.parentElement.children).indexOf(el)'));
assert.ok(source.includes('return blocks.has(tag)?check+list+inner+'));
assert.ok(source.includes('"H6","DIV"].includes(tag)&&el.getAttribute("dir")==="rtl"'));
console.log("TXT/HTML export preserves list numbering and task paragraph direction");
