import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {descendantFolderIds,canNestFolder,orderedFolderTree,folderAncestors,type Folder} from "../src/lib/folders-store";
const tree:Folder[]=[{id:"all",name:"ALL",system:true},{id:"parent",name:"Parent"},{id:"child",name:"Child",parentId:"parent"},{id:"grand",name:"Grandchild",parentId:"child"},{id:"peer",name:"Peer"}];
assert.deepEqual([...descendantFolderIds(tree,"parent")],["parent","child","grand"]);
assert.equal(canNestFolder(tree,"parent","grand"),false);
assert.deepEqual(folderAncestors(tree,"grand").map(x=>x.id),["parent","child","grand"]);
assert.equal(canNestFolder(tree,"child","child"),false);
assert.equal(canNestFolder(tree,"child","peer"),true);
assert.deepEqual(orderedFolderTree(tree).map(x=>x.id),["all","parent","child","grand","peer"]);
const current=new Map<string,string>();
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>current.get(key)??null,setItem:(key:string,value:string)=>current.set(key,value),removeItem:(key:string)=>current.delete(key)}});
const store=await import("../src/lib/folders-store");
const parent=store.addFolder("Projects");
const child=store.addFolder("2026",false,parent.id);
assert.equal(child.parentId,parent.id);
assert.throws(()=>store.renameFolder(parent.id,"Projects",child.id),/Нельзя/);
assert.throws(()=>store.restoreFolderBackup([{id:"loop",name:"Loop",parentId:"loop"}],[]),/зацикленную/);
assert.throws(()=>store.restoreFolderBackup([{id:"alpha",name:"A",parentId:"beta"},{id:"beta",name:"B",parentId:"alpha"}],[]),/структуру/);
store.deleteFolder(parent.id);
assert.equal(store.exportFolderBackup().folders.find(x=>x.id===child.id)?.parentId,undefined);
const beforeInvalid=current.get("sn.folders.v1");
assert.throws(()=>store.addFolder("x".repeat(121)),/120 символов/);
assert.throws(()=>store.renameFolder(child.id,"x".repeat(121)),/120 символов/);
assert.equal(current.get("sn.folders.v1"),beforeInvalid,"Oversized names must never corrupt the stored folder list");
const spare=store.addFolder("   ");
assert.equal(spare.name,"Folder");
const beforeOverflow=current.get("sn.folders.v1");
assert.throws(()=>store.restoreFolderBackup(Array.from({length:1000},(_,i)=>({id:"import"+i,name:"Folder "+i})),[]),/1000/);
assert.equal(current.get("sn.folders.v1"),beforeOverflow,"Rejected backups must preserve saved folders");
assert.throws(()=>store.restoreFolderBackup([{id:"bad-parent",name:"Bad",parentId:"bad id"}],[]),/parent folder ID/);
assert.equal(current.get("sn.folders.v1"),beforeOverflow);
console.log("Nested folders, cycle rejection and safe reparenting verified");

const home=readFileSync("src/routes/index.tsx","utf8");
assert.ok(home.includes('scopedFolderIds.has(note.folderId??"all")'));
assert.ok(home.includes('useMemo(()=>descendantFolderIds(folders,activeFolder)'));
assert.ok(home.includes('aria-label="Родительская папка"'));
assert.ok(home.includes('folderDepth(folders,folder.id)'));
assert.ok(home.includes("treeFolders.map"));
assert.ok(home.includes('aria-label="Путь к папке"'));
assert.ok(home.includes('aria-expanded={!collapsed.has(folder.id)}'));
assert.ok(home.includes('!folderAncestors(folders,folder.id).slice(0,-1).some'));
console.log("Nested folder parent picker, subtree notes and hierarchy rendering are wired");

assert.ok(home.includes('aria-label="Открыть папки"'));
assert.ok(home.includes('aria-label="Дерево папок"'));
assert.ok(home.includes('className="flex max-w-[min(22rem,90vw)]'));
assert.ok(home.includes('setDrawerOpen(false)'));
assert.ok(home.includes("setNativeAdDialogBlocked(drawerOpen ||"));

// Import order may not match hierarchy order. Traversals must preserve every
// folder, stay stable with orphan/cyclic records and handle 1000 deep levels.
const shuffled:Folder[]=[
 {id:"missing-child",name:"Orphan",parentId:"missing"},
 {id:"root",name:"Root"},
 {id:"leaf",name:"Leaf",parentId:"branch"},
 {id:"branch",name:"Branch",parentId:"root"},
 {id:"sibling",name:"Sibling",parentId:"root"},
 {id:"cycle-a",name:"Cycle A",parentId:"cycle-b"},
 {id:"cycle-b",name:"Cycle B",parentId:"cycle-a"},
];
assert.deepEqual(orderedFolderTree(shuffled).map(f=>f.id),
 ["root","branch","leaf","sibling","missing-child","cycle-a","cycle-b"]);
assert.deepEqual([...descendantFolderIds(shuffled,"root")],["root","branch","sibling","leaf"]);
const deep:Folder[]=Array.from({length:1000},(_,i)=>({
 id:"deep"+i,name:"Level "+i,...(i===0?{}:{parentId:"deep"+(i-1)})
}));
assert.equal(orderedFolderTree(deep).length,1000);
assert.equal(descendantFolderIds(deep,"deep0").size,1000);
