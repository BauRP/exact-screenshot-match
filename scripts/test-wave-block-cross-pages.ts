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
console.log("Cross-page blocks preserve media, formatting, page boundaries and atomic edits");
