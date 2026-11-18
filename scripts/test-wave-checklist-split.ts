import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {continueSelectedChecklistItem,insertUncheckedChecklistAfter,insertUncheckedChecklistBefore,insertUncheckedChecklistRowsAfter,toggleWaveChecklistAtPosition} from "../src/lib/wave-checklist-actions";
import {WaveChecklistItem} from "../src/lib/wave-checklist";
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
// Enter at the start of a completed task creates an empty task before it.
// The completed original keeps its exact text, marks and saved status.
let beginning=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 schema.nodes.waveChecklistItem.create({shape:"diamond",done:true,textDirection:"rtl"},schema.text("Finished",[schema.marks.strong.create()])),
 schema.nodes.waveChecklistItem.create({shape:"square",done:false},schema.text("After"))
])});
let beginningEdits=0;
const beginningEditor={isEditable:true,isDestroyed:false,get state(){return beginning;},
 view:{dispatch(tr:any){beginningEdits++;beginning=beginning.apply(tr);}}} as any;
beginning=beginning.apply(beginning.tr.setSelection(TextSelection.create(beginning.doc,1)));
assert.equal(continueSelectedChecklistItem(beginningEditor),true);
assert.equal(beginningEdits,1);
assert.equal(beginning.doc.childCount,3);
assert.equal(beginning.doc.child(0).textContent,"");
assert.equal(beginning.doc.child(0).attrs.done,false);
assert.equal(beginning.doc.child(0).attrs.shape,"diamond");
assert.equal(beginning.doc.child(1).textContent,"Finished");
assert.equal(beginning.doc.child(1).attrs.done,true);
assert.equal(beginning.doc.child(1).firstChild?.marks[0].type.name,"strong");
assert.equal(beginning.doc.child(2).textContent,"After");
assert.equal(beginning.selection.$from.parent.attrs.done,false);
assert.equal(beginning.doc.check(),undefined);
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
// Taps in read-only editors must never bypass the edit lock.
let canToggle=true,destroyed=false,toggleEdits=0;
const guarded={get isEditable(){return canToggle;},get isDestroyed(){return destroyed;},
 get state(){return state;},view:{dispatch(tr:any){toggleEdits++;state=state.apply(tr)}}} as any;
assert.equal(toggleWaveChecklistAtPosition(guarded,0),true);
assert.equal(state.doc.child(0).attrs.done,false);
assert.equal(toggleWaveChecklistAtPosition(guarded,1),false,"Cannot toggle text position");
canToggle=false;
assert.equal(toggleWaveChecklistAtPosition(guarded,0),false);
canToggle=true;destroyed=true;
assert.equal(toggleWaveChecklistAtPosition(guarded,0),false);
destroyed=false;
assert.equal(toggleWaveChecklistAtPosition(guarded,state.doc.child(0).nodeSize),true);
assert.equal(state.doc.child(1).attrs.done,true);
assert.equal(toggleEdits,2);

// Shortcuts preserve saved RTL/alignment and never edit multiple selected rows.
let shortcutState=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 schema.nodes.waveChecklistItem.create({shape:"diamond",done:true,textDirection:"rtl",textAlign:"right"},schema.text("Готово"))
])});
let canEdit=true,shortcutEdits=0;
const keyboard={
 get isEditable(){return canEdit;},isDestroyed:false,get state(){return shortcutState;},
 view:{dispatch(tr:any){shortcutEdits++;shortcutState=shortcutState.apply(tr)}},
 chain(){return {
  focus(){return this;},
  insertContentAt(at:number,node:any){(this as any).at=at;(this as any).data=node;return this;},
  setTextSelection(at:number){(this as any).caret=at;return this;},
  run(){const self=this as any;const tr=shortcutState.tr.insert(self.at,schema.nodeFromJSON(self.data));
   tr.setSelection(TextSelection.create(tr.doc,self.caret));shortcutEdits++;shortcutState=shortcutState.apply(tr);return true;}
 };}
} as any;
const shortcuts=(WaveChecklistItem.config.addKeyboardShortcuts as (this:any)=>Record<string,()=>boolean>).call({editor:keyboard});
shortcutState=shortcutState.apply(shortcutState.tr.setSelection(TextSelection.create(shortcutState.doc,2)));
assert.equal(shortcuts["Mod-Shift-Enter"](),true);
assert.equal(shortcutState.doc.childCount,2);
assert.equal(shortcutState.doc.child(0).attrs.done,true);
assert.equal(shortcutState.doc.child(1).attrs.done,false);
assert.equal(shortcutState.doc.child(1).attrs.shape,"diamond");
assert.equal(shortcutState.doc.child(1).attrs.textDirection,"rtl");
assert.equal(shortcutState.doc.child(1).attrs.textAlign,"right");
assert.equal(shortcuts["Mod-Enter"](),true);
assert.equal(shortcutState.doc.child(1).attrs.done,true);
canEdit=false;
assert.equal(shortcuts["Mod-Enter"](),false);
assert.equal(shortcuts["Mod-Shift-Enter"](),false);
canEdit=true;
shortcutState=shortcutState.apply(shortcutState.tr.setSelection(TextSelection.create(shortcutState.doc,2,shortcutState.doc.child(0).nodeSize+1)));
assert.equal(shortcuts["Mod-Enter"](),false);
assert.equal(shortcuts["Mod-Shift-Enter"](),false);
assert.equal(shortcutEdits,2);

