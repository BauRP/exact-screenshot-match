import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection,NodeSelection} from "@tiptap/pm/state";
import {noteCurrentPage} from "../src/lib/note-outline";
import {duplicateCurrentPage,moveCurrentPage,moveCurrentPageToIndex,topLevelPageRanges,insertBlankPageAfter,insertBlankPageBefore,mergeCurrentPageWithNext,removeAllEmptyPages,removeEmptyCurrentPage,isEmptyPageBody,splitPageAtCaret} from "../src/lib/wave-page-actions";
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
// Imported or edited documents can contain two consecutive page dividers.
// A marker-only empty page must be removable without affecting the next page.
let onlyMarker=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 p("first"),page("marker-only"),page("last"),p("keep last")
])});
let markerEdits=0;
const onlyMarkerEditor={isEditable:true,isDestroyed:false,get state(){return onlyMarker;},
 view:{dispatch(tr:any){markerEdits++;onlyMarker=onlyMarker.apply(tr);}}} as any;
const markerAt=topLevelPageRanges(onlyMarker.doc)[1].start;
onlyMarker=onlyMarker.apply(onlyMarker.tr.setSelection(NodeSelection.create(onlyMarker.doc,markerAt)));
assert.equal(noteCurrentPage(onlyMarker.doc,onlyMarker.selection.from),2,
 "Navigation and page removal must agree on a selected divider");
assert.equal(removeEmptyCurrentPage(onlyMarkerEditor),true);
assert.equal(topLevelPageRanges(onlyMarker.doc).length,2);
assert.equal(onlyMarker.doc.textContent,"firstkeep last");
assert.equal(onlyMarker.doc.child(1).attrs.label,"last","The next page label must survive");
assert.equal(onlyMarker.doc.check(),undefined);
assert.equal(markerEdits,1,"Exactly one undoable edit for deleting a marker-only page");

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
// A page split inside a checked task must not create duplicate completed tasks.
const taskSchema=new Schema({nodes:{doc:{content:"block+"},
 paragraph:{group:"block",content:"text*"},wavePageBreak:{group:"block",atom:true},
 waveChecklistItem:{group:"block",content:"text*",attrs:{done:{default:false},shape:{default:"square"},textDirection:{default:"ltr"}}},
 text:{group:"inline"}},marks:{strong:{}}});
const savedTask=taskSchema.nodes.waveChecklistItem.create({done:true,shape:"diamond",textDirection:"rtl"},
 taskSchema.text("שלום",[taskSchema.marks.strong.create()]));
let taskState=EditorState.create({schema:taskSchema,doc:taskSchema.nodes.doc.create(null,[savedTask])});
let taskEdits=0;
const taskEditor={isEditable:true,isDestroyed:false,get state(){return taskState;},
 view:{dispatch(tr:any){taskEdits++;taskState=taskState.apply(tr);}}} as any;
taskState=taskState.apply(taskState.tr.setSelection(TextSelection.create(taskState.doc,3)));
assert.equal(splitPageAtCaret(taskEditor),false);
assert.equal(taskEdits,0);
assert.equal(taskState.doc.childCount,1);
assert.equal(taskState.doc.child(0).attrs.done,true);
assert.equal(taskState.doc.child(0).attrs.textDirection,"rtl");
assert.equal(taskState.doc.child(0).firstChild?.marks[0].type.name,"strong");
assert.equal(taskState.doc.check(),undefined);
// A multi-page selection is not a single active page. Never apply a page
// action merely to the first selected page while the rest is selected too.
let crossState=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 p("first page"),page("second"),p("second page"),page("third"),p("third page")
])});
let crossDispatches=0;
const crossEditor={isEditable:true,isDestroyed:false,get state(){return crossState;},
 view:{dispatch(tr:any){crossDispatches++;crossState=crossState.apply(tr);}}} as any;
