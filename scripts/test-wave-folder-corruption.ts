import {strict as assert} from "node:assert";
const saved=new Map<string,string>([
 ["sn.folders.v1",JSON.stringify({id:"not-an-array"})],
 ["sn.hidden-system-folders.v1",JSON.stringify([])],
 ["sn.active-folder.v1","deleted-parent"]
]);
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{
 getItem:(key:string)=>saved.get(key)??null,
 setItem:(key:string,value:string)=>{saved.set(key,value);},
 removeItem:(key:string)=>{saved.delete(key);}
}});
const store=await import("../src/lib/folders-store");
assert.deepEqual(store.exportFolderBackup().folders,[]);
const before=JSON.stringify([...saved.entries()]);
assert.throws(()=>store.addFolder("Should not overwrite the original"),/Повреждены сохранённые папки/);
assert.throws(()=>store.setActiveFolder("work"),/Повреждены сохранённые папки/);
assert.throws(()=>store.restoreFolderBackup([{id:"safe",name:"Imported"}],[]),/Повреждены сохранённые папки/);
assert.throws(()=>store.folderExists("work"),/Повреждены сохранённые папки/);
assert.equal(JSON.stringify([...saved.entries()]),before,"Corrupt original storage bytes must never be erased");
console.log("Corrupt folder storage remains intact and all writes are blocked");
