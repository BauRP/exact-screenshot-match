import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const saved=new Map<string,string>();
let refuseSort=false;
let writes=0;
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{
 getItem(key:string){return saved.get(key)??null;},
 setItem(key:string,value:string){
  if(refuseSort&&key==="sn.sort.v1")throw Error("sort rejected");
  if(key==="sn.notes.v1")writes++;
  saved.set(key,value);
 },
 removeItem(key:string){saved.delete(key);}
}}});
const db=await import("../src/lib/notes-store");
const a=db.createNote({title:"A",body:"A",folderId:"work"});
const b=db.createNote({title:"B",body:"B",folderId:"work"});
const c=db.createNote({title:"C",body:"C",folderId:"work"});
const d=db.createNote({title:"D",body:"D",folderId:"work"});
const other=db.createNote({title:"Other",body:"Other",folderId:"home"});
const pinned=db.createNote({title:"Pinned",body:"Pinned",folderId:"work",pinned:true});
db.setSort("alpha");
const order=()=>JSON.parse(saved.get("sn.notes.v1")!).filter((n:any)=>!n.pinned&&n.folderId==="work")
 .sort((x:any,y:any)=>x.manualOrder-y.manualOrder).map((x:any)=>x.title);
const beforeWrites=writes;
assert.equal(db.moveSelectedNotesByOne([b.id,c.id],"up"),2);
assert.equal(writes,beforeWrites+1,"Two selected notes persist in one write");
assert.deepEqual(order(),["B","C","A","D"]);
assert.equal(db.moveSelectedNotesByOne([b.id,c.id],"up"),0);
assert.equal(writes,beforeWrites+1,"No-op doesn't write");
assert.equal(db.moveSelectedNotesByOne([b.id,c.id],"down"),2);
assert.deepEqual(order(),["A","B","C","D"]);
assert.equal(db.moveSelectedNotesByOne([b.id,c.id],"down"),2);
assert.deepEqual(order(),["A","D","B","C"]);
assert.equal(db.moveSelectedNotesByOne([b.id,c.id],"down"),0);
assert.equal(db.moveSelectedNotesByOne([other.id],"up"),0);
assert.equal(db.moveSelectedNotesByOne([pinned.id],"down"),0);
assert.equal(db.moveSelectedNotesByOne([a.id],"sideways" as any),0);
const oldBytes=saved.get("sn.notes.v1"),oldSort=saved.get("sn.sort.v1");
refuseSort=true;
assert.throws(()=>db.moveSelectedNotesByOne([a.id],"down"),/Unable to save notes/);
assert.equal(saved.get("sn.notes.v1"),oldBytes,"Failed preference write must roll back saved rank order");
assert.equal(saved.get("sn.sort.v1"),oldSort,"A failed move must leave sort preference intact");
const ui=readFileSync("src/routes/index.tsx","utf8");
for(const term of ["moveSelectedNotesByOne([...selected]","Выбранные на одну выше","Выбранные на одну ниже","Переместить на уровень выше"])
 assert.ok(ui.includes(term),term);
console.log("Multi-selection moves one position in own folder/pin group, atomically with rollback");
