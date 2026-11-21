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

assert.equal(filterNoteOutline([{pos:42,depth:2,title:"Ёлка и заметки",type:"fold"}],"елка")[0]?.pos,42,
 "Russian Ё and Е should find the same outline heading");
assert.deepEqual(filterNoteOutline(items,"  РАБОЧИЙ   ПЛАН  ","heading").map(i=>i.pos),[0]);

assert.deepEqual(filterNoteOutline([
 {pos:100,depth:2,title:"Проект 2026 Android",type:"heading"},
 {pos:200,depth:1,title:"Заметки 2026",type:"heading"}
],"android проект","heading").map(x=>x.pos),[100],
 "Several words can match a heading in either order");
assert.deepEqual(filterNoteOutline(items,"  план   рабочий  ","heading").map(x=>x.pos),[0]);
assert.deepEqual(filterNoteOutline(items,"страница 2","page").map(x=>x.pos),[20]);
assert.equal(filterNoteOutline(items,"неизвестный термин").length,0);
