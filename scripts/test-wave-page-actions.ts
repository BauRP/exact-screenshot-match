import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {duplicateCurrentPage,moveCurrentPage,topLevelPageRanges,insertBlankPageAfter,insertBlankPageBefore,mergeCurrentPageWithNext,removeAllEmptyPages,removeEmptyCurrentPage,isEmptyPageBody,splitPageAtCaret} from "../src/lib/wave-page-actions";
const schema=new Schema({nodes:{doc:{content:"block+"},paragraph:{group:"block",content:"text*"},wavePageBreak:{group:"block",atom:true,attrs:{label:{default:""}}},waveFold:{group:"block",content:"block+"},text:{group:"inline"}},marks:{}});
const p=(s:string)=>schema.nodes.paragraph.create(null,schema.text(s));
const page=(s:string)=>schema.nodes.wavePageBreak.create({label:s});
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[p("one"),page("second"),p("two"),page("third"),p("three")])});
const editor={isEditable:true,isDestroyed:false,get state(){return state;},view:{dispatch(tr:any){state=state.apply(tr);}}} as any;
const choose=(index:number)=>{const pages=topLevelPageRanges(state.doc);state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,pages[index].bodyStart+1)));};
assert.equal(topLevelPageRanges(state.doc).length,3);
choose(1);assert.equal(duplicateCurrentPage(editor),true);
assert.equal(topLevelPageRanges(state.doc).length,4);
assert.equal(state.doc.textContent,"onetwotwothree");
assert.ok(state.doc.textContent.includes("three"));
choose(2);assert.equal(moveCurrentPage(editor,"down"),true);
assert.equal(state.doc.textContent,"onetwothreetwo");
choose(3);assert.equal(moveCurrentPage(editor,"up"),true);
assert.equal(state.doc.textContent,"onetwotwothree");
choose(0);assert.equal(moveCurrentPage(editor,"up"),false);
const nested=schema.nodes.doc.create(null,[p("x"),schema.nodes.waveFold.create(null,[page("nested"),p("y")])]);
assert.equal(topLevelPageRanges(nested).length,1);
choose(1);
assert.equal(insertBlankPageAfter(editor),true);
assert.equal(topLevelPageRanges(state.doc).length,5);
choose(2);
assert.equal(removeEmptyCurrentPage(editor),true);
assert.equal(topLevelPageRanges(state.doc).length,4);
choose(1);
assert.equal(removeEmptyCurrentPage(editor),false);
choose(0);
assert.equal(insertBlankPageBefore(editor),true);
assert.equal(topLevelPageRanges(state.doc).length,5);
assert.equal(state.doc.textContent,"onetwotwothree");
choose(0);
assert.equal(mergeCurrentPageWithNext(editor),true);
assert.equal(topLevelPageRanges(state.doc).length,4);
choose(3);
assert.equal(mergeCurrentPageWithNext(editor),false);
choose(1);
assert.equal(insertBlankPageBefore(editor),true);
assert.equal(topLevelPageRanges(state.doc).length,5);
choose(1);
assert.equal(removeEmptyCurrentPage(editor),true);
assert.equal(topLevelPageRanges(state.doc).length,4);
console.log("Safe page duplication, merge and before/after insertion passed");

const beforeText=state.doc.textContent;
choose(0);assert.equal(insertBlankPageAfter(editor),true);
choose(1);assert.equal(insertBlankPageAfter(editor),true);
assert.equal(topLevelPageRanges(state.doc).length,6);
assert.equal(removeAllEmptyPages(editor),2);
assert.equal(topLevelPageRanges(state.doc).length,4);
assert.equal(state.doc.textContent,beforeText);
assert.equal(removeAllEmptyPages(editor),0);

const blankPara=schema.nodes.paragraph.create();
const white=(value:string)=>schema.nodes.paragraph.create(null,schema.text(value));
const nestedProtected=schema.nodes.waveFold.create(null,[white("   ")]);
const docBlank=schema.nodes.doc.create(null,[p("live"),page("blank"),white("   "),white("\t"),blankPara,
 page("protected"),nestedProtected,page("filled"),white("  important ")]);
