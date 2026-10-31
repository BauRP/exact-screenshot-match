import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {moveSelectedWaveBlock,nestSelectedWaveBlock,liftWaveBlock,selectedWaveBlockPos,duplicateSelectedWaveBlock} from "../src/lib/wave-block-motion";
const schema=new Schema({
 nodes:{doc:{content:"block+"},paragraph:{group:"block",content:"text*"},
 waveFold:{group:"block",content:"block+",attrs:{title:{default:"Section"},collapsed:{default:false}}},
 text:{group:"inline"}},marks:{}
});
const p=(t:string)=>schema.nodes.paragraph.create(null,schema.text(t));
const fold=schema.nodes.waveFold.create({title:"Folder"},[p("inside")]);
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[p("first"),p("second"),fold,p("last")])});
const editor={isEditable:true,isDestroyed:false,get state(){return state;},
 view:{dispatch(tr:any){state=state.apply(tr);}}} as any;
function select(label:string){
 let at:number|undefined;
 state.doc.descendants((node,pos)=>{if(node.type.name==="paragraph"&&node.textContent===label)at=pos+1;});
 assert.notEqual(at,undefined,"missing paragraph "+label);
 state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,at!)));
}
const top=()=>Array.from({length:state.doc.childCount},(_,i)=>state.doc.child(i).type.name==="paragraph"?state.doc.child(i).textContent:state.doc.child(i).type.name);
select("first");
assert.equal(moveSelectedWaveBlock(editor,"down"),true);
assert.deepEqual(top(),["second","first","waveFold","last"]);
select("first");
assert.equal(moveSelectedWaveBlock(editor,"up"),true);
assert.deepEqual(top(),["first","second","waveFold","last"]);
select("last");
assert.equal(nestSelectedWaveBlock(editor),true);
assert.deepEqual(top(),["first","second","waveFold"]);
assert.deepEqual(state.doc.lastChild!.content.content.map((n:any)=>n.textContent),["inside","last"]);
select("last");
assert.equal(typeof selectedWaveBlockPos(editor),"number");
assert.equal(liftWaveBlock(editor,()=>selectedWaveBlockPos(editor)),true);
assert.deepEqual(top(),["first","second","waveFold","last"]);
assert.equal(state.doc.child(2).textContent,"inside");
select("last");
assert.equal(duplicateSelectedWaveBlock(editor),true);
assert.deepEqual(top(),["first","second","waveFold","last","last"]);
assert.equal(state.doc.check(),undefined);
console.log("Actual ProseMirror move, nesting, outdent and duplicate transactions passed");
