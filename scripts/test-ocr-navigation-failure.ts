import { strict as assert } from "node:assert";
import { saveOcrNoteAndOpenEditor, OcrEditorNavigationError, reopenSavedOcrNote } from "../src/lib/ocr-save-flow";
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
// Retry uses the same ID, reads existing storage and never creates another note.
let retriedId:string|null=null;
await reopenSavedOcrNote(failure.savedNoteId,id=>raw.find((n:{id:string})=>n.id===id),
  async id=>{retriedId=id;});
assert.equal(retriedId,failure.savedNoteId);
assert.equal(JSON.parse(data.get("sn.notes.v1")??"[]").length,1);
await assert.rejects(reopenSavedOcrNote("missing",id=>raw.find((n:{id:string})=>n.id===id),
  () => {throw new Error("should not navigate");}),/OCR_SAVED_NOTE_NOT_FOUND/);
assert.ok(readableOcrFailure(new Error("OCR_SAVED_NOTE_NOT_FOUND")).includes("не найдена"));
await assert.rejects(reopenSavedOcrNote(failure.savedNoteId,
  id=>raw.find((n:{id:string})=>n.id===id),
  () => Promise.reject(new Error("still unavailable"))),
  e=>e instanceof OcrEditorNavigationError && e.savedNoteId===failure.savedNoteId);
assert.equal(JSON.parse(data.get("sn.notes.v1")??"[]").length,1);
console.log("Failed editor navigation preserves the saved note and tells the truth: passed.");