// The shared keyboard/toolbar action must honor the direct parent schema:
// inside a folded section insertion is legal, but a fixed one-task section
// cannot gain a second task (and must not rewrite its existing content).
const parentSchema=new Schema({nodes:{
 doc:{content:"block+"},
 waveFold:{group:"block",content:"block+"},
 fixedChecklist:{group:"block",content:"waveChecklistItem"},
 paragraph:{group:"block",content:"text*"},
 waveChecklistItem:{group:"block",content:"text*",
   attrs:{shape:{default:"square"},done:{default:false},
     textDirection:{default:"ltr"},textAlign:{default:"left"}}},
 text:{}
},marks:{strong:{}}});
const fixedRow=parentSchema.nodes.waveChecklistItem.create(
 {shape:"diamond",done:true,textDirection:"rtl",textAlign:"right"},
 parentSchema.text("שלום", [parentSchema.marks.strong.create()]));
let folded=EditorState.create({schema:parentSchema,doc:parentSchema.nodes.doc.create(null,[
 parentSchema.nodes.waveFold.create(null,[fixedRow,parentSchema.nodes.paragraph.create(null,parentSchema.text("after"))])
])});
let foldEdits=0;
const foldEditor={isEditable:true,isDestroyed:false,get state(){return folded;},
 view:{dispatch(tr:any){foldEdits++;folded=folded.apply(tr);}}} as any;
folded=folded.apply(folded.tr.setSelection(TextSelection.create(folded.doc,3)));
assert.equal(insertUncheckedChecklistAfter(foldEditor),true);
assert.equal(foldEdits,1,"One safe insertion creates one transaction");
assert.equal(folded.doc.child(0).childCount,3);
assert.equal(folded.doc.child(0).child(0).textContent,"שלום");
assert.equal(folded.doc.child(0).child(0).attrs.done,true);
assert.equal(folded.doc.child(0).child(1).textContent,"");
assert.equal(folded.doc.child(0).child(1).attrs.done,false);
assert.equal(folded.doc.child(0).child(1).attrs.shape,"diamond");
assert.equal(folded.doc.child(0).child(1).attrs.textDirection,"rtl");
assert.equal(folded.doc.child(0).child(1).attrs.textAlign,"right");
assert.equal(folded.doc.child(0).child(2).textContent,"after");
assert.equal(folded.selection.$from.parent.type.name,"waveChecklistItem");
assert.equal(folded.selection.$from.parentOffset,0);
assert.equal(folded.doc.check(),undefined);

let fixed=EditorState.create({schema:parentSchema,doc:parentSchema.nodes.doc.create(null,[
 parentSchema.nodes.fixedChecklist.create(null,fixedRow)
])});
let fixedEdits=0;
const fixedEditor={isEditable:true,isDestroyed:false,get state(){return fixed;},
 view:{dispatch(tr:any){fixedEdits++;fixed=fixed.apply(tr);}}} as any;
fixed=fixed.apply(fixed.tr.setSelection(TextSelection.create(fixed.doc,3)));
const fixedBefore=JSON.stringify(fixed.doc.toJSON());
assert.equal(insertUncheckedChecklistAfter(fixedEditor),false,
 "Schema permits exactly one checklist row; a second is forbidden");
assert.equal(fixedEdits,0);
assert.equal(JSON.stringify(fixed.doc.toJSON()),fixedBefore);
assert.equal(fixed.doc.check(),undefined);
fixed=fixed.apply(fixed.tr.setSelection(TextSelection.create(fixed.doc,2,4)));
assert.equal(insertUncheckedChecklistAfter(fixedEditor),false,
 "A range selection is not permission to insert a new row");
assert.equal(fixedEdits,0);

let locked=true,closed=false;
const protectedEditor={get isEditable(){return !locked;},get isDestroyed(){return closed;},
 get state(){return folded;},view:{dispatch(_tr:any){throw new Error("No edit should occur");}}} as any;
