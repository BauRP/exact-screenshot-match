import {strict as assert} from "node:assert";
const storage=new Map<string,string>();let writes=0;
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{
 getItem:(k:string)=>storage.get(k)??null,
 setItem:(k:string,v:string)=>{storage.set(k,v);if(k==="sn.notes.v1")writes++;}
}}});
const db=await import("../src/lib/notes-store");
const now=new Date(2026,10,3,12,0).getTime(),past=now-3600000;
const parent=db.createNote({title:"Parent",body:"a",folderId:"parent",reminderAt:past});
const child=db.createNote({title:"Child",body:"b",folderId:"child",reminderAt:past,reminderRepeat:"weekly"});
const outside=db.createNote({title:"Outside",body:"c",folderId:"outside",reminderAt:past});
const before=writes;
assert.equal(db.completeOverdueReminders(["parent","child"],now),2);
assert.equal(writes,before+1);
assert.equal(db.getNote(parent.id)?.reminderAt,undefined);
assert.ok((db.getNote(child.id)?.reminderAt??0)>now);
assert.equal(db.getNote(outside.id)?.reminderAt,past);
const next=now+3600000;
assert.equal(db.snoozeOverdueReminders(["outside"],next,now),1);
assert.equal(db.getNote(outside.id)?.reminderAt,next);
assert.equal(db.getNote(child.id)?.body,"b");
console.log("Nested-folder overdue actions include descendants but never unrelated notes");
