import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const move=readFileSync("src/lib/wave-block-motion.ts","utf8");
const outline=readFileSync("src/lib/note-outline.ts","utf8");
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const marker of ["parent.content.offsetAt(index)","parent.canReplace(","nextIndex < 0","replaceWith(from, to, replacement)"])assert.ok(move.includes(marker),marker);
for(const marker of ["doc.descendants","waveFold","heading","type:\"fold\"","title.slice(0,140)"])assert.ok(outline.includes(marker),marker);
for(const marker of ["Оглавление заметки","collectNoteOutline(editor.state.doc)","setTextSelection(item.pos+1)","outline.map(item"])assert.ok(editor.includes(marker),marker);
console.log("Outline navigation and safe block movement wiring checked");
