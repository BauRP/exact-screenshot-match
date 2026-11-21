import { strict as assert } from "node:assert";
import { buildOcrNoteDraft } from "../src/lib/ocr-note";

/** Exercises the real local note store with multiple sizable OCR results.
 * CI simulations cannot predict storage quotas across physical devices.
 */
const saved = new Map<string,string>();
Object.defineProperty(globalThis,"window",{
  configurable:true,
  value:{localStorage:{
    getItem(key:string):string|null { return saved.get(key)??null; },
    setItem(key:string,value:string):void { saved.set(key,value); }
  }}
});
const { createNote, getNote } = await import("../src/lib/notes-store");
const paragraph="Қазақша мәтін 中文 текст English 日本語 한국어 हिन्दी 📷 & < > \" ' \t2500";
const content=Array.from({length:80},(_,i)=>String(i+1)+". "+paragraph).join("\n");
const ids:string[]=[];
for(let i=0;i<25;i++){
  const draft=buildOcrNoteDraft(String(i+1)+"\n"+content,"OCR");
  const note=createNote(draft);
  ids.push(note.id);
  assert.equal(getNote(note.id)?.body,draft.body);
}
const persisted=JSON.parse(saved.get("sn.notes.v1")??"null") as Array<{
  id:string;body:string;title:string;createdAt:number
}>;
assert.equal(persisted.length,25);
assert.equal(new Set(persisted.map(x=>x.id)).size,25);
assert.deepEqual(persisted.map(x=>x.id),ids.slice().reverse());
assert.ok(persisted.every(x=>x.body.includes("Қазақша") && x.body.includes("한국어") &&
  x.body.includes("&amp;") && x.body.includes("&lt;") && x.body.includes("&nbsp;")));
assert.ok(saved.get("sn.notes.v1")!.length > 100000);
console.log("25 sizable multilingual OCR notes saved with unique IDs and exact serialized contents: passed.");
