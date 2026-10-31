import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {moveSelectedWaveBlock,nestSelectedWaveBlock,liftWaveBlock,selectedWaveBlockPos,duplicateSelectedWaveBlock,setSelectedCalloutKind,moveContainingWaveSection,duplicateContainingWaveSection} from "../src/lib/wave-block-motion";
const schema=new Schema({
 nodes:{doc:{content:"block+"},paragraph:{group:"block",content:"text*"},
 waveFold:{group:"block",content:"block+",attrs:{title:{default:"Section"},collapsed:{default:false}}},
 waveCallout:{group:"block",content:"block+",attrs:{kind:{default:"important"}}},
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
const last=state.doc.content.size;
state=state.apply(state.tr.insert(last,schema.nodes.waveCallout.create({kind:"important"},[p("important text")])));
select("important text");
assert.equal(setSelectedCalloutKind(editor,"warning"),true);
assert.equal(state.doc.lastChild?.attrs.kind,"warning");
assert.equal(state.doc.lastChild?.textContent,"important text");
select("inside");
assert.equal(moveContainingWaveSection(editor,"up"),true);
assert.equal(state.doc.firstChild?.type.name,"waveFold");
assert.equal(state.doc.firstChild?.textContent,"inside");
select("inside");
assert.equal(duplicateContainingWaveSection(editor),true);
assert.equal(state.doc.child(0).type.name,"waveFold");
assert.equal(state.doc.child(1).type.name,"waveFold");
assert.equal(state.doc.child(0).textContent,state.doc.child(1).textContent);
assert.equal(state.doc.check(),undefined);
console.log("Actual ProseMirror move, nesting, outdent and duplicate transactions passed");
