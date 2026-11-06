import {strict as assert} from "node:assert";
import {
 initializeNotesDatabase,createNote,updateNote,
 setView,setSort,moveSelectedNotesToFolder,
 getNote,getAllSavedNotes,importBackupNotes,useNotesDatabaseError
} from "../src/lib/notes-store";
const storage=new Map<string,string>();
const initial=[{
 id:"persisted-one",title:"Оригинал",body:'<p data-image-id="photo1">Текст и фото</p>',
 kind:"note",createdAt:1,updatedAt:1,folderId:"all",pinned:false
}];
storage.set("sn.notes.v1",JSON.stringify(initial));
let failKey:string|null=null;
(globalThis as any).window={
 localStorage:{
  getItem:(key:string)=>storage.get(key)??null,
  setItem:(key:string,value:string)=>{
   if(key===failKey)throw new Error("Injected disk quota failure");
   storage.set(key,value);
  },
  removeItem:(key:string)=>storage.delete(key)
 }
};
await initializeNotesDatabase();
assert.equal(getNote("persisted-one")?.body,initial[0].body);
const note=createNote({id:"extra-one",title:"Вторая",body:"<p>Контент</p>"});
assert.ok(note.id);
assert.equal(JSON.parse(storage.get("sn.notes.v1")||"[]").length,2);
setView("table");assert.equal(storage.get("sn.view.v1"),"table");
setSort("alpha");assert.equal(storage.get("sn.sort.v1"),"alpha");
assert.equal(moveSelectedNotesToFolder(["extra-one"],"work"),1);
assert.equal(JSON.parse(storage.get("sn.notes.v1")||"[]").find((n:{id:string})=>n.id==="extra-one").folderId,"work");
const committed=storage.get("sn.notes.v1")!;
failKey="sn.notes.v1";
assert.throws(()=>updateNote("persisted-one",{body:"<p>New content should not appear</p>"}),/Unable to save notes/);
assert.equal(storage.get("sn.notes.v1"),committed,"Quota failure must never replace stored notes");
assert.equal(getAllSavedNotes().length,0,"Failed writes must block exposing unsafe ready state");
assert.throws(()=>createNote({title:"Should not be saved"}),/Writes are blocked/);
console.log("Real localStorage writes, persisted view/sort/folder operations and injected quota failure preserved saved notes");
