import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {topLevelPageRanges} from "../src/lib/wave-page-actions";
import {moveWaveBlocksToPage,moveWaveBlocksToPageEdge} from "../src/lib/wave-block-motion";
import {readFileSync} from "node:fs";
const schema=new Schema({nodes:{
 doc:{content:"block+"},
 paragraph:{group:"block",content:"text*"},
 wavePageBreak:{group:"block",atom:true,attrs:{label:{default:""}}},
 waveImage:{group:"block",atom:true,attrs:{imageId:{default:""}}},
 text:{group:"inline"}
},marks:{}});
const p=(s:string)=>schema.nodes.paragraph.create(null,schema.text(s));
const mark=(s:string)=>schema.nodes.wavePageBreak.create({label:s});
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 p("first"),schema.nodes.waveImage.create({imageId:"photo-1"}),
 mark("second"),p("second"),mark("third"),p("third")
])});
let writes=0;
const editor={isEditable:true,isDestroyed:false,get state(){return state;},
 view:{dispatch(tr:any){writes++;state=state.apply(tr);}}} as any;
let pages=topLevelPageRanges(state.doc);
state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,pages[0].bodyStart+2)));
assert.equal(moveWaveBlocksToPage(editor,3),true);
assert.equal(writes,1);
assert.equal(state.selection.$from.parent.textContent,"first");
assert.equal(state.doc.child(0).type.name,"waveImage");
assert.equal(state.doc.lastChild?.textContent,"first");
assert.deepEqual(topLevelPageRanges(state.doc).slice(1).map(p=>state.doc.nodeAt(p.start)?.attrs.label),["second","third"]);
pages=topLevelPageRanges(state.doc);
state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,pages[2].bodyStart+2)));
assert.equal(moveWaveBlocksToPage(editor,1),true);
assert.equal(state.doc.child(1).textContent,"third");
assert.equal(state.doc.check(),undefined);
const snapshot=JSON.stringify(state.doc.toJSON()),count=writes;
for(const invalid of [0,4,NaN,1.5])assert.equal(moveWaveBlocksToPage(editor,invalid),false);
assert.equal(moveWaveBlocksToPage(editor,1),false);
assert.equal(writes,count);
assert.equal(JSON.stringify(state.doc.toJSON()),snapshot);
pages=topLevelPageRanges(state.doc);
state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,pages[0].bodyStart+2,pages[1].bodyStart+2)));
assert.equal(moveWaveBlocksToPage(editor,3),false);
assert.equal(writes,count);
const ui=readFileSync("src/routes/editor.$id.tsx","utf8");
assert.ok(ui.includes('aria-label="Номер страницы назначения блока"'));
assert.ok(ui.includes("moveWaveBlocksToPage(editor,targetBlockPageNumber)"));
console.log("Direct block transfer keeps page dividers, inline content and image references");

const edgeDoc=schema.nodes.doc.create(null,[
 p("alpha"),schema.nodes.waveImage.create({imageId:"photo-safe"}),
 p("beta"),mark("page two"),p("gamma"),p("delta")
]);
let edgeState=EditorState.create({schema,doc:edgeDoc}),edgeWrites=0;
const edgeEditor={isEditable:true,isDestroyed:false,get state(){return edgeState;},
 view:{dispatch(tr:any){edgeWrites++;edgeState=edgeState.apply(tr);}}} as any;
edgeState=edgeState.apply(edgeState.tr.setSelection(TextSelection.create(edgeState.doc,2)));
assert.equal(moveWaveBlocksToPageEdge(edgeEditor,"end"),true);
assert.deepEqual([edgeState.doc.child(0).type.name,edgeState.doc.child(1).textContent],
 ["waveImage","beta"]);
assert.equal(edgeState.doc.child(2).textContent,"alpha");
assert.equal(edgeState.selection.$from.parent.textContent,"alpha");
assert.equal(edgeState.doc.child(3).type.name,"wavePageBreak");
assert.equal(moveWaveBlocksToPageEdge(edgeEditor,"end"),false);
assert.equal(moveWaveBlocksToPageEdge(edgeEditor,"start"),true);
assert.equal(edgeState.doc.child(0).textContent,"alpha");
assert.equal(edgeState.doc.child(1).attrs.imageId,"photo-safe");
assert.equal(topLevelPageRanges(edgeState.doc).length,2);
assert.equal(edgeState.doc.check(),undefined);
assert.equal(edgeWrites,2);
assert.ok(ui.includes('moveWaveBlocksToPageEdge(editor,"start")'));
assert.ok(ui.includes('moveWaveBlocksToPageEdge(editor,"end")'));
