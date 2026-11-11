import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {currentPageTaskCounts,setCurrentPageTasksDone} from "../src/lib/wave-checklist-actions";
const schema=new Schema({nodes:{doc:{content:"block+"},paragraph:{group:"block",content:"text*"},waveFold:{group:"block",content:"block+"},wavePageBreak:{group:"block",atom:true},waveChecklistItem:{group:"block",content:"text*",attrs:{done:{default:false}}},text:{group:"inline"}},marks:{}});
const task=(s:string)=>schema.nodes.waveChecklistItem.create(null,schema.text(s));
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[task("first"),schema.nodes.wavePageBreak.create(),schema.nodes.waveFold.create(null,[task("nested")]),task("second"),schema.nodes.wavePageBreak.create(),task("third")])});
let dispatched=0;
const editor={isEditable:true,isDestroyed:false,get state(){return state;},view:{dispatch(tr:any){dispatched++;state=state.apply(tr);}}} as any;
const choose=(text:string)=>{let at=-1;state.doc.descendants((n,pos)=>{if(n.type.name==="waveChecklistItem"&&n.textContent===text)at=pos+1;});assert.ok(at>0);state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,at)));};
choose("nested");assert.equal(currentPageTaskCounts(editor).total,2);
assert.equal(setCurrentPageTasksDone(editor,true),2);
choose("first");assert.equal(currentPageTaskCounts(editor).done,0);
choose("third");assert.equal(currentPageTaskCounts(editor).done,0);
choose("second");assert.equal(currentPageTaskCounts(editor).done,2);
assert.equal(setCurrentPageTasksDone(editor,false),2);
assert.equal(state.doc.textContent,"firstnestedsecondthird");
// Crossing a page boundary cannot silently complete/reset the first page.
let firstPos=-1,thirdPos=-1;
state.doc.descendants((node,pos)=>{
 if(node.type.name!=="waveChecklistItem")return;
 if(node.textContent==="first")firstPos=pos+1;
 if(node.textContent==="third")thirdPos=pos+2;
});
assert.ok(firstPos>=0&&thirdPos>=0);
state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,firstPos,thirdPos)));
const before=JSON.stringify(state.doc.toJSON()),writes=dispatched;
assert.deepEqual(currentPageTaskCounts(editor),{total:0,done:0,pending:0},
 "Cross-page selections have no single active page");
assert.equal(setCurrentPageTasksDone(editor,true),0);
assert.equal(setCurrentPageTasksDone(editor,false),0);
assert.equal(dispatched,writes,"No invalid edit or Undo entry");
assert.equal(JSON.stringify(state.doc.toJSON()),before,"All pages and nested tasks remain untouched");
choose("nested");
assert.equal(setCurrentPageTasksDone(editor,true),2,
 "A caret inside a nested section still controls only its page");
choose("first");assert.equal(currentPageTaskCounts(editor).done,0);
choose("third");assert.equal(currentPageTaskCounts(editor).done,0);
assert.equal(state.doc.check(),undefined);
console.log("Page-scoped task actions protect cross-page selections and nested content");
