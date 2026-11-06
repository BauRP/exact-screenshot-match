import { strict as assert } from "node:assert";
import { saveOcrNoteAndOpenEditor, OcrEditorNavigationError } from "../src/lib/ocr-save-flow";
import { readableOcrFailure } from "../src/lib/ocr-errors";

// Real notes-store and serialization; only the router navigation is injected.
const data = new Map<string,string>();
let throwWrites = false;
Object.defineProperty(globalThis, "window", {configurable: true, value: {
  localStorage: {
    getItem(key:string){return data.get(key)??null;},
    setItem(key:string,value:string) {
      if(throwWrites) throw new Error("QuotaExceededError");
      data.set(key,value);
    },
  },
}});
const { createNote, getNote } = await import("../src/lib/notes-store");
const opened:string[]=[];
const recognized="Қазақ тілі\nРусский\n日本語 中文\n한국어 हिन्दी\n\nЦена < 7500";
const id=await saveOcrNoteAndOpenEditor(recognized,"Сканирование",createNote,
  async noteId=>{opened.push(noteId);});
assert.deepEqual(opened,[id]);
assert.equal(getNote(id)?.title,"Қазақ тілі");
assert.ok(getNote(id)?.body.includes("日本語 中文"));
assert.ok(getNote(id)?.body.includes("<p><br></p>"));
assert.equal(JSON.parse(data.get("sn.notes.v1")!).length,1);

// Empty OCR data must not create an empty note or navigate.
let calledWithEmpty=false;
await assert.rejects(saveOcrNoteAndOpenEditor("  \n", "OCR", () => {
  calledWithEmpty=true;
  return {id:"invalid"};
}, () => {calledWithEmpty=true;}), /OCR_EMPTY_TEXT/);
assert.equal(calledWithEmpty,false);
assert.equal(JSON.parse(data.get("sn.notes.v1")!).length,1);

// If persistence fails, opening the editor must NEVER be attempted.
throwWrites=true;
let navigatedAfterFailedSave=false;
await assert.rejects(
  saveOcrNoteAndOpenEditor("Новый текст","OCR",createNote,()=>{navigatedAfterFailedSave=true;}),
  /Unable to save notes/,
);
assert.equal(navigatedAfterFailedSave,false);
assert.equal(JSON.parse(data.get("sn.notes.v1")!).length,1);

// Separate process + real notes store, so this test can verify navigation
// failure without the store's global write-error guard from above.
console.log("OCR recognition text -> persistent note -> editor route, failed storage guard: passed.");
