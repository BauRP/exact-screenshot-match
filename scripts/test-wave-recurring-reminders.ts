import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {nextRecurringReminder} from "../src/lib/note-reminders";
const now=new Date(2026,10,2,14,0).getTime();
const due=new Date(2026,10,1,9,30).getTime();
const daily=nextRecurringReminder(due,"daily",now)!;
assert.ok(daily>now);assert.equal(new Date(daily).getHours(),9);
assert.equal(new Date(daily).getMinutes(),30);
const weekly=nextRecurringReminder(due,"weekly",now)!;
assert.equal(new Date(weekly).getDate(),8);
const storage=new Map<string,string>();let writes=0;
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem(k:string){return storage.get(k)??null},setItem(k:string,v:string){storage.set(k,v);if(k==="sn.notes.v1")writes++;}}}});
const db=await import("../src/lib/notes-store");
const note=db.createNote({title:"Repeat",body:"body",reminderAt:due,reminderRepeat:"daily"});
const before=writes;
assert.equal(db.completeNoteReminder(note.id,now),true);
assert.equal(writes,before+1);
assert.equal(db.getNote(note.id)?.reminderAt,daily);
assert.equal(db.getNote(note.id)?.reminderRepeat,"daily");
assert.equal(db.completeNoteReminder(note.id,now),false);
const single=db.createNote({title:"Once",body:"body",reminderAt:due});
assert.equal(db.completeNoteReminder(single.id,now),true);
assert.equal(db.getNote(single.id)?.reminderAt,undefined);
console.log("Offline recurring reminder completion and persisted state passed");

const editorSource=readFileSync("src/routes/editor.$id.tsx","utf8");
assert.ok((editorSource.match(/reminderRepeat:reminderRepeat==="none"\?undefined:reminderRepeat/g)||[]).length>=2,
 "Both new and existing notes must save the selected recurrence");
