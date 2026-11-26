import {strict as assert} from "node:assert";
import {hasMeaningfulNoteContent} from "../src/lib/note-content";
const doc=(...names:string[])=>({descendants(fn:(node:{type:{name:string}})=>boolean|void){
 for(const name of names)fn({type:{name}});
}}) as any;
assert.equal(hasMeaningfulNoteContent(doc("paragraph")),false);
assert.equal(hasMeaningfulNoteContent(doc("paragraph","waveChecklistItem")),true);
assert.equal(hasMeaningfulNoteContent(doc("paragraph","wavePageBreak")),true);
assert.equal(hasMeaningfulNoteContent(doc("waveFold")),true);
assert.equal(hasMeaningfulNoteContent(doc("waveDrawing")),true);
assert.equal(hasMeaningfulNoteContent(doc("audioNote")),true);
assert.equal(hasMeaningfulNoteContent(doc("bulletList")),true);
console.log("Meaningful note objects survive otherwise-blank Save");
