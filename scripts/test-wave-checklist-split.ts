import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {continueSelectedChecklistItem} from "../src/lib/wave-checklist-actions";
const schema=new Schema({nodes:{doc:{content:"block+"},
 paragraph:{group:"block",content:"inline*",attrs:{textDirection:{default:"ltr"},textAlign:{default:"left"}}},
 waveChecklistItem:{group:"block",content:"inline*",attrs:{shape:{default:"square"},done:{default:false},textDirection:{default:"ltr"},textAlign:{default:"left"}}},
 text:{group:"inline"}},marks:{strong:{}}});
const item=schema.nodes.waveChecklistItem.create({shape:"circle",done:true},[schema.text("left"),schema.text("right",[schema.marks.strong.create()])]);
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[item])});
const editor={isEditable:true,isDestroyed:false,get state(){return state;},view:{dispatch(tr:any){state=state.apply(tr)}}} as any;
state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,5)));
assert.equal(continueSelectedChecklistItem(editor),true);
assert.equal(state.doc.childCount,2);
assert.equal(state.doc.child(0).textContent,"left");
assert.equal(state.doc.child(1).textContent,"right");
assert.equal(state.doc.child(1).attrs.done,false);
assert.equal(state.doc.child(1).attrs.shape,"circle");
assert.equal(state.doc.child(1).firstChild?.marks[0].type.name,"strong");
// Enter on an empty completed task exits the checklist, with no synthetic
// extra task. Existing surrounding task content and its saved flags survive.
let emptyState=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 schema.nodes.waveChecklistItem.create({shape:"diamond",done:true},schema.text("keep")),
 schema.nodes.waveChecklistItem.create({shape:"circle",done:false,textDirection:"rtl",textAlign:"right"}),
 schema.nodes.waveChecklistItem.create({shape:"check",done:true},schema.text("after"))
])});
let edits=0;
const emptyEditor={isEditable:true,isDestroyed:false,get state(){return emptyState;},
 view:{dispatch(tr:any){edits++;emptyState=emptyState.apply(tr);}}} as any;
const emptyCaret=emptyState.doc.child(0).nodeSize+1;
emptyState=emptyState.apply(emptyState.tr.setSelection(TextSelection.create(emptyState.doc,emptyCaret)));
assert.equal(continueSelectedChecklistItem(emptyEditor),true);
assert.equal(edits,1,"Exiting an empty task is one undoable edit");
assert.equal(emptyState.doc.child(1).type.name,"paragraph");
assert.equal(emptyState.doc.child(1).attrs.textDirection,"rtl","Exiting a checklist must retain RTL");
assert.equal(emptyState.doc.child(1).attrs.textAlign,"right","Exiting a checklist must retain text alignment");
assert.equal("shape" in emptyState.doc.child(1).attrs,false,"Task shape must not leak into paragraph");
assert.equal("done" in emptyState.doc.child(1).attrs,false,"Task completion flag must not leak into paragraph");
assert.equal(emptyState.doc.child(0).attrs.done,true);
assert.equal(emptyState.doc.child(2).textContent,"after");
assert.equal(emptyState.doc.child(2).attrs.shape,"check");
assert.equal(continueSelectedChecklistItem(emptyEditor),false,"Cannot add tasks from a paragraph");
const ui=await import("node:fs").then(m=>m.readFileSync("src/lib/wave-checklist.ts","utf8"));
assert.ok(ui.includes('return continueSelectedChecklistItem(this.editor);'));
console.log("Checklist caret split and empty-row Enter preserve text, formatting, and undo semantics");
