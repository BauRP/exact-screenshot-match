import { strict as assert } from "node:assert";
import { mergeOcrCandidates, type OcrCandidate, type OcrScript } from "../src/lib/ocr-merge";
import { OcrScanCoverage } from "../src/lib/ocr-coverage";
import { saveOcrNoteAndOpenEditor, reopenSavedOcrNote } from "../src/lib/ocr-save-flow";
import { ocrScanPlan } from "../src/lib/ocr-plan";
import { buildOcrNoteDraft } from "../src/lib/ocr-note";

// Integrated release-candidate LOGIC test, not physical-camera UI automation.
const db=new Map<string,string>();
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{
 getItem(key:string):string|null{return db.get(key)??null;},
 setItem(key:string,value:string):void{db.set(key,value);}
}}});
const {createNote,getNote}=await import("../src/lib/notes-store");
const phrases:Array<[OcrScript,string]>=[
 ["latin","English text 2026"],
 ["cyrillic","Қазақ тілі Русский"],
 ["japanese","日本語の文章"],
 ["chinese","中文识别文本"],
 ["korean","한국어 문장"],
 ["devanagari","हिन्दी भाषा"]
];
const plan=ocrScanPlan("auto");
assert.equal(plan.length,phrases.length);
assert.deepEqual(new Set(plan),new Set(phrases.map(p=>p[0])));
const coverage=new OcrScanCoverage(plan);
const candidates:OcrCandidate[]=phrases.map(([script,text],i)=>({
 script,text,lines:[{script,text,left:.1,right:.9,top:.08+i*.14,bottom:.13+i*.14}]
}));
for(const script of plan)coverage.markCompleted(script);
coverage.ensureComplete();
const recognized=mergeOcrCandidates(candidates);
for(const [,part] of phrases)assert.ok(recognized.includes(part),"Lost script: "+part);
const expected=buildOcrNoteDraft(recognized,"OCR");
let openedAfterSave=false;
const id=await saveOcrNoteAndOpenEditor(recognized,"OCR",createNote,noteId=>{
 const stored=JSON.parse(db.get("sn.notes.v1")??"[]");
 assert.equal(stored.length,1,"Editor opened before note was saved");
 assert.equal(stored[0].id,noteId);
 assert.equal(stored[0].body,expected.body);
 openedAfterSave=true;
});
assert.equal(openedAfterSave,true);
assert.equal(getNote(id)?.body,expected.body);
assert.equal(getNote(id)?.title,expected.title);
assert.ok((expected.body.match(/<p>/g)??[]).length>=6);
for(const fragment of ["中文","हिन्दी","한국어"])assert.ok(expected.body.includes(fragment));
const before=db.get("sn.notes.v1");
await reopenSavedOcrNote(id,getNote,async noteId=>{
 assert.equal(noteId,id);
 assert.equal(getNote(id)?.body,expected.body);
});
assert.equal(db.get("sn.notes.v1"),before,"Reopening duplicated a note");
const incomplete=new OcrScanCoverage(plan);
for(const s of plan.filter(x=>x!=="korean"))incomplete.markCompleted(s);
assert.throws(()=>incomplete.ensureComplete(),/OCR_MODELS_INCOMPLETE/);
assert.equal(JSON.parse(db.get("sn.notes.v1")??"[]").length,1);
console.log("OCR pipeline contract: six scripts, merge, persistence before editor, recovery, incomplete guard: passed.");
