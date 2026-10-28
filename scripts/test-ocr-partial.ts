import { strict as assert } from "node:assert";
import { OcrIncompleteScanError, markIncompleteOcrText, markRecoveredOcrText, buildReviewedOcrText, combineRecoveredOcrText, applyRecoveredOcrPass } from "../src/lib/ocr-partial";
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

// Recovery of several failed recognizers must keep successes from the same photo,
// and only mark the genuinely completed scripts as recovered.
const pending = {path:"content://local/image/1",text:"Қазақ тілі\n中文",missingScripts:["japanese","korean","devanagari"] as const};
const firstPass = applyRecoveredOcrPass(pending,["japanese","korean"],"日本語\n한국어",["korean"]);
assert.deepEqual(firstPass.missingScripts,["korean","devanagari"]);
assert.ok(firstPass.text.includes("Қазақ тілі"));
assert.ok(firstPass.text.includes("日本語"));
assert.ok(firstPass.text.includes("한국어"));
const secondPass = applyRecoveredOcrPass(firstPass,["korean","devanagari"],"한국어\nहिन्दी");
assert.deepEqual(secondPass.missingScripts,[]);
assert.equal(secondPass.text.split("한국어").length,2);
assert.ok(markRecoveredOcrText(secondPass.text).includes("Проверьте порядок строк"));
assert.equal(markRecoveredOcrText(secondPass.text).includes("Не завершены проверки"),false);
assert.throws(()=>markRecoveredOcrText(" "),/OCR_EMPTY_TEXT/);
assert.throws(()=>applyRecoveredOcrPass(pending,[],""),/Invalid OCR recovery pass/);
assert.throws(()=>applyRecoveredOcrPass(pending,["japanese"],"",["korean"]),/Invalid OCR recovery pass/);
assert.deepEqual(pending.missingScripts,["japanese","korean","devanagari"]);
// A recovered scan gets ONE new note, not one note for each retry.
const newId=await saveOcrNoteAndOpenEditor(markRecoveredOcrText(secondPass.text),
  "OCR",createNote,async noteId=>{assert.ok(getNote(noteId)?.body.includes("हिन्दी"));});
assert.ok(getNote(newId)?.body.includes("⚠️ Текст восстановлен"));
assert.equal(JSON.parse(storage.get("sn.notes.v1")??"[]").length,2);
console.log("Batch recovery, failed-script tracking, review warning and single save: passed.");

// A complete OCR pass with no recognized characters still clears its check.
// Previously it could leave a completed language marked as failed indefinitely.
const noText = applyRecoveredOcrPass(pending, ["japanese"], "");
assert.deepEqual(noText.missingScripts, ["korean", "devanagari"]);
assert.equal(noText.text, pending.text);
assert.throws(() => applyRecoveredOcrPass(pending, ["japanese","japanese"], ""), /Invalid OCR recovery pass/);
assert.throws(() => applyRecoveredOcrPass(pending, ["japanese"], "", ["japanese","japanese"]), /Invalid OCR recovery pass/);
// Repeated legitimate receipt rows must survive: only copies already present
// in the earlier pass are omitted, never all occurrences of the same line.
assert.equal(combineRecoveredOcrText("Item\n100", "100\n100\n100"), "Item\n100\n\n100\n100");
assert.equal(combineRecoveredOcrText("学校", "學校"), "学校\n\n學校");
assert.equal(combineRecoveredOcrText("  indented\nПривет", "Привет\n  другой"), "  indented\nПривет\n\n  другой");
assert.ok(markRecoveredOcrText("日本語", "ambiguous-han").includes("Китайский и японский"));
console.log("Empty OCR passes, repeated lines, Unicode and review warnings: passed.");

// Users can correct Chinese/Japanese/other OCR characters before saving.
// The warning is added AFTER review; incomplete language coverage persists.
assert.ok(buildReviewedOcrText("日本語 исправлено", [], "ambiguous-han").includes("日本語 исправлено"));
assert.ok(buildReviewedOcrText("日本語 исправлено", [], "ambiguous-han").includes("Китайский и японский"));
assert.ok(buildReviewedOcrText("Қазақ тілі", ["korean"]).includes("Не завершены проверки: Корейский"));
assert.throws(() => buildReviewedOcrText("\n  ", []), /OCR_EMPTY_TEXT/);
const reviewedId = await saveOcrNoteAndOpenEditor(
  buildReviewedOcrText("日本語 исправлено", [], "ambiguous-han"), "OCR", createNote,
  async noteId => assert.ok(getNote(noteId)?.body.includes("исправлено")));
assert.ok(getNote(reviewedId)?.body.includes("Проверьте иероглифы"));
assert.equal(JSON.parse(storage.get("sn.notes.v1") ?? "[]").length, 3);
console.log("Editable OCR review and warning-preserving save: passed.");
