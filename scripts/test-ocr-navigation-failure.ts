import { strict as assert } from "node:assert";
import { saveOcrNoteAndOpenEditor, OcrEditorNavigationError } from "../src/lib/ocr-save-flow";
import { readableOcrFailure } from "../src/lib/ocr-errors";

const data = new Map<string,string>();
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{
  getItem(key:string){return data.get(key)??null;},
  setItem(key:string,value:string){data.set(key,value);},
}}});
const {createNote} = await import("../src/lib/notes-store");
let openCalls=0;
let failure:unknown;
try {
  await saveOcrNoteAndOpenEditor("Сәлем әлем\nEnglish", "OCR", createNote,async () => {
    openCalls++;
    throw new Error("Router failed");
  });
} catch(e){ failure=e; }
assert.ok(failure instanceof OcrEditorNavigationError);
assert.equal(openCalls,1);
assert.ok(failure.savedNoteId);
const raw=JSON.parse(data.get("sn.notes.v1")??"null");
assert.equal(raw.length,1);
assert.equal(raw[0].id,failure.savedNoteId);
assert.ok(readableOcrFailure(failure).includes("успешно сохранён"));
assert.ok(readableOcrFailure(failure).includes("Повторно сканировать"));
console.log("Failed editor navigation preserves the saved note and tells the truth: passed.");
