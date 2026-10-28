import { strict as assert } from "node:assert";
import { OcrIncompleteScanError, markIncompleteOcrText } from "../src/lib/ocr-partial";
import { saveOcrNoteAndOpenEditor } from "../src/lib/ocr-save-flow";
const storage=new Map<string,string>();
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{
 getItem(key:string){return storage.get(key)??null;},
 setItem(key:string,value:string){storage.set(key,value);}
}}});
const {createNote,getNote}=await import("../src/lib/notes-store");
const failure=new OcrIncompleteScanError("Қазақ тілі\n中文",["japanese","korean"]);
assert.equal(storage.get("sn.notes.v1"),undefined);
let opened=0;
const id=await saveOcrNoteAndOpenEditor(markIncompleteOcrText(failure.partialText),
 "OCR",createNote,async noteId=>{
  assert.ok(getNote(noteId)?.body.includes("⚠️ Неполное распознавание"));
  assert.ok(getNote(noteId)?.body.includes("中文"));
  opened++;
});
assert.equal(opened,1);
assert.equal(JSON.parse(storage.get("sn.notes.v1")??"[]").length,1);
assert.ok(getNote(id)?.title.startsWith("⚠️ Неполное распознавание"));
console.log("Incomplete OCR explicitly saved with permanent warning and no duplicates: passed.");