assert.equal(insertUncheckedChecklistAfter(protectedEditor),false);
locked=false;closed=true;
assert.equal(insertUncheckedChecklistAfter(protectedEditor),false);
const ui=await import("node:fs").then(m=>m.readFileSync("src/lib/wave-checklist.ts","utf8"));
assert.ok(ui.includes('return continueSelectedChecklistItem(this.editor);'));
assert.ok(ui.includes('insertUncheckedChecklistAfter(this.editor)'),"Keyboard shortcut must use validated single-transaction action");
console.log("Checklist caret split and empty-row Enter preserve text, formatting, and undo semantics");


// A fixed-layout parent requires one checklist row; pressing Enter in its
// empty row must never dispatch an invalid paragraph and lose note data.
const mandatoryEmpty=parentSchema.nodes.waveChecklistItem.create({
 shape:"square",done:false,textDirection:"rtl",textAlign:"right"
});
let mandatory=EditorState.create({schema:parentSchema,doc:parentSchema.nodes.doc.create(null,[
 parentSchema.nodes.fixedChecklist.create(null,mandatoryEmpty)
])});
let mandatoryWrites=0;
const mandatoryEditor={isEditable:true,isDestroyed:false,get state(){return mandatory;},
 view:{dispatch(tr:any){mandatoryWrites++;mandatory=mandatory.apply(tr);}}} as any;
mandatory=mandatory.apply(mandatory.tr.setSelection(TextSelection.create(mandatory.doc,2)));
const savedMandatory=JSON.stringify(mandatory.doc.toJSON());
assert.equal(continueSelectedChecklistItem(mandatoryEditor),false);
assert.equal(mandatoryWrites,0,"No invalid transaction or Undo entry");
assert.equal(JSON.stringify(mandatory.doc.toJSON()),savedMandatory);
assert.equal(mandatory.doc.check(),undefined);

let beforeState=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 schema.nodes.waveChecklistItem.create({shape:"diamond",done:true,textDirection:"rtl"},schema.text("Saved",[schema.marks.strong.create()])),
 schema.nodes.waveChecklistItem.create(null,schema.text("After"))
])});
let beforeEdits=0;
const beforeEditor={isEditable:true,isDestroyed:false,get state(){return beforeState;},
 view:{dispatch(tr:any){beforeEdits++;beforeState=beforeState.apply(tr);}}} as any;
beforeState=beforeState.apply(beforeState.tr.setSelection(TextSelection.create(beforeState.doc,3)));
assert.equal(insertUncheckedChecklistBefore(beforeEditor),true);
assert.equal(beforeEdits,1);
assert.equal(beforeState.doc.childCount,3);
assert.equal(beforeState.doc.child(0).attrs.done,false);
assert.equal(beforeState.doc.child(0).attrs.shape,"diamond");
assert.equal(beforeState.doc.child(0).attrs.textDirection,"rtl");
assert.equal(beforeState.doc.child(1).textContent,"Saved");
assert.equal(beforeState.doc.child(1).attrs.done,true);
assert.equal(beforeState.doc.child(1).firstChild?.marks[0].type.name,"strong");
assert.equal(beforeState.selection.$from.parentOffset,0);
assert.equal(beforeState.doc.check(),undefined);

let batch=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 schema.nodes.waveChecklistItem.create({shape:"diamond",done:true,textDirection:"rtl"},schema.text("Kept"))
])});
let batchEdits=0;
const batchEditor={isEditable:true,isDestroyed:false,get state(){return batch;},
 view:{dispatch(tr:any){batchEdits++;batch=batch.apply(tr);}}} as any;
batch=batch.apply(batch.tr.setSelection(TextSelection.create(batch.doc,2)));
assert.equal(insertUncheckedChecklistRowsAfter(batchEditor,3),true);
assert.equal(batchEdits,1);
assert.equal(batch.doc.childCount,4);
assert.equal(batch.doc.child(0).textContent,"Kept");
assert.equal(batch.doc.child(0).attrs.done,true);
for(let i=1;i<4;i++){
 assert.equal(batch.doc.child(i).attrs.done,false);
 assert.equal(batch.doc.child(i).attrs.shape,"diamond");
 assert.equal(batch.doc.child(i).attrs.textDirection,"rtl");
}
assert.equal(batch.selection.$from.parentOffset,0);
assert.equal(batch.doc.check(),undefined);
assert.equal(insertUncheckedChecklistRowsAfter(batchEditor,0),false);
assert.equal(insertUncheckedChecklistRowsAfter(batchEditor,11),false);
