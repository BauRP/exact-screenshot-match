import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const saved=new Map<string,string>();let writes=0,deny=false;
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{
 getItem(key:string){return saved.get(key)??null;},
 setItem(key:string,value:string){
  if(key==="sn.notes.v1"){if(deny)throw Error("disk failure");writes++;}
  saved.set(key,value);
 },removeItem(key:string){saved.delete(key);}
}}});
const db=await import("../src/lib/notes-store");
const original=db.createNote({title:"Original",body:"<p>intact</p>",folderId:"work"});
const oldWrites=writes;
const group=db.createNotesBatch([
 {...original,id:"copy-a",title:"Original — копия",body:"<p>first copy</p>"},
 {...original,id:"copy-b",title:"Original — копия",body:"<p>second copy</p>"}
]);
assert.equal(group.length,2);
assert.equal(writes,oldWrites+1,"Only ONE disk write for all copied notes");
assert.equal(db.getNote("copy-a")?.body,"<p>first copy</p>");
assert.equal(db.getNote("copy-b")?.body,"<p>second copy</p>");
assert.equal(db.getNote(original.id)?.body,"<p>intact</p>");
const before=saved.get("sn.notes.v1"),count=writes;
assert.throws(()=>db.createNotesBatch([{...original,id:"x"},{...original,id:"x"}]),/повторяющийся ID/);
assert.throws(()=>db.createNotesBatch([{...original,id:original.id}]),/повторяющийся ID/);
assert.throws(()=>db.createNotesBatch([]),/20 копий/);
assert.throws(()=>db.createNotesBatch(Array.from({length:21},(_,i)=>({...original,id:"x-"+i}))),/20 копий/);
assert.equal(writes,count);
assert.equal(saved.get("sn.notes.v1"),before);
deny=true;
assert.throws(()=>db.createNotesBatch([{...original,id:"failure"}]),/Unable to save notes/);
assert.ok(!db.parseStoredNotes(saved.get("sn.notes.v1")??null).some(note=>note.id==="failure"),"Failed write cannot leave a copy in persisted notes");
assert.equal(saved.get("sn.notes.v1"),before);
const code=readFileSync("src/routes/index.tsx","utf8");
assert.ok(code.includes("createNotesBatch(copies)"));
assert.ok(code.includes("rewriteNoteAttachmentIds(original.body,audioMap,imageMap)"));
assert.ok(code.indexOf("addedAudioIds.push(fresh);")<code.indexOf("await audio.saveNewAudioFile(fresh,file)"));
assert.ok(code.includes("Создать копии выбранных"));
console.log("Multi-note copies saved atomically, with collision and disk-error rollback");
