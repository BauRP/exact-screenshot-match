import {strict as assert} from "node:assert";
import {readableText,noteMatchesSearch,concealTapeHtml} from "../src/lib/note-search";
import {closeRevealedTape} from "../src/lib/wave-blocks";
import {readFileSync} from "node:fs";
const html='<p>Открыто <span data-wave-tape="true">секрет <span class="x">вложенный</span> конец</span> безопасно</p>';
const cleaned=readableText(html);
assert.ok(cleaned.includes("Открыто")&&cleaned.includes("безопасно"));
for(const phrase of ["секрет","вложенный","конец"])assert.ok(!cleaned.includes(phrase),phrase);
assert.ok(!concealTapeHtml(html).includes("вложенный"));
const note={id:"x",title:"Обычная",body:html,createdAt:1,updatedAt:1};
assert.equal(noteMatchesSearch(note,"вложенный"),false);
assert.equal(noteMatchesSearch(note,"безопасно"),true);
console.log("Nested hidden Tape text protected");

const quotedHtml='<p>Open <span title="the > sign" data-wave-tape="true">INVISIBLE-ANSWER <span title="x > y">SECRET</span> LAST</span> safe</p>';
const quotedClean=readableText(quotedHtml);
for(const text of ["INVISIBLE-ANSWER","SECRET","LAST"])
 assert.ok(!quotedClean.includes(text),"Quoted > inside a span attribute must not reveal Tape");
assert.ok(quotedClean.includes("Open")&&quotedClean.includes("safe"));
assert.equal(noteMatchesSearch({...note,body:quotedHtml},"INVISIBLE-ANSWER"),false);
assert.equal(noteMatchesSearch({...note,body:quotedHtml},"safe"),true);
const singleQuote='<span title=\'foo > bar\' data-wave-tape="true">PRIVATE-NOTE</span>';
assert.equal(noteMatchesSearch({...note,body:singleQuote},"PRIVATE-NOTE"),false);

let removed=0,queries=0;
const marks=Array.from({length:3},()=>({classList:{remove(s:string){assert.equal(s,"wave-tape-open");removed++;}}}));
const mock={isDestroyed:false,view:{dom:{querySelectorAll(s:string){
 assert.equal(s,"[data-wave-tape].wave-tape-open");return ++queries===1?marks:[];
}}}} as any;
assert.equal(closeRevealedTape(mock),3);
assert.equal(removed,3);
assert.equal(closeRevealedTape(mock),0);
assert.equal(closeRevealedTape({...mock,isDestroyed:true}),0);
assert.equal(queries,2);
const toolbar=readFileSync("src/routes/editor.$id.tsx","utf8");
assert.ok(toolbar.includes("closeRevealedTape(editor)"));
