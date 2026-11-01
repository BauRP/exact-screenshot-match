import {strict as assert} from "node:assert";
import {returnedNoteComparison} from "../src/lib/wave-note-conflicts";
const note={body:'<p>Hello <span data-wave-tape="true">secret</span> world</p>'} as any;
assert.ok(returnedNoteComparison(note,{comparisonText:"Hello [Скрытый ответ] world",visibleLength:28}).includes("отлич"));
assert.ok(!returnedNoteComparison(note,{comparisonText:"different",visibleLength:9}).includes("secret"));
console.log("Returned-note comparison avoids exposing Tape text");
