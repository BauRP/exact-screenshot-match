import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {setFoldSectionsToDepth,setCurrentPageFoldSections} from "../src/lib/wave-section-batch";
import {topLevelPageRanges} from "../src/lib/wave-page-actions";
const schema=new Schema({nodes:{doc:{content:"block+"},paragraph:{group:"block",content:"text*"},waveFold:{group:"block",content:"block+",attrs:{collapsed:{default:false}}},wavePageBreak:{group:"block",atom:true},text:{group:"inline"}},marks:{}});
const p=(v:string)=>schema.nodes.paragraph.create(null,schema.text(v));
const fold=(content:any[])=>schema.nodes.waveFold.create({collapsed:false},content);
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[fold([p("one"),fold([p("two"),fold([p("three")])])])])});
const editor={isEditable:true,isDestroyed:false,get state(){return state},view:{dispatch(tr:any){state=state.apply(tr)}}} as any;
assert.equal(setFoldSectionsToDepth(editor,1),2);
assert.equal(state.doc.firstChild?.attrs.collapsed,false);
assert.equal(state.doc.firstChild?.child(1).attrs.collapsed,true);
assert.equal(state.doc.textContent,"onetwothree");
assert.equal(setFoldSectionsToDepth(editor,2),1);
assert.equal(state.doc.firstChild?.child(1).attrs.collapsed,false);
assert.equal(state.doc.firstChild?.child(1).child(1).attrs.collapsed,true);
assert.equal(setFoldSectionsToDepth(editor,3),1);
console.log("Fold depth controls retain all nested contents");

const pagesDoc=schema.nodes.doc.create(null,[p("first"),
 schema.nodes.wavePageBreak.create(),fold([p("second"),fold([p("inner")])]),
 schema.nodes.wavePageBreak.create(),fold([p("third")])]);
let pageState=EditorState.create({schema,doc:pagesDoc});
let edits=0;
const pageEditor={isEditable:true,isDestroyed:false,get state(){return pageState;},
 view:{dispatch(tr:any){edits++;pageState=pageState.apply(tr);}}} as any;
const ranges=topLevelPageRanges(pageState.doc);
pageState=pageState.apply(pageState.tr.setSelection(TextSelection.create(pageState.doc,ranges[1].bodyStart+2)));
assert.equal(setCurrentPageFoldSections(pageEditor,true),2);
assert.equal(edits,1);
assert.equal(pageState.doc.child(2).attrs.collapsed,true);
assert.equal(pageState.doc.child(2).child(1).attrs.collapsed,true);
assert.equal(pageState.doc.child(4).attrs.collapsed,false,"Other pages must stay visible");
assert.equal(setCurrentPageFoldSections(pageEditor,false),2);
assert.equal(pageState.doc.child(4).attrs.collapsed,false);
pageState=pageState.apply(pageState.tr.setSelection(TextSelection.create(pageState.doc,
 ranges[1].bodyStart+2,ranges[2].bodyStart+2)));
assert.equal(setCurrentPageFoldSections(pageEditor,true),0,"Never alter partial cross-page selections");
assert.equal(edits,2);
