import {strict as assert} from "node:assert";
import {
 initializeNotesDatabase,createNote,updateNote,saveDraftAfterExternalChange,
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
const reminder=Date.now()+86400000;
const note=createNote({id:"extra-one",title:"Вторая",body:"<p>Контент</p>",
 cardColor:"#aabbcc",reminderAt:reminder,reminderRepeat:"daily",
 style:{fontFamily:"serif",fontSize:17,background:"#ffed99",color:"#181818",paperRule:"lined"}});
assert.ok(note.id);
assert.equal(JSON.parse(storage.get("sn.notes.v1")||"[]").length,2);
setView("table");assert.equal(storage.get("sn.view.v1"),"table");
setSort("alpha");assert.equal(storage.get("sn.sort.v1"),"alpha");
assert.equal(moveSelectedNotesToFolder(["extra-one"],"work"),1);
assert.equal(JSON.parse(storage.get("sn.notes.v1")||"[]").find((n:{id:string})=>n.id==="extra-one").folderId,"work");
// Another tab edits a different note while the current editor holds an
// unsaved draft. Recovery must keep that external change and all unedited
// reminder/appearance preferences, in an independent new note.
const external=JSON.parse(storage.get("sn.notes.v1")||"[]");
const changedElsewhere=external.find((n:{id:string})=>n.id==="persisted-one");
changedElsewhere.body="<p>Edited externally</p>";changedElsewhere.updatedAt+=7;
storage.set("sn.notes.v1",JSON.stringify(external));
const recovered=saveDraftAfterExternalChange("extra-one",{
 title:"Черновик",body:"<p>Незавершённый текст</p>"
});
assert.notEqual(recovered.id,"extra-one");
assert.equal(recovered.cardColor,"#aabbcc");
assert.equal(recovered.reminderAt,reminder);
assert.equal(recovered.reminderRepeat,"daily");
assert.equal(recovered.folderId,"work");
assert.equal(recovered.body,"<p>Незавершённый текст</p>");
assert.equal(getNote("persisted-one")?.body,"<p>Edited externally</p>","External change must remain intact");
assert.equal(getNote("extra-one")?.body,"<p>Контент</p>","Original note must remain intact");
// The unsaved draft changed ONLY font size, not the existing paper settings.
const styled=saveDraftAfterExternalChange("extra-one",{
 title:"Частичное оформление",body:"<p>Восстановлено</p>",style:{fontSize:23}
});
assert.equal(styled.style?.fontSize,23);
assert.equal(styled.style?.fontFamily,"serif");
assert.equal(styled.style?.background,"#ffed99");
assert.equal(styled.style?.color,"#181818");
assert.equal(styled.style?.paperRule,"lined");
assert.equal(getNote("extra-one")?.style?.fontSize,17,"Original note unchanged");
assert.equal(getNote(styled.id)?.style?.background,"#ffed99","Style was durably saved");
// Clearing a specific colour must not reset the other saved paper settings.
const styleCleared=saveDraftAfterExternalChange("extra-one",{
 title:"Частичная очистка",body:"<p>Восстановлено</p>",style:{color:undefined}
});
assert.equal(styleCleared.style?.color,undefined);
assert.equal(styleCleared.style?.fontFamily,"serif");
assert.equal(styleCleared.style?.paperRule,"lined");
const cleared=saveDraftAfterExternalChange("extra-one",{
 title:"Очистка",body:"<p>Новый текст</p>",cardColor:undefined,reminderAt:undefined,reminderRepeat:undefined
});
assert.equal(cleared.cardColor,undefined,"Explicit color clearing must win");
assert.equal(cleared.reminderAt,undefined,"Explicit reminder clearing must win");
assert.equal(cleared.reminderRepeat,undefined);
const committed=storage.get("sn.notes.v1")!;
failKey="sn.notes.v1";
assert.throws(()=>updateNote("persisted-one",{body:"<p>New content should not appear</p>"}),/Unable to save notes/);
assert.equal(storage.get("sn.notes.v1"),committed,"Quota failure must never replace stored notes");
assert.equal(getAllSavedNotes().length,0,"Failed writes must block exposing unsafe ready state");
assert.throws(()=>createNote({title:"Should not be saved"}),/Writes are blocked/);
console.log("Real localStorage writes, persisted view/sort/folder operations and injected quota failure preserved saved notes");
