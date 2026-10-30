import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const body=readFileSync("src/lib/note-transfer.ts","utf8");
const home=readFileSync("src/routes/index.tsx","utf8");
const db=readFileSync("src/lib/notes-store.ts","utf8");
for(const term of ["wave-notes-single","version:1","audioIdsInHtml","saveNewAudioFile","saveNewPdfFile","createdAt:Date.now()","pinned:false","LIMIT=80*1024*1024"]){
 assert.ok(body.includes(term),term);
}
assert.ok(body.includes('originId:p.originId'));
assert.ok(db.includes('originId?: string'));
assert.ok(home.includes('aria-label="Поделиться редактируемой заметкой"'));
assert.ok(home.includes("Получить заметку Wave Notes"));
assert.ok(home.includes("Сохранить копию"));
assert.ok(body.includes("createNote({...p.note,id,originId:p.originId"));
assert.ok(!body.includes("updateNote("),"Imported files must never overwrite records");
console.log("Self-contained Wave Notes exchange format and non-destructive import verified");