const crossPages=topLevelPageRanges(crossState.doc);
crossState=crossState.apply(crossState.tr.setSelection(TextSelection.create(
 crossState.doc,crossPages[1].bodyStart+1,crossPages[2].bodyStart+2
)));
const beforeCross=JSON.stringify(crossState.doc.toJSON());
for(const action of [
 ()=>duplicateCurrentPage(crossEditor),
 ()=>moveCurrentPage(crossEditor,"down"),
 ()=>insertBlankPageAfter(crossEditor),
 ()=>insertBlankPageBefore(crossEditor),
 ()=>mergeCurrentPageWithNext(crossEditor),
 ()=>removeEmptyCurrentPage(crossEditor)
])assert.equal(action(),false,"A cross-page selection cannot edit one guessed page");
assert.equal(crossDispatches,0);
assert.equal(JSON.stringify(crossState.doc.toJSON()),beforeCross);
assert.deepEqual(topLevelPageRanges(crossState.doc).map(x=>x.start),crossPages.map(x=>x.start));
// A text range entirely within page 2 remains eligible for normal actions.
crossState=crossState.apply(crossState.tr.setSelection(TextSelection.create(
 crossState.doc,crossPages[1].bodyStart+1,crossPages[1].end
)));
assert.equal(duplicateCurrentPage(crossEditor),true);
assert.equal(crossDispatches,1);
assert.equal(topLevelPageRanges(crossState.doc).length,4);
assert.equal(crossState.doc.check(),undefined);

// Empty pages must not erase saved formatting, RTL or manually styled spaces.
// The page-delete command may remove only truly default blank paragraphs.
const styledSchema=new Schema({nodes:{
 doc:{content:"block+"},
 paragraph:{group:"block",content:"text*",attrs:{
  textDirection:{default:"ltr"},textAlign:{default:"left"}
 }},
 wavePageBreak:{group:"block",atom:true,attrs:{label:{default:""}}},
 text:{group:"inline"}
},marks:{strong:{}}});
const pStyled=(value:string,dir:"rtl"|"ltr"="ltr",bold=false)=>
 styledSchema.nodes.paragraph.create({textDirection:dir},
 value?styledSchema.text(value,bold?[styledSchema.marks.strong.create()]:[]):undefined);
const divStyled=(name:string)=>styledSchema.nodes.wavePageBreak.create({label:name});
let styledState=EditorState.create({schema:styledSchema,doc:styledSchema.nodes.doc.create(null,[
 pStyled("KEEP"),divStyled("RTL blank"),pStyled("", "rtl"),
 divStyled("Formatted spaces"),pStyled("  ","ltr",true),
 divStyled("Plain empty"),pStyled("  "),
 divStyled("Real text"),pStyled("still here")
])});
let styledWrites=0;
const styledEditor={isEditable:true,isDestroyed:false,get state(){return styledState;},
 view:{dispatch(tr:any){styledWrites++;styledState=styledState.apply(tr);}}} as any;
const beforeStyled=topLevelPageRanges(styledState.doc);
assert.equal(isEmptyPageBody(styledState.doc.content.cut(beforeStyled[1].bodyStart,beforeStyled[1].end)),false);
assert.equal(isEmptyPageBody(styledState.doc.content.cut(beforeStyled[2].bodyStart,beforeStyled[2].end)),false);
assert.equal(isEmptyPageBody(styledState.doc.content.cut(beforeStyled[3].bodyStart,beforeStyled[3].end)),true);
assert.equal(removeAllEmptyPages(styledEditor),1);
assert.equal(styledWrites,1,"Removing all genuinely empty pages is one Undo transaction");
assert.equal(topLevelPageRanges(styledState.doc).length,4);
assert.equal(styledState.doc.child(2).attrs.textDirection,"rtl");
assert.equal(styledState.doc.child(4).firstChild?.marks[0].type.name,"strong");
assert.ok(styledState.doc.textContent.includes("still here"));
assert.equal(styledState.doc.check(),undefined);

// Moving a page should move the user's cursor and selection with that page,
// not leave the cursor on whatever page inherits the original screen position.
let following=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 p("intro"),page("A"),p("alpha"),page("B"),p("beta"),page("C"),p("gamma")
])});
let moves=0;
const followingEditor={isEditable:true,isDestroyed:false,get state(){return following;},
 view:{dispatch(tr:any){moves++;following=following.apply(tr);}}} as any;
