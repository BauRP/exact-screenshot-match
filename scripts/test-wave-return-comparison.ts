import {strict as assert} from "node:assert";
import {returnedNoteComparison} from "../src/lib/wave-note-conflicts";
const note={body:'<p>Hello <span data-wave-tape="true">secret</span> world</p>'} as any;
assert.ok(returnedNoteComparison(note,{comparisonText:"Hello [Скрытый ответ] world",visibleLength:28}).includes("отлич"));
assert.ok(!returnedNoteComparison(note,{comparisonText:"different",visibleLength:9}).includes("secret"));
console.log("Returned-note comparison avoids exposing Tape text");

const quotedNote={body:'<p>Hello <span title="x > y" data-wave-tape="true">SECRET-ONLY</span> world</p>'} as any;
for(const incoming of [
 {comparisonText:"SECRET-ONLY",visibleLength:11},
 {comparisonText:"Hello world",visibleLength:11}
]){
 const result=returnedNoteComparison(quotedNote,incoming);
 assert.ok(!result.includes("SECRET-ONLY"),"Returned-note comparison must not disclose hidden Tape");
}
