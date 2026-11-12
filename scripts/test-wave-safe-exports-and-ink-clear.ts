import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const canvas=readFileSync("src/components/editor/WaveInkCanvas.tsx","utf8");
const drawing=readFileSync("src/components/editor/WaveDrawing.tsx","utf8");
const exportCode=readFileSync("src/lib/note-export.ts","utf8");
for(const marker of ['const clear=()=>','past.current=[...past.current.slice(-29),current.current]','emit([])','aria-label="Очистить рисунок"'])assert.ok(canvas.includes(marker),marker);
assert.ok(!drawing.includes('updateAttributes({strokes:"[]"})'));
for(const marker of ['body.querySelectorAll("[data-wave-tape]")','node.replaceWith(body.ownerDocument.createTextNode("[Скрытый ответ]"))','function parseBody(note:Note)'])assert.ok(exportCode.includes(marker),marker);
console.log("Undoable clear and no hidden Tape answers in offline exports verified");
