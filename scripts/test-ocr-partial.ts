import { strict as assert } from "node:assert";
import { OcrIncompleteScanError, markIncompleteOcrText, combineRecoveredOcrText } from "../src/lib/ocr-partial";
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
const id=await saveOcrNoteAndOpenEditor(markIncompleteOcrText(failure.partialText,failure.missingScripts),
 "OCR",createNote,async noteId=>{
  assert.ok(getNote(noteId)?.body.includes("⚠️ Неполное распознавание"));
  assert.ok(getNote(noteId)?.body.includes("中文"));
  assert.ok(getNote(noteId)?.body.includes("Японский, Корейский"));
  opened++;
});
assert.equal(opened,1);
assert.equal(JSON.parse(storage.get("sn.notes.v1")??"[]").length,1);
assert.ok(getNote(id)?.title.startsWith("⚠️ Неполное распознавание"));
console.log("Incomplete OCR explicitly saved with permanent warning and no duplicates: passed.");

// Reprocessing the same photograph must not erase Cyrillic text already found.
const original = "Қазақ тілі\n中文";
assert.equal(combineRecoveredOcrText(original, "日本語\n中文"), "Қазақ тілі\n中文\n\n日本語");
assert.equal(combineRecoveredOcrText(original, "中文"), original);
assert.equal(combineRecoveredOcrText(original, ""), original);
assert.equal(combineRecoveredOcrText("", "日本語"), "日本語");
assert.equal(combineRecoveredOcrText(original, "  中文  \n日本語"), "Қазақ тілі\n中文\n\n日本語");
console.log("Same-photo manual recovery retains existing scripts without identical-line duplication: passed.");
