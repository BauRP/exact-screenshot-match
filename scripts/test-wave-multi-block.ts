import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {selectedWaveSiblingRange,moveSelectedWaveBlock,duplicateSelectedWaveBlock} from "../src/lib/wave-block-motion";
const schema=new Schema({nodes:{
 doc:{content:"block+"},paragraph:{group:"block",content:"text*"},
 wavePageBreak:{group:"block",atom:true},
 waveFold:{group:"block",content:"block+"},
 waveImage:{group:"block",atom:true,attrs:{imageId:{default:""}}},
 text:{group:"inline"}
},marks:{}});
const p=(value:string)=>schema.nodes.paragraph.create(null,schema.text(value));
const image=schema.nodes.waveImage.create({imageId:"photo-123"});
const divider=schema.nodes.wavePageBreak.create();
const folded=schema.nodes.waveFold.create(null,[p("fold one"),p("fold two"),p("fold three")]);
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[p("before"),p("first"),image,p("last"),divider,p("other"),folded])});
const editor={isEditable:true,isDestroyed:false,get state(){return state;},
 view:{dispatch(tr:any){state=state.apply(tr);}}} as any;
const positions=()=>{let offset=0;return Array.from({length:state.doc.childCount},(_,i)=>{const current=offset;offset+=state.doc.child(i).nodeSize;return current;});};
const pick=(from:number,to:number)=>{state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,from,to)));};
let at=positions();
pick(at[1]+1,at[3]+1);
assert.equal(selectedWaveSiblingRange(editor)?.end-selectedWaveSiblingRange(editor)!.start,3);
assert.equal(moveSelectedWaveBlock(editor,"up"),true);
assert.equal(state.doc.child(0).textContent,"first");
assert.equal(state.doc.child(1).attrs.imageId,"photo-123");
assert.equal(state.doc.child(2).textContent,"last");
assert.equal(state.doc.child(3).textContent,"before");
assert.equal(state.doc.check(),undefined);
at=positions();
pick(at[0]+1,at[2]+1);
assert.equal(duplicateSelectedWaveBlock(editor),true);
assert.equal(state.doc.childCount,10);
assert.equal(state.doc.child(4).attrs.imageId,"photo-123");
assert.equal(state.doc.child(6).type.name,"wavePageBreak");
// A text block may never cross page boundaries with the generic action.
at=positions();pick(at[5]+1,at[5]+2);
assert.equal(moveSelectedWaveBlock(editor,"down"),false);
assert.equal(state.doc.child(6).type.name,"wavePageBreak");
// Group operations may not include a page marker.
at=positions();pick(at[5]+1,at[7]+1);
assert.equal(duplicateSelectedWaveBlock(editor),false);
assert.equal(moveSelectedWaveBlock(editor,"up"),false);
// Deep selections inside a section move only its direct children.
let nestedAt=0;state.doc.descendants((node,pos)=>{if(node.isText&&node.text==="fold one")nestedAt=pos;});
pick(nestedAt,nestedAt+("fold one".length+("fold two".length)+4));
assert.equal(selectedWaveSiblingRange(editor)?.depth,1);
assert.equal(moveSelectedWaveBlock(editor,"down"),true);
assert.equal(state.doc.lastChild?.type.name,"waveFold");
assert.equal(state.doc.check(),undefined);
console.log("Real multi-block move/duplicate preserve image references, section boundaries, page markers and document validity");
