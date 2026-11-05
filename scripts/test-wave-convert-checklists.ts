import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {convertSelectedChecklistBlocks} from "../src/lib/wave-checklist-actions";
import {readFileSync} from "node:fs";
const schema=new Schema({nodes:{
 doc:{content:"block+"},paragraph:{group:"block",content:"inline*",attrs:{textDirection:{default:"ltr"}}},
 waveChecklistItem:{group:"block",content:"inline*",attrs:{shape:{default:"square"},done:{default:false},textDirection:{default:"ltr"}}},
 wavePageBreak:{group:"block",atom:true},
 waveImage:{group:"block",atom:true,attrs:{imageId:{default:""}}},
 text:{group:"inline"}
},marks:{strong:{}}});
const bold=schema.marks.strong.create();
const paragraph=(txt:string,dir:"ltr"|"rtl"="ltr")=>schema.nodes.paragraph.create({textDirection:dir},schema.text(txt,[bold]));
const divider=schema.nodes.wavePageBreak.create();
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 paragraph("первая"),paragraph("مرحبا","rtl"),divider,paragraph("третья")
])});
let edits=0;
const mock={isEditable:true,isDestroyed:false,get state(){return state;},
 view:{dispatch(tr:any){edits++;state=state.apply(tr)}}} as any;
const positions=()=>{let at=0;return Array.from({length:state.doc.childCount},(_,i)=>{
 const result=at;at+=state.doc.child(i).nodeSize;return result;});};
function select(from:number,to:number=from){state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,from,to)));}
let p=positions();select(p[0]+1,p[1]+2);
assert.equal(convertSelectedChecklistBlocks(mock,"tasks","diamond"),2);
assert.equal(edits,1,"One transaction for two selected paragraphs");
assert.deepEqual([state.doc.child(0).type.name,state.doc.child(1).type.name],["waveChecklistItem","waveChecklistItem"]);
assert.equal(state.doc.child(1).attrs.textDirection,"rtl");
assert.equal(state.doc.child(1).attrs.shape,"diamond");
assert.equal(state.doc.child(1).attrs.done,false);
assert.equal(state.doc.child(1).firstChild?.marks[0].type.name,"strong");
assert.equal(state.doc.child(2).type.name,"wavePageBreak");
assert.equal(state.doc.child(3).textContent,"третья");
p=positions();select(p[0]+1,p[1]+2);
assert.equal(convertSelectedChecklistBlocks(mock,"paragraphs"),2);
assert.deepEqual([state.doc.child(0).type.name,state.doc.child(1).type.name],["paragraph","paragraph"]);
assert.equal(state.doc.child(1).attrs.textDirection,"rtl");
assert.equal(state.doc.child(1).textContent,"مرحبا");
assert.equal(state.doc.child(1).firstChild?.marks[0].type.name,"strong");
assert.equal(edits,2,"Conversion back is also one operation");
p=positions();select(p[1]+1,p[3]+2);
assert.equal(convertSelectedChecklistBlocks(mock,"tasks"),0,"Never swallow page dividers");
assert.equal(edits,2);
p=positions();select(p[0]+2);
assert.equal(convertSelectedChecklistBlocks(mock,"tasks","circle"),1,"Caret converts one paragraph");
assert.equal(state.doc.child(0).attrs.shape,"circle");
assert.equal(state.doc.child(0).textContent,"первая");
assert.equal(state.doc.check(),undefined);
const ui=readFileSync("src/routes/editor.$id.tsx","utf8");
assert.ok(ui.includes('convertSelectedChecklistBlocks(editor,"tasks",checkShape)'));
assert.ok(ui.includes('convertSelectedChecklistBlocks(editor,"paragraphs")'));
assert.ok(ui.includes('aria-label="Превратить выделенные абзацы в задачи"'));
console.log("Atomic checklist conversion preserves marks, RTL, pages, content and undo boundaries");
