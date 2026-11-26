import {strict as assert} from "node:assert";
// The sort preference and ranks must be stored together or neither one is.
// Simulate sort-key storage rejection after note bytes were accepted.
const saved=new Map<string,string>();
let refuseSort=false;
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{
 getItem(key:string){return saved.get(key)??null;},
 setItem(key:string,value:string){
  if(refuseSort&&key==="sn.sort.v1")throw new Error("Sort preferences are full");
  saved.set(key,value);
 },
 removeItem(key:string){saved.delete(key);}
}}});
const notes=await import("../src/lib/notes-store");
const first=notes.createNote({title:"Alpha",body:"A",folderId:"work"});
const second=notes.createNote({title:"Beta",body:"B",folderId:"work"});
notes.setSort("alpha");
const oldBytes=saved.get("sn.notes.v1");
const oldSort=saved.get("sn.sort.v1");
refuseSort=true;
assert.throws(()=>notes.moveSelectedNotesToEdge([second.id],"top"),/Unable to save notes/);
assert.equal(saved.get("sn.notes.v1"),oldBytes,
 "A rejected sort-key write must restore all original note data");
assert.equal(saved.get("sn.sort.v1"),oldSort,
 "Failed reorder must not silently switch the selected sort");
assert.equal(JSON.parse(saved.get("sn.notes.v1")!).find((n:any)=>n.id===first.id).manualOrder,
 undefined,"A rejected reorder must not leave ranks behind");
console.log("Atomic manual-order rollback on sort preference failure passed");
