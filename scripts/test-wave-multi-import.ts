import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {unzipSync,zipSync,strToU8} from "fflate";
import {makeWaveNotesBundle,inspectWaveNotesBundle,receiveWaveNotesBundle} from "../src/lib/note-transfer";
import type {Note} from "../src/lib/notes-store";
const memory=new Map<string,string>();let writes=0,failWrite=false;
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{
 getItem(key:string){return memory.get(key)??null;},
 setItem(key:string,val:string){
  if(key==="sn.notes.v1"){if(failWrite)throw Error("disk full");writes++;}
  memory.set(key,val);
 },removeItem(key:string){memory.delete(key);}
}}});
const db=await import("../src/lib/notes-store");
const make=(id:string,title:string):Note=>({
 id,title,body:"<p>"+title+"</p>",createdAt:Date.now(),updatedAt:Date.now(),pinned:false,folderId:"all",kind:"note"
});
const original=db.createNote({id:"original",title:"Original",body:"<p>unmodified</p>",folderId:"all"});
const blob=await makeWaveNotesBundle([make("a","Первая"),make("b","Вторая")]);
const file=new File([blob],"notes.zip",{type:"application/zip"});
assert.deepEqual(await inspectWaveNotesBundle(file),{titles:["Первая","Вторая"],originIds:["a","b"],count:2});
const before=writes,received=await receiveWaveNotesBundle(file,"work");
assert.equal(received.length,2);assert.equal(writes,before+1,"One atomic DB write");
assert.equal(received[0].originId,"a");assert.equal(received[1].originId,"b");
assert.equal(received[0].folderId,"work");assert.equal(received[1].folderId,"work");
assert.equal(db.getNote(original.id)?.body,"<p>unmodified</p>");
assert.equal(new Set(received.map(note=>note.id)).size,2);
assert.ok(received.every(note=>note.id!=="a"&&note.id!=="b"&&note.title.endsWith(" — получено")));
const rawBefore=memory.get("sn.notes.v1"),wBefore=writes;
const zip=unzipSync(new Uint8Array(await blob.arrayBuffer()));
const unsafe=new File([zipSync({...zip,"../escape.txt":strToU8("BAD")})],"unsafe.zip");
await assert.rejects(receiveWaveNotesBundle(unsafe,"all"),/Неожиданное имя/);
assert.equal(writes,wBefore);
const corrupted=new File([zipSync({"WaveNotes-01.wnote":zip["WaveNotes-01.wnote"],
 "WaveNotes-02.wnote":strToU8("not a zip")})],"corrupt.zip");
await assert.rejects(receiveWaveNotesBundle(corrupted,"all"));
assert.equal(writes,wBefore);
assert.equal(memory.get("sn.notes.v1"),rawBefore);
failWrite=true;
await assert.rejects(receiveWaveNotesBundle(file,"all"),/Unable to save notes/);
assert.equal(memory.get("sn.notes.v1"),rawBefore);
assert.equal(db.parseStoredNotes(rawBefore??null).length,3);
const ui=readFileSync("src/routes/index.tsx","utf8");
assert.ok(ui.includes("inspectWaveNotesBundle(file)"));
assert.ok(ui.includes("receiveWaveNotesBundle(incomingBundle.file"));
assert.ok(ui.includes("Получить все заметки"));
console.log("Validated complete ZIP bundle, atomic import, conflict safety and rollback");
