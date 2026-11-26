import { strict as assert } from "node:assert";
import { buildOcrNoteDraft } from "../src/lib/ocr-note";

/** Cold-start check of real notes-store, not a mocked save function.
 * A pre-existing OCR note must survive loading and the next new scan.
 */
const first = buildOcrNoteDraft("Қазақша\nРусский\nEnglish\n日本語 中文\n한국어 हिन्दी", "OCR");
const seed = [{
  id:"ocr-saved-across-restart", title:first.title, body:first.body,
  createdAt:1710000000000, updatedAt:1710000000000,
  pinned:false,folderId:"all",kind:"note"
}];
const original = JSON.stringify(seed);
const stored = new Map<string,string>([["sn.notes.v1",original]]);
Object.defineProperty(globalThis,"window",{
  configurable:true,
  value:{localStorage:{
    getItem(key:string):string|null{return stored.get(key)??null;},
    setItem(key:string,value:string):void{stored.set(key,value);}
  }}
});
const db = await import("../src/lib/notes-store");
await db.initializeNotesDatabase();
assert.equal(db.getNote(seed[0].id)?.body,first.body);
assert.equal(db.getNote(seed[0].id)?.title,first.title);
assert.equal(db.getNote(seed[0].id)?.createdAt,1710000000000);
const next = db.createNote(buildOcrNoteDraft("नमस्ते\nשלום\nHello 📷", "OCR"));
assert.equal(db.getNote(next.id)?.body,"<p>नमस्ते</p><p>שלום</p><p>Hello 📷</p>");
const restartedData = JSON.parse(stored.get("sn.notes.v1")??"null");
assert.equal(restartedData.length,2);
assert.equal(restartedData[0].id,next.id);
assert.equal(restartedData[1].id,seed[0].id);
assert.equal(restartedData[1].body,first.body);
assert.equal(restartedData[1].createdAt,1710000000000);
console.log("Cold-start OCR note reload, multilingual body and non-destructive next save: passed.");
