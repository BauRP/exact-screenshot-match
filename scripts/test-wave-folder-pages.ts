import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {paginateFolderNotes,validFolderNotePageSize,readFolderNotePageSize,saveFolderNotePageSize,readRememberedFolderPage,rememberFolderPage} from "../src/lib/folder-note-pages";
const notes=Array.from({length:30},(_,i)=>({id:"n"+i,body:"private-"+i}));
const first=paginateFolderNotes(notes,1);
assert.deepEqual(first.items.map(n=>n.id),notes.slice(0,12).map(n=>n.id));
assert.deepEqual([first.page,first.pageCount,first.total,first.from,first.to],[1,3,30,1,12]);
const second=paginateFolderNotes(notes,2);
assert.deepEqual([second.from,second.to,second.items.length],[13,24,12]);
const last=paginateFolderNotes(notes,999);
assert.deepEqual([last.page,last.from,last.to,last.items.length],[3,25,30,6]);
assert.equal(paginateFolderNotes(notes,-99).page,1);
assert.equal(paginateFolderNotes(notes,Number.NaN).page,1);
assert.equal(paginateFolderNotes(notes,2,24).items.length,6);
assert.equal(paginateFolderNotes(notes,1,48).pageCount,1);
assert.deepEqual(paginateFolderNotes([],2),{items:[],page:1,pageCount:1,size:12,total:0,from:0,to:0});
assert.equal(validFolderNotePageSize(150),12);
assert.equal(validFolderNotePageSize(24),24);
assert.deepEqual(notes.map(n=>n.id),Array.from({length:30},(_,i)=>"n"+i),"Pagination must not modify saved order");
const values=new Map<string,string>();
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{
 getItem(key:string){return values.get(key)??null;},
 setItem(key:string,v:string){values.set(key,v);}
}}});
assert.equal(readFolderNotePageSize(),12);
assert.equal(saveFolderNotePageSize(24),24);
assert.equal(readFolderNotePageSize(),24);
values.set("wave.folder-page-size.v1","999");
assert.equal(readFolderNotePageSize(),12,"Corrupted UI preference must be ignored");
const ui=readFileSync("src/routes/index.tsx","utf8");
for(const marker of ["paginateFolderNotes(filteredNotes,folderPage,folderPageSize)","onPageChange={changeFolderPage}","notes={pagedNotes.items}","Страницы раздела","Страница", "Сколько заметок на странице","setFolderPage(1)"]){
 assert.ok(ui.includes(marker),marker);
}
assert.ok(ui.includes("readRememberedFolderPage(activeFolder,sort,folderPageSize)"));
assert.ok(ui.includes("rememberFolderPage(activeFolder,sort,folderPageSize,page)"));
assert.ok(ui.includes('aria-label="Перейти на страницу раздела"'));
assert.ok(ui.includes("Number.isSafeInteger(next)"));
console.log("Folder pages: deterministic order, bounds, filters, storage and navigation wiring verified");

assert.equal(readRememberedFolderPage("folder-a","manual",12),1);
assert.equal(rememberFolderPage("folder-a","manual",12,3),3);
assert.equal(readRememberedFolderPage("folder-a","manual",12),3);
assert.equal(readRememberedFolderPage("folder-b","manual",12),1,"Other folder must not inherit page");
assert.equal(readRememberedFolderPage("folder-a","date",12),1,"Different sort must not inherit page");
assert.equal(readRememberedFolderPage("folder-a","manual",24),1,"Other page size must not inherit page");
assert.equal(rememberFolderPage("folder-a","manual",12,-10),1);
assert.equal(readRememberedFolderPage("folder-a","manual",12),1);