let st=EditorState.create({schema,doc:docBlank});
const control={isEditable:true,isDestroyed:false,get state(){return st;},view:{dispatch(tr:any){st=st.apply(tr);}}} as any;
const candidate=topLevelPageRanges(st.doc)[1];
assert.equal(isEmptyPageBody(st.doc.content.cut(candidate.bodyStart,candidate.end)),true);
assert.equal(removeAllEmptyPages(control),1);
assert.equal(topLevelPageRanges(st.doc).length,3);
assert.equal(st.doc.textContent,"live     important ");
assert.equal(st.doc.content.child(2).type.name,"waveFold");
let pageLast=topLevelPageRanges(st.doc)[2];
st=st.apply(st.tr.setSelection(TextSelection.create(st.doc,pageLast.bodyStart+1)));
assert.equal(removeEmptyCurrentPage(control),false,"Text pages are protected");
const docSingle=schema.nodes.doc.create(null,[p("keep"),page("erase"),white(" "),blankPara]);
let single=EditorState.create({schema,doc:docSingle});
const controlSingle={isEditable:true,isDestroyed:false,get state(){return single;},view:{dispatch(tr:any){single=single.apply(tr);}}} as any;
const emptyPage=topLevelPageRanges(single.doc)[1];
single=single.apply(single.tr.setSelection(TextSelection.create(single.doc,emptyPage.bodyStart+1)));
assert.equal(removeEmptyCurrentPage(controlSingle),true);
assert.equal(single.doc.textContent,"keep");

const strongSchema=new Schema({nodes:{doc:{content:"block+"},paragraph:{group:"block",content:"text*"},
 wavePageBreak:{group:"block",atom:true,attrs:{label:{default:""}}},
 waveFold:{group:"block",content:"block+"},
 text:{group:"inline"}},marks:{strong:{}}});
const marks=strongSchema.marks.strong.create();
const textParagraph=strongSchema.nodes.paragraph.create(null,[
 strongSchema.text("abc"),strongSchema.text("DEF", [marks]),strongSchema.text("ghi")
]);
let splitState=EditorState.create({schema:strongSchema,doc:strongSchema.nodes.doc.create(null,[textParagraph])});
const splitEditor={isEditable:true,isDestroyed:false,get state(){return splitState;},
 view:{dispatch(tr:any){splitState=splitState.apply(tr);}}} as any;
splitState=splitState.apply(splitState.tr.setSelection(TextSelection.create(splitState.doc,4)));
assert.equal(splitPageAtCaret(splitEditor),true);
assert.equal(topLevelPageRanges(splitState.doc).length,2);
assert.equal(splitState.doc.child(0).textContent,"abc");
assert.equal(splitState.doc.child(2).textContent,"DEFghi");
assert.equal(splitState.doc.child(2).firstChild?.marks[0].type.name,"strong");
assert.equal(splitState.selection.$from.parent.textContent,"DEFghi");
assert.equal(splitState.doc.check(),undefined);
assert.equal(splitPageAtCaret(splitEditor),false,"Do not split at the start of a block");
const nestedDoc=strongSchema.nodes.doc.create(null,[
 strongSchema.nodes.waveFold.create(null,[strongSchema.nodes.paragraph.create(null,strongSchema.text("fold text"))])
]);
let nestState=EditorState.create({schema:strongSchema,doc:nestedDoc});
nestState=nestState.apply(nestState.tr.setSelection(TextSelection.create(nestState.doc,3)));
const nestedEditor={isEditable:true,isDestroyed:false,get state(){return nestState;},
 view:{dispatch(tr:any){nestState=nestState.apply(tr);}}} as any;
assert.equal(splitPageAtCaret(nestedEditor),false,"Nested sections must remain intact");
assert.equal(nestState.doc.check(),undefined);
