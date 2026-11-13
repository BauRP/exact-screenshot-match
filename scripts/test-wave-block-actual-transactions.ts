import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection,NodeSelection} from "@tiptap/pm/state";
import {moveSelectedWaveBlock,nestSelectedWaveBlock,liftWaveBlock,selectedWaveBlockPos,duplicateSelectedWaveBlock,setSelectedCalloutKind,moveContainingWaveSection,duplicateContainingWaveSection} from "../src/lib/wave-block-motion";
const schema=new Schema({
 nodes:{doc:{content:"block+"},paragraph:{group:"block",content:"text*"},
 waveFold:{group:"block",content:"block+",attrs:{title:{default:"Section"},collapsed:{default:false}}},
 waveCallout:{group:"block",content:"block+",attrs:{kind:{default:"important"}}},
 wavePageBreak:{group:"block",atom:true},
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
assert.equal(state.doc.child(1).type.name,"waveFold");
assert.equal(state.doc.child(1).textContent,"inside");
select("inside");
assert.equal(duplicateContainingWaveSection(editor),true);
assert.equal(state.doc.child(1).type.name,"waveFold");
assert.equal(state.doc.child(2).type.name,"waveFold");
assert.equal(state.doc.child(1).textContent,state.doc.child(2).textContent);
assert.equal(state.doc.check(),undefined);

// Nested page divider remains nested: lifting it would silently create a page.
let marker=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 p("before-page"),schema.nodes.waveFold.create({title:"nested"},[
 p("section-first"),schema.nodes.wavePageBreak.create(),p("section-last")]),p("after-page")
])});
let markerEdits=0;
const markerEditor={isEditable:true,isDestroyed:false,get state(){return marker;},
 view:{dispatch(tr:any){markerEdits++;marker=marker.apply(tr);}}} as any;
let markerPos:number|undefined;
marker.doc.descendants((node,pos)=>{if(node.type.name==="wavePageBreak")markerPos=pos;});
assert.notEqual(markerPos,undefined);
const markerBefore=JSON.stringify(marker.doc.toJSON());
assert.equal(liftWaveBlock(markerEditor,()=>markerPos),false);
assert.equal(markerEdits,0);
assert.equal(JSON.stringify(marker.doc.toJSON()),markerBefore);
assert.equal(marker.doc.check(),undefined);

// Multi-callout text selections must not change only their first callout.
let callState=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 schema.nodes.waveCallout.create({kind:"important"},[p("first callout")]),
 schema.nodes.waveCallout.create({kind:"info"},[p("second callout")]),
 p("outside callout")
])});
let callEdits=0;
const callEditor={isEditable:true,isDestroyed:false,get state(){return callState;},
 view:{dispatch(tr:any){callEdits++;callState=callState.apply(tr);}}} as any;
const findCallText=(label:string):number=>{
 let found:number|undefined;
 callState.doc.descendants((node,pos)=>{if(node.type.name==="paragraph"&&node.textContent===label)found=pos+1;});
 assert.notEqual(found,undefined);return found!;
};
callState=callState.apply(callState.tr.setSelection(TextSelection.create(
 callState.doc,findCallText("first callout"),findCallText("second callout")+2)));
const callBefore=JSON.stringify(callState.doc.toJSON());
assert.equal(setSelectedCalloutKind(callEditor,"warning"),false);
assert.equal(callEdits,0);
assert.equal(JSON.stringify(callState.doc.toJSON()),callBefore);
callState=callState.apply(callState.tr.setSelection(TextSelection.create(
 callState.doc,findCallText("first callout"),findCallText("outside callout")+2)));
assert.equal(setSelectedCalloutKind(callEditor,"warning"),false);
assert.equal(callEdits,0);
callState=callState.apply(callState.tr.setSelection(TextSelection.create(
 callState.doc,findCallText("first callout")+2)));
assert.equal(setSelectedCalloutKind(callEditor,"warning"),true);
assert.equal(callEdits,1);
assert.equal(callState.doc.child(0).attrs.kind,"warning");
assert.equal(callState.doc.child(1).attrs.kind,"info");
assert.equal(callState.doc.check(),undefined);

// A moved section can already contain nested sections. Do not create depth 6.
const depthFold=(depth:number):any=>schema.nodes.waveFold.create({title:"depth "+depth},
 depth===1?[p("deep-leaf")]:[p("level "+depth),depthFold(depth-1)]);
const nesting=(depth:number)=>{
 let nested=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 depthFold(1),depthFold(depth),p("tail")
 ])});
 let edits=0;
 const edit={isEditable:true,isDestroyed:false,get state(){return nested;},
  view:{dispatch(tr:any){edits++;nested=nested.apply(tr);}}} as any;
 const at=nested.doc.child(0).nodeSize;
 nested=nested.apply(nested.tr.setSelection(NodeSelection.create(nested.doc,at)));
 return {edit,doc:()=>nested.doc,edits:()=>edits};
};
const tooDeep=nesting(5),savedDeep=JSON.stringify(tooDeep.doc().toJSON());
assert.equal(nestSelectedWaveBlock(tooDeep.edit),false);
assert.equal(tooDeep.edits(),0);
assert.equal(JSON.stringify(tooDeep.doc().toJSON()),savedDeep);
const allowed=nesting(4);
assert.equal(nestSelectedWaveBlock(allowed.edit),true);
assert.equal(allowed.edits(),1);
assert.equal(allowed.doc().child(0).type.name,"waveFold");
assert.equal(allowed.doc().child(0).child(1).type.name,"waveFold");
assert.equal(allowed.doc().check(),undefined);
console.log("Actual ProseMirror move, nesting, outdent and duplicate transactions passed");
