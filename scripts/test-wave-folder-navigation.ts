import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {folderDisplayPath,folderNavigationRows} from "../src/lib/folder-navigation";
import type {Folder} from "../src/lib/folders-store";
const folders:Folder[]=[
 {id:"all",name:"Все",system:true},
 {id:"work",name:"Работа",system:true},
 {id:"a",name:"Проекты",parentId:"work"},
 {id:"b",name:"Android",parentId:"a"},
 {id:"c",name:"Личное"},
 {id:"d",name:"Идеи",parentId:"c"}
];
assert.equal(folderDisplayPath(folders,"b"),"Работа / Проекты / Android");
assert.deepEqual(folderNavigationRows(folders).map(r=>r.folder.id),["all","work","a","b","c","d"]);
assert.equal(folderNavigationRows(folders,new Set(["a"])).some(r=>r.folder.id==="b"),false);
assert.equal(folderNavigationRows(folders,new Set(["a"]),"Android").some(r=>r.folder.id==="b"),true,
 "Search must reveal a hidden descendant without changing collapse state");
assert.deepEqual(folderNavigationRows(folders,new Set(["work"]),"Android").map(r=>r.folder.id),["all","work","a","b"]);
assert.equal(folderNavigationRows(folders,new Set(["a"]),"no such folder").length,1);
assert.ok(folderNavigationRows(folders).find(r=>r.folder.id==="a")?.hasChildren);
assert.equal(folderNavigationRows(folders).find(r=>r.folder.id==="b")?.depth,2);
const cyclic:Folder[]=[{id:"x",name:"X",parentId:"y"},{id:"y",name:"Y",parentId:"x"}];
assert.equal(folderNavigationRows(cyclic).length,2,"Cycle must not recurse forever");
const home=readFileSync("src/routes/index.tsx","utf8");
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const phrase of ["folderNavigationRows(folders,drawerCollapsed,drawerQuery)","Свернуть все","Развернуть все","Поиск папки","moveSearch","folderDisplayPath(folders,folder.id)"])
 assert.ok(home.includes(phrase),phrase);
assert.ok(editor.includes("folderNavigationRows(folders,new Set(),editorFolderQuery)"));

assert.ok(home.includes('aria-label="Найти родительскую папку"'));
assert.ok(home.includes("folderParentSearch"));
assert.ok(home.includes("folderAncestors(folders,activeFolder)"));
assert.ok(editor.includes('aria-label="Поиск папки в редакторе"'));
assert.ok(editor.includes("folderNavigationRows(folders,new Set(),editorFolderQuery)"));
assert.ok(editor.includes("max-h-[min(24rem,70dvh)]"));
console.log("Nested drawer, parent-picker search and editor folder navigation passed");

assert.deepEqual(folderNavigationRows(folders,new Set(),"ЛИЧНОЕ").map(r=>r.folder.id),
 ["all","c","d"],"Searching a parent opens the path and children");
const withYo=[{id:"all",name:"All"},{id:"x",name:"Ёжики"},{id:"y",name:"Планы",parentId:"x"}] as Folder[];
assert.deepEqual(folderNavigationRows(withYo,new Set(["x"]),"ежики").map(r=>r.folder.id),
 ["all","x","y"],"Russian Ё and Е must match without changing folder names");

// Search/collapse must remain stable when the stored order is not tree order.
const unsorted:Folder[]=[
 {id:"all",name:"Все"},
 {id:"leaf",name:"Цель",parentId:"middle"},
 {id:"top",name:"Документы"},
 {id:"middle",name:"Вложено",parentId:"top"},
];
assert.deepEqual(folderNavigationRows(unsorted).map(r=>r.folder.id),["all","top","middle","leaf"]);
assert.deepEqual(folderNavigationRows(unsorted,new Set(["top"]),"Цель").map(r=>r.folder.id),
 ["all","top","middle","leaf"]);
assert.equal(folderNavigationRows(unsorted).find(r=>r.folder.id==="leaf")?.path,
 "Документы / Вложено / Цель");

assert.deepEqual(folderNavigationRows(folders,new Set(),"  Проекты  Android ").map(r=>r.folder.id),["all","work","a","b"]);
assert.deepEqual(folderNavigationRows(folders,new Set(),"android проекты").map(r=>r.folder.id),["all","work","a","b"]);
