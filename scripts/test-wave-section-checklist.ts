import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {selectedSectionTaskCounts,setSelectedSectionTasksDone} from "../src/lib/wave-checklist-actions";
const schema=new Schema({nodes:{doc:{content:"block+"},paragraph:{group:"block",content:"text*"},waveFold:{group:"block",content:"block+",attrs:{title:{default:"section"}}},waveChecklistItem:{group:"block",content:"text*",attrs:{done:{default:false}}},text:{group:"inline"}},marks:{}});
const task=(t:string)=>schema.nodes.waveChecklistItem.create({done:false},schema.text(t));
const fold=(t:string,children:any[])=>schema.nodes.waveFold.create({title:t},children);
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[fold("first",[task("a"),fold("inner",[task("b")])]),fold("second",[task("c")])])});
let writes=0;
const editor={isEditable:true,isDestroyed:false,get state(){return state;},
 view:{dispatch(tr:any){writes++;state=state.apply(tr)}}} as any;
const nestedPos=state.doc.firstChild!.firstChild!.nodeSize+2;
state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,nestedPos+2)));
assert.equal(selectedSectionTaskCounts(editor)?.total,1);
assert.equal(setSelectedSectionTasksDone(editor,true),1);
assert.equal(state.doc.firstChild?.lastChild?.firstChild?.attrs.done,true);
assert.equal(state.doc.firstChild?.firstChild?.attrs.done,false);
assert.equal(state.doc.lastChild?.firstChild?.attrs.done,false);
// A selection spanning two sibling sections must NOT silently finish the
// tasks of the first section. The displayed counts should not claim there
// is an active section either.
const findTask=(name:string):number=>{
 let result:number|undefined;
 state.doc.descendants((node,pos)=>{
  if(node.type.name==="waveChecklistItem"&&node.textContent===name)result=pos+1;
 });
 assert.notEqual(result,undefined);return result!;
};
const choose=(a:string,b?:string)=>{
 state=state.apply(state.tr.setSelection(TextSelection.create(
  state.doc,findTask(a),b?findTask(b)+1:findTask(a))));
};
choose("a","c");
const beforeCross=JSON.stringify(state.doc.toJSON()),beforeWrites=writes;
assert.equal(selectedSectionTaskCounts(editor),undefined);
assert.equal(setSelectedSectionTasksDone(editor,true),0);
assert.equal(setSelectedSectionTasksDone(editor,false),0);
assert.equal(writes,beforeWrites,"Cross-section operations must not write or add Undo");
assert.equal(JSON.stringify(state.doc.toJSON()),beforeCross);
assert.equal(state.doc.check(),undefined);

// Crossing from the outer section to a neighboring top-level section is
// also forbidden, including when the source caret is inside a nested fold.
choose("b","c");
assert.equal(selectedSectionTaskCounts(editor),undefined);
assert.equal(setSelectedSectionTasksDone(editor,true),0);
assert.equal(writes,beforeWrites);
assert.equal(JSON.stringify(state.doc.toJSON()),beforeCross);

// A legitimate caret in the outer fold still completes only that fold's
// tasks (including its nested fold) in ONE transaction.
choose("a");
assert.deepEqual(selectedSectionTaskCounts(editor),{total:2,done:1,pending:1});
assert.equal(setSelectedSectionTasksDone(editor,true),1);
assert.equal(writes,beforeWrites+1);
assert.equal(state.doc.child(0).child(0).attrs.done,true);
assert.equal(state.doc.child(0).child(1).child(0).attrs.done,true);
assert.equal(state.doc.child(1).child(0).attrs.done,false);
assert.equal(state.doc.check(),undefined);

// A selection within the same nested fold is valid, and the neighboring
// outer/peer tasks remain completely untouched.
choose("b");
assert.deepEqual(selectedSectionTaskCounts(editor),{total:1,done:1,pending:0});
assert.equal(setSelectedSectionTasksDone(editor,false),1);
assert.equal(state.doc.child(0).child(0).attrs.done,true);
assert.equal(state.doc.child(0).child(1).child(0).attrs.done,false);
assert.equal(state.doc.child(1).child(0).attrs.done,false);
assert.equal(state.doc.check(),undefined);
console.log("Scoped checklist changes preserve sibling section tasks");
