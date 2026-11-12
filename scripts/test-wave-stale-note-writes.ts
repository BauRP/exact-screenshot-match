import {strict as assert} from "node:assert";
const storage=new Map<string,string>();let reject=false,writes=0;
const localStorage={getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{if(reject)throw Error("quota");storage.set(key,value);if(key==="sn.notes.v1")writes++;}};
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage}});
const db=await import("../src/lib/notes-store");
const first=db.createNote({title:"Original",body:"safe"});
assert.equal(writes,1);
assert.throws(()=>db.createNote({id:first.id,title:"Collision",body:"lost"}),/Duplicate note ID/);
assert.equal(writes,1);
const external=storage.get("sn.notes.v1")!;
storage.set("sn.notes.v1",JSON.stringify([{...first,body:"Changed elsewhere"}]));
assert.throws(()=>db.updateNote(first.id,{body:"stale editor"}),/another window or after a restore/);
assert.equal(JSON.parse(storage.get("sn.notes.v1")!)[0].body,"Changed elsewhere");
console.log("Stale window and duplicate note ID writes blocked safely");

const saved=db.saveDraftAfterExternalChange(first.id,{title:"Unsaved edits",body:"User draft"});
assert.notEqual(saved.id,first.id);
assert.equal(saved.body,"User draft");
assert.equal(db.getNote(first.id)?.body,"Changed elsewhere");
assert.equal(db.getNote(saved.id)?.body,"User draft");
assert.equal(JSON.parse(storage.get("sn.notes.v1")!).length,2);

const editorSource=await import("node:fs").then(fs=>fs.readFileSync("src/routes/editor.$id.tsx","utf8"));
assert.ok(editorSource.includes('aria-label="Сохранить черновик отдельной копией"'));
assert.ok(editorSource.includes("saveDraftAfterExternalChange(id,"));
