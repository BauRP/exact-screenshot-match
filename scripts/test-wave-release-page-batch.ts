import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection,NodeSelection} from "@tiptap/pm/state";
import {duplicateCurrentPageMultiple,topLevelPageRanges} from "../src/lib/wave-page-actions";
import {slashBlankPages,slashNestedSection} from "../src/lib/wave-slash-commands";
import {copyPdfMetadata} from "../src/lib/note-copy";
const schema=new Schema({nodes:{
 doc:{content:"block+"},paragraph:{group:"block",content:"text*"},
 wavePageBreak:{group:"block",atom:true,attrs:{label:{default:""}}},
 waveFold:{group:"block",content:"block+",attrs:{title:{default:"Раздел"},collapsed:{default:false}}},
 waveImage:{group:"block",atom:true,attrs:{imageId:{default:""}}},
 text:{group:"inline"}},marks:{strong:{}}
});
const p=(s:string)=>schema.nodes.paragraph.create(null,s?schema.text(s,[schema.marks.strong.create()]):undefined);
const mark=(s:string)=>schema.nodes.wavePageBreak.create({label:s});
const doc=schema.nodes.doc.create(null,[p("intro"),mark("Important"),p("Styled"),schema.nodes.waveImage.create({imageId:"offline-image"}),mark("end"),p("tail")]);
let state=EditorState.create({schema,doc}),writes=0;
const ed={isEditable:true,isDestroyed:false,get state(){return state;},view:{dispatch(tr:any){writes++;state=state.apply(tr);}}} as any;
const range=topLevelPageRanges(state.doc)[1];
state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,range.bodyStart+2)));
assert.equal(duplicateCurrentPageMultiple(ed,2),true);
assert.equal(writes,1,"Both copies created in one undoable transaction");
assert.equal(topLevelPageRanges(state.doc).length,5);
assert.equal(state.selection.$from.parent.textContent,"Styled","Caret follows last copy");
assert.equal(state.doc.textContent,"introStyledStyledStyledtail");
const imageIds:string[]=[];
state.doc.descendants(node=>{if(node.type.name==="waveImage")imageIds.push(node.attrs.imageId);});
assert.deepEqual(imageIds,["offline-image","offline-image","offline-image"]);
for(const block of [state.doc.child(2),state.doc.child(5),state.doc.child(8)]){
 assert.equal(block.firstChild?.marks[0].type.name,"strong");
}
assert.equal(state.doc.check(),undefined);
const old=JSON.stringify(state.doc.toJSON());
assert.equal(duplicateCurrentPageMultiple(ed,1 as any),false);
assert.equal(writes,1);
assert.equal(JSON.stringify(state.doc.toJSON()),old);
const pages=topLevelPageRanges(state.doc);
state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,pages[1].bodyStart+1,pages[3].bodyStart+2)));
assert.equal(duplicateCurrentPageMultiple(ed,3),false,"Cross-page selections never guess a page");
assert.equal(writes,1);
const namedAt=topLevelPageRanges(state.doc)[1].start;
state=state.apply(state.tr.setSelection(NodeSelection.create(state.doc,namedAt)));
assert.equal(duplicateCurrentPageMultiple(ed,3),true);
assert.equal(writes,2);
assert.ok(state.selection instanceof NodeSelection);
assert.ok(String((state.selection as NodeSelection).node.attrs.label).includes("копия 3"));
assert.equal(state.doc.check(),undefined);
const originalPdf={fileName:"doc.pdf",size:200,pageCount:2,overlays:[{
 id:"overlay",page:1,xPct:0.1,yPct:0.2,widthPct:0.5,heightPct:0.1,cover:false,text:"AB",
 runs:[{text:"A",bold:true},{text:"B",italic:true}]
}]};
const cloned=copyPdfMetadata(originalPdf)!;
assert.deepEqual(cloned,originalPdf);
assert.notStrictEqual(cloned,originalPdf);
assert.notStrictEqual(cloned.overlays,originalPdf.overlays);
assert.notStrictEqual(cloned.overlays![0],originalPdf.overlays[0]);
assert.notStrictEqual(cloned.overlays![0].runs![0],originalPdf.overlays[0].runs[0]);
cloned.overlays![0].runs![0].text="Changed";
assert.equal(originalPdf.overlays[0].runs[0].text,"A","Original PDF run is not modified");
assert.equal(copyPdfMetadata(undefined),undefined);
for(const count of [3,5] as const){
 const json=slashBlankPages(count);
 assert.equal(json.length,count*2);
 const blocks=json.map(item=>schema.nodeFromJSON(item));
 const inserted=schema.nodes.doc.create(null,[p("start"),...blocks,p("end")]);
 assert.equal(topLevelPageRanges(inserted).length,count+1);
 assert.equal(inserted.textContent,"startend");
 assert.equal(inserted.check(),undefined);
}
const nested=schema.nodeFromJSON(slashNestedSection());
assert.equal(nested.type.name,"waveFold");
assert.equal(nested.child(1).type.name,"waveFold");
assert.equal(nested.child(1).attrs.title,"Вложенный раздел");
assert.equal(nested.check(),undefined);
const edit=readFileSync("src/routes/editor.$id.tsx","utf8"),home=readFileSync("src/routes/index.tsx","utf8");
for(const token of ['id:"page3"','id:"page5"','id:"foldnested"','duplicateCurrentPageMultiple(editor,2)','duplicateCurrentPageMultiple(editor,3)','slashNestedSection()'])assert.ok(edit.includes(token),token);
assert.ok(home.includes("copyPdfMetadata(original.pdf)"));
assert.ok(!home.includes("structuredClone(original.pdf)"));
console.log("Atomic page copies, nested slash sections, page batches, PDF run isolation and Android compatibility");
