import {strict as assert} from "node:assert";
const source=[
 {id:"7cf0a25f-2cbd-48bd-8baf-097edfbc9c20",name:"Projects",parentId:"work"},
 {id:"sub_folder-2026",name:"2026",parentId:"7cf0a25f-2cbd-48bd-8baf-097edfbc9c20"}
];
const storage=new Map<string,string>([
 ["sn.folders.v1",JSON.stringify(source)],
 ["sn.hidden-system-folders.v1",JSON.stringify(["home"])],
 ["sn.active-folder.v1","sub_folder-2026"]
]);
const localStorage={
 getItem:(key:string)=>storage.get(key)??null,
 setItem:(key:string,value:string)=>{storage.set(key,value);},
 removeItem:(key:string)=>{storage.delete(key);}
};
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage}});
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:localStorage});
const folders=await import("../src/lib/folders-store");
assert.deepEqual(folders.exportFolderBackup().folders,source,
 "Real saved UUID and underscore folder IDs must not be treated as corrupt");
assert.equal(folders.folderExists("sub_folder-2026"),true);
assert.equal(folders.folderExists("home"),false,"Hidden system tab is not a move target");
assert.equal(folders.folderExists("nonexistent"),false);
assert.throws(()=>folders.setActiveFolder("nonexistent"),/не найдена/i);
const before=storage.get("sn.folders.v1");
folders.setActiveFolder("sub_folder-2026");
assert.equal(storage.get("sn.folders.v1"),before,"Selecting must not rewrite folder data");
folders.renameFolder("sub_folder-2026","Проект 2026");
assert.equal(folders.exportFolderBackup().folders[1].name,"Проект 2026");
assert.equal(JSON.parse(storage.get("sn.folders.v1")||"[]")[0].id,source[0].id);
console.log("Valid saved UUID folders, nested navigation, hidden tab and rename are durable");
