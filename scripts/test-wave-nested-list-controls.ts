import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const token of [
 'aria-label="Увеличить отступ пункта нумерованного или маркированного списка"',
 'aria-label="Уменьшить отступ пункта нумерованного или маркированного списка"',
 'sinkListItem("listItem").run()','liftListItem("listItem").run()',
 'onMouseDown={event=>event.preventDefault()}'
])assert.ok(editor.includes(token),token);
const prefs=readFileSync("src/lib/editor-preferences.ts","utf8");
assert.ok(prefs.includes('{id:"formatting",label:'));
console.log("Nested list controls use Tiptap list commands and preserve caret from mobile toolbar");
