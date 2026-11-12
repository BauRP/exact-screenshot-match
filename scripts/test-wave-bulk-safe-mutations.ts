import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const store=readFileSync("src/lib/notes-store.ts","utf8");
const home=readFileSync("src/routes/index.tsx","utf8");
for(const name of ["moveSelectedNotesToFolder","setSelectedNotesCardColor"]){
 const start=store.indexOf("export function "+name);
 assert.ok(start>=0,name);
 const end=store.indexOf("\n}",start);
 const chunk=store.slice(start,end);
 assert.ok(chunk.includes("persistNotes(next);"),name+" must persist");
 assert.ok(chunk.indexOf("persistNotes(next);")<chunk.indexOf("commit({notes:next"),name+" must not mutate view before save");
}
assert.ok(home.includes("moveSelectedNotesToFolder(selectedNotes.map(note=>note.id),folder.id)"));
assert.ok(home.includes("setSelectedNotesCardColor(selectedNotes.map(note=>note.id),color||undefined)"));
assert.ok(!home.includes("selectedNotes.forEach(note=>updateNote(note.id,{folderId:folder.id}))"));
console.log("Atomic folder move and color updates wired to one durable write");
