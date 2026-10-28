import { strict as assert } from "node:assert";
import { OcrIncompleteScanError, markIncompleteOcrText, markRecoveredOcrText, buildReviewedOcrText, combineRecoveredOcrText, applyRecoveredOcrPass, OcrLimitedSelectionReviewError, OcrNativeTextReviewError, OcrAmbiguousHanError, OcrMixedLayoutReviewError, OcrLargeLayoutReviewError, resumeOcrReviewDraft, recoverFromReviewedText } from "../src/lib/ocr-partial";
import { saveOcrNoteAndOpenEditor } from "../src/lib/ocr-save-flow";
import { readPendingOcrDraft, savePendingOcrDraft, clearPendingOcrDraft, shouldClearPendingDraft, OcrDraftWriteGate } from "../src/lib/ocr-draft";
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

const ambiguousPair = new OcrAmbiguousHanError("学校", {japanese:"学校",chinese:"学枚"});
assert.equal(ambiguousPair.alternatives?.chinese,"学枚");
assert.equal(ambiguousPair.recognizedText,"学校");
console.log("Ambiguous Han readings retained independently for editable review: passed.");


assert.equal(resumeOcrReviewDraft("原文", "Исправленный текст", true),"Исправленный текст");
assert.equal(resumeOcrReviewDraft("Новый OCR","Устаревший черновик",false),"Новый OCR");
assert.equal(resumeOcrReviewDraft("Новый OCR","",true),"");
const layoutReview = new OcrMixedLayoutReviewError("Қазақ тілі\n한국어");
assert.equal(layoutReview.recognizedText,"Қазақ тілі\n한국어");
assert.ok(buildReviewedOcrText("Қазақ тілі\n한국어",[],"mixed-layout")
  .includes("расположение строк"));
console.log("Review edits survive reopening; uncertain layout is persistently labelled: passed.");


// Unsaved OCR survives a WebView restart as a bounded local text draft only.
// It never creates a saved note without explicit user confirmation.
const draftData = new Map<string,string>();
const draftStore = {
  getItem:(key:string) => draftData.get(key) ?? null,
  setItem:(key:string,value:string) => { draftData.set(key,value); },
  removeItem:(key:string) => { draftData.delete(key); },
};
const draft = {text:"Қазақ тілі\n日本語\n한국어",
  reviewedText:"Қазақ тілі\n日本語 исправлено\n한국어",
  missingScripts:["devanagari" as const], reason:"mixed-layout" as const, edited:true};
assert.equal(savePendingOcrDraft(draft,10000,draftStore),true);
assert.equal(readPendingOcrDraft(11000,draftStore)?.reviewedText,draft.reviewedText);
assert.deepEqual(readPendingOcrDraft(11000,draftStore)?.missingScripts,["devanagari"]);
assert.equal(readPendingOcrDraft(10000 + 8*86400000,draftStore),null);
assert.equal(savePendingOcrDraft({...draft,text:"A".repeat(100001)},10000,draftStore),false);
assert.equal(savePendingOcrDraft({...draft,missingScripts:["bad" as never]},10000,draftStore),false);
assert.equal(savePendingOcrDraft(draft,10000,{...draftStore,
  setItem:(_:string,__:string)=>{throw new Error("quota");}}),false);
assert.equal(readPendingOcrDraft(11000,{...draftStore,
  getItem:(_:string)=>"{not-json"}),null);
assert.equal(JSON.parse(draftData.values().next().value as string).path,undefined);
clearPendingOcrDraft(draftStore);
assert.equal(readPendingOcrDraft(11000,draftStore),null);
assert.equal(JSON.parse(storage.get("sn.notes.v1")??"[]").length,3);
console.log("Bounded offline unsaved OCR draft recovery, validation and cleanup: passed.");


assert.equal(shouldClearPendingDraft("picker-open"),false);
assert.equal(shouldClearPendingDraft("picker-cancel"),false);
assert.equal(shouldClearPendingDraft("scan-failed"),false);
assert.equal(shouldClearPendingDraft("note-saved"),true);
assert.equal(shouldClearPendingDraft("discard"),true);
console.log("Canceled picker and failed OCR cannot erase an unsaved review draft: passed.");


// Out-of-order debounced writes cannot bring back a deleted/saved note draft.
const gate = new OcrDraftWriteGate();
assert.equal(gate.canWrite,false);
gate.arm();
assert.equal(gate.canWrite,true);
let oldWrite=()=>{if(gate.canWrite) savePendingOcrDraft(draft,15000,draftStore);};
oldWrite();
assert.ok(readPendingOcrDraft(15000,draftStore));
gate.disarm();
clearPendingOcrDraft(draftStore);
oldWrite(); // late callback from a closed review
assert.equal(readPendingOcrDraft(15000,draftStore),null);
gate.arm();
assert.equal(gate.canWrite,true);
gate.disarm();
assert.equal(gate.canWrite,false);
console.log("OCR debounced draft gate prevents post-save resurrection: passed.");


