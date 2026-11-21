import {strict as assert} from "node:assert";
const saved=new Map<string,string>();
let refuseSort=false;
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{
 getItem(key:string){return saved.get(key)??null;},
 setItem(key:string,value:string){if(refuseSort&&key==="sn.sort.v1")throw Error("sort rejected");saved.set(key,value);},
 removeItem(key:string){saved.delete(key);}
}}});
const notes=await import("../src/lib/notes-store");
const first=notes.createNote({title:"First",body:"one",folderId:"work"});
const second=notes.createNote({title:"Second",body:"two",folderId:"work"});
notes.setSort("alpha");
const oldBytes=saved.get("sn.notes.v1");
refuseSort=true;
assert.throws(()=>notes.moveNoteBefore(second.id,first.id),/Unable to save notes/);
assert.equal(saved.get("sn.notes.v1"),oldBytes);
assert.equal(saved.get("sn.sort.v1"),"alpha");
console.log("Single-note arrow reorder also rolls back atomically");
