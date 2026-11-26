import {strict as assert} from "node:assert";
const storage=new Map<string,string>();let writes=0,fail=false;
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{
 getItem(key:string){return storage.get(key)??null;},
 setItem(key:string,value:string){if(fail)throw Error("Quota exceeded");storage.set(key,value);if(key==="sn.notes.v1")writes++;}
}}});
const db=await import("../src/lib/notes-store");
const original=db.createNote({title:"Исходник",body:"<p>Мои данные</p>",reminderAt:Date.now()+3600000});
const received=db.createNote({title:"Исправлено — получено",body:"<p>Новые данные</p>",originId:original.id});
const start=writes;
const backup=db.acceptReturnedNote(original.id,received.id,"replace",original.updatedAt);
assert.equal(writes,start+1,"Return resolution must be one durable write");
assert.equal(db.getNote(original.id)?.body,received.body);
assert.equal(db.getNote(original.id)?.title,"Исправлено");
assert.equal(db.getNote(original.id)?.reminderAt,original.reminderAt);
assert.equal(db.getNote(backup.id)?.body,original.body);
assert.equal(db.getNote(received.id)?.body,received.body);
assert.notEqual(backup.id,original.id);
assert.throws(()=>db.acceptReturnedNote(original.id,received.id,"combine",original.updatedAt),/изменилась/);
assert.equal(writes,start+1);
const outsider=db.createNote({title:"Другая",body:"<p>x</p>"});
assert.throws(()=>db.acceptReturnedNote(original.id,outsider.id,"combine",db.getNote(original.id)!.updatedAt),/не принадлежит/);
const before=db.getNote(original.id)?.body;fail=true;
assert.throws(()=>db.acceptReturnedNote(original.id,received.id,"combine",db.getNote(original.id)!.updatedAt),/Unable to save notes/);
assert.equal((JSON.parse(storage.get("sn.notes.v1")||"[]") as Array<{id:string;body:string}>).find(n=>n.id===original.id)?.body,before,"Failed write leaves original intact");
console.log("Atomic returned-note resolution and failure safety passed");