// A deliberately limited script selection is not a failed model: carry the
// correct warning into the real note and survive restart in local storage.
assert.ok(markRecoveredOcrText("Қазақша 한국어", "limited-selection")
  .includes("Проверены только выбранные языки"));
assert.ok(markRecoveredOcrText("日本語", "native-text")
  .includes("отдельные строки распознавания"));
assert.equal(new OcrLimitedSelectionReviewError("Қазақша").recognizedText,"Қазақша");
assert.equal(new OcrNativeTextReviewError("日本語").recognizedText,"日本語");
assert.equal(savePendingOcrDraft({...draft,reason:"native-text"},20000,draftStore),true);
assert.equal(readPendingOcrDraft(20001,draftStore)?.reason,"native-text");
clearPendingOcrDraft(draftStore);
const limitedId=await saveOcrNoteAndOpenEditor(
  buildReviewedOcrText("Қазақша 한국어",[], "limited-selection"),"OCR",
  createNote,async savedId=>assert.ok(getNote(savedId)?.body.includes("языки")));
assert.ok(getNote(limitedId)?.body.includes("Остальные языковые модели"));
assert.equal(JSON.parse(storage.get("sn.notes.v1")??"[]").length,4);
console.log("Custom language limits and conflicting native glyphs are reviewed and saved safely: passed.");


// Retrying on the SAME photo must preserve the user's manually fixed text.
const correctedRecovery = recoverFromReviewedText(
  {path:"content://test/photo",text:"Неправильный символ",missingScripts:["korean"]},
  "Правильный символ",true);
assert.equal(correctedRecovery.text,"Правильный символ");
assert.deepEqual(correctedRecovery.missingScripts,["korean"]);
assert.equal(applyRecoveredOcrPass(correctedRecovery,["korean"],"한국어").text,
  "Правильный символ\n\n한국어");
assert.throws(()=>recoverFromReviewedText(correctedRecovery," ",true),/OCR_EMPTY_TEXT/);
assert.equal(recoverFromReviewedText(correctedRecovery,"another",false),correctedRecovery);
console.log("User-corrected OCR remains intact across retries on one photograph: passed.");


const denseError=new OcrLargeLayoutReviewError("한국어\n日本語");
assert.equal(denseError.recognizedText,"한국어\n日本語");
assert.ok(markRecoveredOcrText("한국어\n日本語","large-layout").includes("слишком много"));
assert.equal(savePendingOcrDraft({...draft,reason:"large-layout"},25000,draftStore),true);
assert.equal(readPendingOcrDraft(25001,draftStore)?.reason,"large-layout");
clearPendingOcrDraft(draftStore);
console.log("Large-document review warnings survive offline restart: passed.");


const reviewedVariants = [{script:"japanese" as const, complete:"日本語学校",lines:"日本語学枚"}];
assert.equal(savePendingOcrDraft({...draft,reason:"native-text",nativeAlternatives:reviewedVariants},
  30000,draftStore),true);
assert.deepEqual(readPendingOcrDraft(30001,draftStore)?.nativeAlternatives,reviewedVariants);
assert.equal(savePendingOcrDraft({...draft,nativeAlternatives:[{
  script:"invalid" as never,complete:"test",lines:"test"
}]},30000,draftStore),false);
clearPendingOcrDraft(draftStore);
console.log("Different native readings remain locally available across cold restarts: passed.");


// The old 2*100k+4k serialized-size limit rejected VALID long drafts
// once six bounded native alternative pairs were attached. Ensure the
// full permitted payload can be restored after a cold app restart.
const longDraft = {
  text:"Қ".repeat(90000),reviewedText:"Ж".repeat(90000),
  edited:true,missingScripts:["japanese" as const],reason:"native-text" as const,
  nativeAlternatives:([
    "latin","cyrillic","japanese","chinese","korean","devanagari"
  ] as const).map(script=>({
    script,complete:"日本".repeat(1000),lines:"中文".repeat(1000),
  })),
};
assert.equal(savePendingOcrDraft(longDraft,31000,draftStore),true);
const serializedLarge = [...draftData.values()][0];
assert.ok(serializedLarge.length > 204000);
assert.equal(readPendingOcrDraft(31001,draftStore)?.text.length,90000);
assert.equal(readPendingOcrDraft(31001,draftStore)?.nativeAlternatives?.length,6);
clearPendingOcrDraft(draftStore);

// The write gate must reject delayed callbacks from *older* scans even if a
// new scan has already armed the gate.
const epochGate = new OcrDraftWriteGate();
const firstEpoch=epochGate.arm();
assert.equal(epochGate.canWriteToken(firstEpoch),true);
epochGate.disarm();
const secondEpoch=epochGate.arm();
assert.equal(epochGate.canWriteToken(firstEpoch),false);
assert.equal(epochGate.canWriteToken(secondEpoch),true);
epochGate.arm();
assert.equal(epochGate.canWriteToken(secondEpoch),false);
epochGate.disarm();
assert.equal(epochGate.canWrite,false);
console.log("Large multilingual drafts survive restart and stale autosaves cannot overwrite newer scans: passed.");
