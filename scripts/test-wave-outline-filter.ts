import {strict as assert} from "node:assert";
import {filterNoteOutline,type OutlineItem} from "../src/lib/note-outline";
import {readFileSync} from "node:fs";
const items:OutlineItem[]=[
 {pos:0,depth:1,title:"Рабочий план",type:"heading"},
 {pos:10,depth:2,title:"Мой раздел",type:"fold"},
 {pos:20,depth:1,title:"Страница 2",type:"page"}];
assert.equal(filterNoteOutline(items,"раздел").length,1);
assert.deepEqual(filterNoteOutline(items,"", "page").map(x=>x.pos),[20]);
assert.deepEqual(filterNoteOutline(items,"ПЛАН","heading").map(x=>x.pos),[0]);
assert.equal(filterNoteOutline(items,"", "all").length,3);
const ui=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const x of ["Поиск по оглавлению","Тип элемента оглавления","filterNoteOutline(collectNoteOutline(editor.state.doc),outlineQuery,outlineFilter)"])assert.ok(ui.includes(x),x);
console.log("Offline outline filters and editor integration passed");