const pageB=topLevelPageRanges(following.doc)[2];
following=following.apply(following.tr.setSelection(TextSelection.create(following.doc,pageB.bodyStart+2)));
assert.equal(following.selection.$from.parent.textContent,"beta");
assert.equal(moveCurrentPage(followingEditor,"up"),true);
assert.equal(following.selection.$from.parent.textContent,"beta","Caret must follow page B upwards");
assert.equal(noteCurrentPage(following.doc,following.selection.from),2);
assert.equal(moveCurrentPage(followingEditor,"down"),true);
assert.equal(following.selection.$from.parent.textContent,"beta","Caret must follow page B downwards");
assert.equal(noteCurrentPage(following.doc,following.selection.from),3);
assert.equal(moves,2);
assert.equal(following.doc.textContent,"introalphabetagamma");
assert.equal(following.doc.check(),undefined);
const selectedPageB=topLevelPageRanges(following.doc)[2].start;
following=following.apply(following.tr.setSelection(NodeSelection.create(following.doc,selectedPageB)));
assert.equal(moveCurrentPage(followingEditor,"up"),true);
assert.ok(following.selection instanceof NodeSelection,"Selected page divider remains selected");
assert.equal((following.selection as NodeSelection).node.attrs.label,"B");
assert.equal(noteCurrentPage(following.doc,following.selection.from),2);
assert.equal(following.doc.check(),undefined);

// Duplicating an explicit page relocates the caret into the copy. Repeating
// duplicates the copy, not an unrelated original page.
let duplicateState=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 p("intro"),page("marked"),p("original"),page("tail"),p("tail body")
])});
const dupEditor={isEditable:true,isDestroyed:false,get state(){return duplicateState;},
 view:{dispatch(tr:any){duplicateState=duplicateState.apply(tr);}}} as any;
let dupRanges=topLevelPageRanges(duplicateState.doc);
duplicateState=duplicateState.apply(duplicateState.tr.setSelection(TextSelection.create(
 duplicateState.doc,dupRanges[1].bodyStart+3
)));
assert.equal(duplicateCurrentPage(dupEditor),true);
assert.equal(duplicateState.selection.$from.parent.textContent,"original");
assert.equal(noteCurrentPage(duplicateState.doc,duplicateState.selection.from),3);
assert.equal(duplicateCurrentPage(dupEditor),true);
assert.equal(noteCurrentPage(duplicateState.doc,duplicateState.selection.from),4);
assert.equal(topLevelPageRanges(duplicateState.doc).length,5);
assert.equal(duplicateState.doc.check(),undefined);
const sourcePages=topLevelPageRanges(duplicateState.doc);
duplicateState=duplicateState.apply(duplicateState.tr.setSelection(NodeSelection.create(duplicateState.doc,sourcePages[1].start)));
assert.equal(duplicateCurrentPage(dupEditor),true);
assert.ok(duplicateState.selection instanceof NodeSelection);
assert.equal((duplicateState.selection as NodeSelection).node.type.name,"wavePageBreak");
assert.ok(String((duplicateState.selection as NodeSelection).node.attrs.label).includes("копия"));

// Move named pages to an arbitrary position while keeping selections inside.
let jumpState=EditorState.create({schema,doc:schema.nodes.doc.create(null,[
 p("intro"),page("A"),p("alpha"),page("B"),p("beta"),page("C"),p("gamma")
])});
let jumpEdits=0;
const jumpEditor={isEditable:true,isDestroyed:false,get state(){return jumpState;},
 view:{dispatch(tr:any){jumpEdits++;jumpState=jumpState.apply(tr);}}} as any;
const jumpB=topLevelPageRanges(jumpState.doc)[2];
jumpState=jumpState.apply(jumpState.tr.setSelection(TextSelection.create(jumpState.doc,jumpB.bodyStart+2)));
assert.equal(moveCurrentPageToIndex(jumpEditor,1),true);
assert.equal(jumpEdits,1);
assert.deepEqual(topLevelPageRanges(jumpState.doc).slice(1).map(p=>jumpState.doc.nodeAt(p.start)?.attrs.label),["B","A","C"]);
assert.equal(jumpState.selection.$from.parent.textContent,"beta");
assert.equal(noteCurrentPage(jumpState.doc,jumpState.selection.from),2);
assert.equal(moveCurrentPageToIndex(jumpEditor,3),true);
assert.deepEqual(topLevelPageRanges(jumpState.doc).slice(1).map(p=>jumpState.doc.nodeAt(p.start)?.attrs.label),["A","C","B"]);
assert.equal(jumpState.selection.$from.parent.textContent,"beta");
assert.equal(noteCurrentPage(jumpState.doc,jumpState.selection.from),4);
for(const invalid of [0,4,3])assert.equal(moveCurrentPageToIndex(jumpEditor,invalid),false);
assert.equal(jumpEdits,2);
assert.equal(jumpState.doc.check(),undefined);
