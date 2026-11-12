import { strict as assert } from "node:assert";
import { buildOcrNoteDraft } from "../src/lib/ocr-note";

/** Corrupted storage must never be overwritten by an empty notes array. */
const initial = '{"broken note data":';
const dbStore = new Map<string,string>([["sn.notes.v1",initial]]);
let writes = 0;
Object.defineProperty(globalThis,"window",{
  configurable:true,
  value:{localStorage:{
    getItem(key:string):string|null{return dbStore.get(key)??null;},
    setItem(key:string,value:string):void{writes++; dbStore.set(key,value);}
  }}
});
const db = await import("../src/lib/notes-store");
await db.initializeNotesDatabase();
assert.equal(db.useNotesDatabaseStatus instanceof Function,true);
assert.throws(()=>db.createNote(buildOcrNoteDraft("Новый OCR\nText", "OCR")),/Notes storage has an error/);
assert.equal(writes,0);
assert.equal(dbStore.get("sn.notes.v1"),initial);
assert.throws(()=>db.getNote("old"),/Notes storage has an error/);
console.log("Cold-start corrupt notes storage protection: passed; original bytes preserved.");
