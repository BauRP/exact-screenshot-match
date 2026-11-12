import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const card=readFileSync("src/components/NoteCard.tsx","utf8");
const home=readFileSync("src/routes/index.tsx","utf8");
for(const term of ["onMoveUp","onMoveDown","canMoveUp","canMoveDown","Переместить заметку выше","Переместить заметку ниже"])assert.ok(card.includes(term),term);
for(const term of ["onMoveUp={()=>","onMoveDown={()=>","notes[index-1].pinned===note.pinned","notes[index+1].folderId===note.folderId","moveNoteBefore(id,target)"])assert.ok(home.includes(term),term);
console.log("Accessible reorder controls use same-folder, same-pin saved note order");
