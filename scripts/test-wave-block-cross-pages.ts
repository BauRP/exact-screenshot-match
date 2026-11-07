import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {moveWaveBlocksToAdjacentPage} from "../src/lib/wave-block-motion";
import {readFileSync} from "node:fs";
const schema=new Schema({nodes:{
 doc:{content:"block+"},
 paragraph:{group:"block",content:"inline*"},
 wavePageBreak:{group:"block",atom:true},
 waveImage:{group:"block",atom:true,attrs:{imageId:{default:""}}},
 waveFold:{group:"block",content:"block+"},
 text:{group:"inline"}
},marks:{strong:{}}});
const p=(value:string)=>schema.nodes.paragraph.create(null,schema.text(value,[schema.marks.strong.create()]));
const divider=()=>schema.nodes.wavePageBreak.create();
const picture=schema.nodes.waveImage.create({imageId:"local-photo-id"});
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 p("one"),p("two"),divider(),p("three"),picture,p("four"),divider(),p("five")
])});
let edits=0;
const editor={isEditable:true,isDestroyed:false,get state(){return state;},
 view:{dispatch(tr:any){edits++;state=state.apply(tr)}}} as any;
const top=()=>Array.from({length:state.doc.childCount},(_,i)=>{
 const n=state.doc.child(i);
 return n.type.name==="paragraph"?n.textContent:n.type.name==="waveImage"?"photo":n.type.name==="wavePageBreak"?"|":n.type.name;
});
const pos=(name:string)=>{
 let found:number|undefined;
 state.doc.descendants((node,at)=>{if(node.type.name==="paragraph"&&node.textContent===name)found=at+1;});
 assert.notEqual(found,undefined);
 return found!;
};
const select=(name:string)=>{state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,pos(name))));};
select("two");
assert.equal(moveWaveBlocksToAdjacentPage(editor,"next"),true);
assert.deepEqual(top(),["one","|","two","three","photo","four","|","five"]);
assert.equal(state.doc.child(2).firstChild?.marks[0].type.name,"strong");
select("two");
assert.equal(moveWaveBlocksToAdjacentPage(editor,"previous"),true);
assert.deepEqual(top(),["one","two","|","three","photo","four","|","five"]);
select("one");
assert.equal(moveWaveBlocksToAdjacentPage(editor,"previous"),false);
select("four");
assert.equal(moveWaveBlocksToAdjacentPage(editor,"next"),true);
assert.deepEqual(top(),["one","two","|","three","photo","|","four","five"]);
select("four");
assert.equal(moveWaveBlocksToAdjacentPage(editor,"next"),false);
const start=pos("three"), end=pos("four");
state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,start,end)));
assert.equal(moveWaveBlocksToAdjacentPage(editor,"next"),false,"Cannot cross page dividers");
assert.equal(state.doc.check(),undefined);
assert.equal(state.doc.child(4).attrs.imageId,"local-photo-id");
assert.equal(edits,3,"Rejected actions must not dispatch");
const source=readFileSync("src/routes/editor.$id.tsx","utf8");
assert.ok(source.includes('moveWaveBlocksToAdjacentPage(editor,"previous")'));
assert.ok(source.includes('moveWaveBlocksToAdjacentPage(editor,"next")'));
// Moving a block from inside a folded section transfers the entire section,
// including nested media references, instead of quietly refusing the action.
let nested=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 p("start"),
 schema.nodes.waveFold.create(null,[p("inside fold"),schema.nodes.waveImage.create({imageId:"inside-photo"})]),
 divider(),p("next page")
])});
let foldEdits=0;
const nestedEditor={isEditable:true,isDestroyed:false,get state(){return nested;},
 view:{dispatch(tr:any){foldEdits++;nested=nested.apply(tr);}}} as any;
const locateInside=()=>{
 let found:number|undefined;
 nested.doc.descendants((node,at)=>{
  if(node.type.name==="paragraph"&&node.textContent==="inside fold")found=at+2;
 });
 assert.notEqual(found,undefined);
 return found!;
};
nested=nested.apply(nested.tr.setSelection(TextSelection.create(nested.doc,locateInside())));
assert.equal(moveWaveBlocksToAdjacentPage(nestedEditor,"next"),true);
assert.equal(nested.doc.child(1).type.name,"wavePageBreak");
assert.equal(nested.doc.child(2).type.name,"waveFold");
assert.equal(nested.doc.child(2).child(1).attrs.imageId,"inside-photo");
assert.equal(nested.doc.child(2).child(0).firstChild?.marks[0].type.name,"strong");
nested=nested.apply(nested.tr.setSelection(TextSelection.create(nested.doc,locateInside())));
assert.equal(moveWaveBlocksToAdjacentPage(nestedEditor,"previous"),true);
assert.equal(nested.doc.child(1).type.name,"waveFold");
assert.equal(nested.doc.child(1).child(1).attrs.imageId,"inside-photo");
assert.equal(nested.doc.check(),undefined);
assert.equal(foldEdits,2);
console.log("Cross-page blocks preserve media, formatting, page boundaries and atomic edits");
