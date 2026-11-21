import {strict as assert} from "node:assert";
const raw=new Map<string,string>();let writes=0,fail=false;
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{
 getItem:(key:string)=>raw.get(key)??null,
 setItem:(key:string,value:string)=>{if(key==="sn.notes.v1"){if(fail)throw Error("quota");writes++;}raw.set(key,value);}
}}});
const db=await import("../src/lib/notes-store");
const now=new Date(2026,10,3,12,0).getTime();
const due=new Date(2026,10,2,9,0).getTime();
const once=db.createNote({title:"Once",body:"important",folderId:"work",reminderAt:due});
const repeat=db.createNote({title:"Repeat",body:"still here",folderId:"work",reminderAt:due,reminderRepeat:"daily"});
const future=db.createNote({title:"Future",body:"future",folderId:"work",reminderAt:now+20000});
const other=db.createNote({title:"Other",body:"private",folderId:"other",reminderAt:due});
const before=writes;
assert.equal(db.completeOverdueReminders("work",now),2);
assert.equal(writes,before+1);
assert.equal(db.getNote(once.id)?.reminderAt,undefined);
assert.equal(db.getNote(repeat.id)?.reminderRepeat,"daily");
assert.ok((db.getNote(repeat.id)?.reminderAt||0)>now);
assert.equal(db.getNote(repeat.id)?.body,"still here");
assert.equal(db.getNote(future.id)?.reminderAt,now+20000);
assert.equal(db.getNote(other.id)?.reminderAt,due);
assert.equal(db.completeOverdueReminders("work",now),0);
const prev=raw.get("sn.notes.v1");
fail=true;
assert.throws(()=>db.completeOverdueReminders("other",now),/Unable to save notes/);
assert.equal(raw.get("sn.notes.v1"),prev);
console.log("Bulk reminder completion respects folders, recurrence, and atomic storage failures");
