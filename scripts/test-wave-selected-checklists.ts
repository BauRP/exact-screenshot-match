import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {setSelectedChecklistShape,setSelectedTasksDone,continueSelectedChecklistRows} from "../src/lib/wave-checklist-actions";
import {readFileSync} from "node:fs";
const schema=new Schema({nodes:{
 doc:{content:"block+"},waveChecklistItem:{group:"block",content:"inline*",attrs:{
 shape:{default:"square"},done:{default:false},textDirection:{default:"ltr"}}},
 paragraph:{group:"block",content:"inline*"},
 wavePageBreak:{group:"block",atom:true},
 text:{group:"inline"}
},marks:{strong:{}}});
const strong=schema.marks.strong.create();
const task=(text:string,done=false)=>schema.nodes.waveChecklistItem.create({done},schema.text(text,[strong]));
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 task("one"),task("two",true),schema.nodes.wavePageBreak.create(),task("three")
])});
let dispatched=0;
const mock={isEditable:true,isDestroyed:false,get state(){return state;},
 view:{dispatch(tr:any){state=state.apply(tr);dispatched++;}}} as any;
function positions(){let n=0;return Array.from({length:state.doc.childCount},(_,i)=>{const x=n;n+=state.doc.child(i).nodeSize;return x;});}
const select=(from:number,to=from)=>{state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,from,to)));};
let p=positions();select(p[0]+1,p[1]+3);
assert.equal(setSelectedChecklistShape(mock,"diamond"),true);
assert.equal(dispatched,1);
assert.equal(state.doc.child(0).attrs.shape,"diamond");
assert.equal(state.doc.child(1).attrs.shape,"diamond");
assert.equal(state.doc.child(3).attrs.shape,"square","No other page changed");
assert.equal(state.doc.child(1).attrs.done,true,"Completion flag preserved");
assert.equal(state.doc.child(0).firstChild?.marks[0].type.name,"strong");
assert.equal(setSelectedTasksDone(mock,true),1);
assert.equal(dispatched,2);
assert.equal(state.doc.child(0).attrs.done,true);
assert.equal(state.doc.child(1).attrs.done,true);
assert.equal(state.doc.child(3).attrs.done,false);
assert.equal(setSelectedTasksDone(mock,true),0,"No-op cannot make an extra undo item");
p=positions();select(p[0]+1,p[3]+2);
assert.equal(setSelectedChecklistShape(mock,"circle"),false,"Must refuse page crossing");
assert.equal(setSelectedTasksDone(mock,false),0);
assert.equal(dispatched,2);
p=positions();select(p[3]+2);
assert.equal(setSelectedChecklistShape(mock,"circle"),true,"Caret edits a single task");
assert.equal(state.doc.child(3).attrs.shape,"circle");
assert.equal(setSelectedTasksDone(mock,true),1);
assert.equal(state.doc.child(3).attrs.done,true);
assert.equal(state.doc.check(),undefined);
const ui=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const s of ['setSelectedTasksDone(editor,true)','setSelectedTasksDone(editor,false)',
 'aria-label="Отметить выделенные задачи выполненными"',
 'Изменить форму выделенных отметок',
 'style={{order:10+prefs.toolbarOrder.indexOf("direction")}}'])assert.ok(ui.includes(s),s);
console.log("Selected task bulk status and shape preserve marks, page boundaries and atomic undo");

let extended=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 task("alpha",true),task("beta",false),schema.nodes.wavePageBreak.create(),task("other",true)
])});
let inserts=0;
const extending={isEditable:true,isDestroyed:false,get state(){return extended;},
 view:{dispatch(tr:any){inserts++;extended=extended.apply(tr);}}} as any;
const originalContent=extended.doc.textContent;
extended=extended.apply(extended.tr.setSelection(TextSelection.create(extended.doc,2,extended.doc.child(0).nodeSize+2)));
assert.equal(continueSelectedChecklistRows(extending),2);
assert.equal(inserts,1,"One transaction must continue both selected tasks");
assert.equal(extended.doc.childCount,6);
assert.equal(extended.doc.child(0).textContent,"alpha");
assert.equal(extended.doc.child(0).attrs.done,true);
assert.equal(extended.doc.child(1).textContent,"");
assert.equal(extended.doc.child(1).attrs.done,false);
assert.equal(extended.doc.child(2).textContent,"beta");
assert.equal(extended.doc.child(3).textContent,"");
assert.equal(extended.doc.child(3).attrs.done,false);
assert.equal(extended.doc.child(4).type.name,"wavePageBreak");
assert.equal(extended.doc.child(5).textContent,"other");
assert.equal(extended.doc.textContent,originalContent);
assert.equal(extended.doc.child(0).firstChild?.marks[0].type.name,"strong");
assert.equal(extended.selection.$from.parent.type.name,"waveChecklistItem");
assert.equal(extended.doc.check(),undefined);
const savedState=JSON.stringify(extended.doc.toJSON());
let far=-1;
extended.doc.descendants((node,pos)=>{if(node.type.name==="waveChecklistItem"&&node.textContent==="other")far=pos+2;});
extended=extended.apply(extended.tr.setSelection(TextSelection.create(extended.doc,2,far)));
assert.equal(continueSelectedChecklistRows(extending),0);
assert.equal(inserts,1);
assert.equal(JSON.stringify(extended.doc.toJSON()),savedState);
const uiTasks=readFileSync("src/routes/editor.$id.tsx","utf8");
assert.ok(uiTasks.includes("continueSelectedChecklistRows(editor)"));
assert.ok(uiTasks.includes('aria-label="Продолжить каждую выделенную задачу новым пунктом"'));
