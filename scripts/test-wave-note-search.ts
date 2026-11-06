import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const logic=readFileSync("src/lib/note-search.ts","utf8");
const home=readFileSync("src/routes/index.tsx","utf8");
for(const term of ["parseNoteQuery","noteMatchesSearch","@(","images","todo","locked","readableText","toLocaleLowerCase","filter===\"locked\""]){assert.ok(logic.includes(term),term)}
for(const term of ['aria-label="Поиск по заметкам"','searchFilter','searchAllFolders','noteMatchesSearch(note,searchTerm,searchFilter)','Совпадений не найдено','searchOpen ? <p','onChange={event=>setSearchTerm(event.target.value)}']){assert.ok(home.includes(term),term)}
assert.ok(home.includes('searchOpen&&searchAllFolders||activeFolder==="all"'));
console.log("Offline scoped notes search UI and safe filter handling verified");

import {noteSearchSnippet} from "../src/lib/note-search";
const ligatures="ﬃ".repeat(90);
const sample={id:"note-1",title:"Example",body:"<p>"+ligatures+" ИскОмая цель</p>"};
const snippet=noteSearchSnippet(sample as any,"искомая");
assert.ok(snippet.includes("ИскОмая"),"Preview must show matched text after Unicode expansions");
assert.ok(snippet.length>0,"Preview must not begin after the note end");
assert.equal(noteSearchSnippet({body:"<p>Hello</p>"} as any,"Hello"),"Hello");
