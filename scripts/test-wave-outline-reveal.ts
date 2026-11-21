import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState} from "@tiptap/pm/state";
import {revealOutlinePosition} from "../src/lib/wave-outline-navigation";
const schema=new Schema({nodes:{
 doc:{content:"block+"},paragraph:{group:"block",content:"text*"},
 waveFold:{group:"block",content:"block+",attrs:{collapsed:{default:false},title:{default:""}}},
 text:{group:"inline"}},marks:{}});
const p=(t:string)=>schema.nodes.paragraph.create(null,schema.text(t));
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 schema.nodes.waveFold.create({collapsed:true,title:"outer"},[
  schema.nodes.waveFold.create({collapsed:true,title:"inner"},[p("hidden")])])])});
const editor={isDestroyed:false,get state(){return state;},
 view:{dispatch(tr:any){state=state.apply(tr);}},
 chain(){return {focus(){return this;},setTextSelection(_pos:number){return this;},run(){return true;}}}
} as any;
assert.equal(revealOutlinePosition(editor,4),true);
assert.equal(state.doc.firstChild?.attrs.collapsed,false);
assert.equal(state.doc.firstChild?.firstChild?.attrs.collapsed,false);
assert.equal(state.doc.textContent,"hidden");
assert.equal(revealOutlinePosition(editor,-1),false);
console.log("Nested folded-section outline navigation reveals children");
