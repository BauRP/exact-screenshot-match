import {strict as assert} from "node:assert";
import {noteCountsByFolder} from "../src/lib/folder-tree-counts";
const folders=[{id:"all",name:"All"},{id:"parent",name:"Parent"},{id:"child",name:"Child",parentId:"parent"},{id:"other",name:"Other"}];
const counts=noteCountsByFolder(folders,[{folderId:"child"},{folderId:"parent"},{folderId:"other"},{folderId:"deleted"}]);
assert.equal(counts.get("all"),4);assert.equal(counts.get("parent"),2);
assert.equal(counts.get("child"),1);assert.equal(counts.get("other"),1);
const cycle=noteCountsByFolder([{id:"a",name:"A",parentId:"b"},{id:"b",name:"B",parentId:"a"}],[{folderId:"a"}]);
assert.equal(cycle.get("a"),1);assert.equal(cycle.get("b"),1);
console.log("Nested folder counts handle descendants, missing folders and corrupted cycles");
