import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {WaveTextDirection,directionForText,setWaveTextDirection,visibleTextForDirection} from "../src/lib/wave-text-direction";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
assert.equal(directionForText("  مرحبا بالعالم"),"rtl");
assert.equal(directionForText("שלום עולם"),"rtl");
assert.equal(directionForText("Қазақ тілі"),"ltr");
assert.equal(directionForText("English ثم العربية"),"ltr");
assert.equal(directionForText("123 שלום hello"),"rtl");
assert.equal(directionForText("123"),"ltr");
assert.equal(directionForText("١٢٣ English مرحبا"),"ltr","Arabic-Indic numerals are neutral");
assert.equal(directionForText("۱۲۳ Қазақша سلام"),"ltr","Persian numerals are neutral");
assert.equal(directionForText("١٢٣ مرحبا Hello"),"rtl");
assert.equal(directionForText("🇰🇿 123 שלום"),"rtl","Emoji and digits are neutral");
assert.equal(directionForText("    日本語 ثم العربية"),"ltr","First CJK letter is LTR");
assert.equal(directionForText("... ٩٨٧ سلام"),"rtl");
assert.equal(directionForText("123 "+String.fromCodePoint(0x1E922)+" hello"),"rtl","Adlam supplementary-plane letters are RTL");
assert.equal(directionForText("... "+String.fromCodePoint(0x10D01)+" English"),"rtl","Hanifi Rohingya letters are RTL");
assert.equal(directionForText("123 "+String.fromCodePoint(0x10E81)), "rtl","Yezidi is RTL");
assert.equal(directionForText("English "+String.fromCodePoint(0x1E922)),"ltr","First-strong LTR still wins");
assert.equal(directionForText("١٢٣ "+String.fromCodePoint(0x1E922)),"rtl","Digits remain neutral before Adlam");
// Supplementary-plane historical right-to-left alphabets: each sample is an
// actual RTL Unicode LETTER (not an adjacent digit or combining mark).
for(const cp of [0x10C80,0x10F00,0x10F30,0x10F70,0x10FE0]){
 assert.equal(directionForText("123 "+String.fromCodePoint(cp)+" English"),"rtl",`RTL script U+${cp.toString(16)}`);
 assert.equal(directionForText("English "+String.fromCodePoint(cp)),"ltr","First LTR letter must still win");
}


// HTML attribute values are case-insensitive by the HTML standard. Imported
// rich text (especially from external apps) may have DIR="RTL" or whitespace.
const dirAttribute=(WaveTextDirection.config.addGlobalAttributes as (this:any)=>any[]).call({})[0].attributes.textDirection;
const htmlDir=(value:string|null)=>dirAttribute.parseHTML({
 getAttribute:(name:string)=>name==="dir"?value:null
});
assert.equal(htmlDir("RTL"),"rtl");
assert.equal(htmlDir(" Rtl "),"rtl");
assert.equal(htmlDir("rtl"),"rtl");
assert.equal(htmlDir("ltr"),"ltr");
assert.equal(htmlDir(null),"ltr");
assert.deepEqual(dirAttribute.renderHTML({textDirection:"rtl"}),{dir:"rtl"});
assert.deepEqual(dirAttribute.renderHTML({textDirection:"ltr"}),{dir:"ltr"});

// A big note with a nested section and a saved page boundary. Changing RTL
// for one caret should update only its one paragraph; even a far-away RTL
// paragraph must keep its manually selected direction.
const bigSchema=new Schema({nodes:{
 doc:{content:"block+"},paragraph:{group:"block",content:"text*",attrs:{textDirection:{default:"ltr"}}},
 waveFold:{group:"block",content:"block+"},wavePageBreak:{group:"block",atom:true},
 text:{group:"inline"}
},marks:{waveTape:{},strong:{}}});
const plain=(s:string,dir:"ltr"|"rtl"="ltr")=>
 bigSchema.nodes.paragraph.create({textDirection:dir},bigSchema.text(s));
const longBlocks=Array.from({length:1800},(_,index)=>plain("Paragraph "+index));
longBlocks[0]=plain("שלום keep-manual", "ltr");
longBlocks[1200]=bigSchema.nodes.waveFold.create(null,[
 plain("مرحبا النص"),plain("English neighbor"),plain("مرحبا another")
]);
longBlocks[1201]=bigSchema.nodes.wavePageBreak.create();
longBlocks[1799]=plain("مرحبا saved-manual","ltr");
let bigState=EditorState.create({schema:bigSchema,doc:bigSchema.nodes.doc.create(null,longBlocks)});
let bigChanges=0;
const bigEditor={isEditable:true,isDestroyed:false,get state(){return bigState;},
 view:{dispatch(tr:any){bigChanges++;bigState=bigState.apply(tr);}}} as any;
let nestedPos=-1;
bigState.doc.descendants((node,pos)=>{if(node.type.name==="paragraph"&&node.textContent==="مرحبا النص")nestedPos=pos+2;});
assert.ok(nestedPos>0);
const originalBig=bigState.doc.textContent;
const originalBreak=bigState.doc.child(1201).toJSON();
bigState=bigState.apply(bigState.tr.setSelection(TextSelection.create(bigState.doc,nestedPos)));
assert.equal(setWaveTextDirection(bigEditor,"auto"),1);
assert.equal(bigChanges,1);
assert.equal(bigState.doc.child(1200).child(0).attrs.textDirection,"rtl");
assert.equal(bigState.doc.child(1200).child(1).attrs.textDirection,"ltr");
assert.equal(bigState.doc.child(1200).child(2).attrs.textDirection,"ltr");
assert.equal(bigState.doc.child(0).attrs.textDirection,"ltr");
assert.equal(bigState.doc.child(1799).attrs.textDirection,"ltr");
assert.deepEqual(bigState.doc.child(1201).toJSON(),originalBreak);
assert.equal(bigState.doc.textContent,originalBig);
assert.equal(setWaveTextDirection(bigEditor,"auto"),0,"No-op creates no extra Undo entry");
assert.equal(bigChanges,1);
const sectionPos=bigState.doc.child(0).nodeSize+
 longBlocks.slice(1,1200).reduce((total,node)=>total+node.nodeSize,0);
const nestedFirst=sectionPos+2;
const nestedThird=sectionPos+bigState.doc.child(1200).child(0).nodeSize+
 bigState.doc.child(1200).child(1).nodeSize+2;
bigState=bigState.apply(bigState.tr.setSelection(TextSelection.create(bigState.doc,nestedFirst,nestedThird)));
assert.equal(setWaveTextDirection(bigEditor,"auto"),1,"Range affects the second RTL paragraph too");
assert.equal(bigState.doc.child(1200).child(2).attrs.textDirection,"rtl");
assert.equal(bigState.doc.child(1200).child(1).attrs.textDirection,"ltr");
assert.equal(bigState.doc.child(1799).attrs.textDirection,"ltr");
assert.equal(bigChanges,2);
assert.equal(bigState.doc.check(),undefined);

const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
assert.ok(editor.includes('setWaveTextDirection(editor,"auto")'));
assert.ok(editor.includes('setWaveTextDirection(editor,"auto","document")'));
assert.ok(editor.includes('onMouseDown={event=>event.preventDefault()}'));
assert.ok(editor.includes('aria-label="Автоматическое направление текста"'));
console.log("Offline first-strong multilingual text direction and editor command passed");

// A real ProseMirror state (not string matching) verifies that applying RTL to
// several blocks preserves characters, inline marks and unrelated page data.
const schema=new Schema({nodes:{
 doc:{content:"block+"},
 paragraph:{group:"block",content:"inline*",attrs:{textDirection:{default:"ltr"}}},
 heading:{group:"block",content:"inline*",attrs:{textDirection:{default:"ltr"},level:{default:2}}},
 waveChecklistItem:{group:"block",content:"inline*",attrs:{textDirection:{default:"ltr"},done:{default:false}}},
 text:{group:"inline"}
},marks:{strong:{},waveTape:{}}});
const mark=schema.marks.strong.create();
const make=(type:"paragraph"|"heading"|"waveChecklistItem",content:string)=>
 schema.nodes[type].create(null,schema.text(content,[mark]));
const document=schema.nodes.doc.create(null,[make("paragraph","مرحبا"),make("heading","English שלום"),make("waveChecklistItem","١٢٣ שלום")]);
let state=EditorState.create({schema,doc:document});
let dispatched=0;
const mock={isEditable:true,isDestroyed:false,get state(){return state;},
 view:{dispatch(tr:any){dispatched++;state=state.apply(tr);}}} as any;
const originalText=state.doc.textContent;
const initialPos=2;
const secondPos=state.doc.child(0).nodeSize+2;
state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,initialPos,secondPos)));
assert.equal(setWaveTextDirection(mock,"auto"),1,"Selection checks both blocks but only updates the one with an incorrect direction");
assert.equal(dispatched,1);
assert.equal(state.doc.child(0).attrs.textDirection,"rtl");
assert.equal(state.doc.child(1).attrs.textDirection,"ltr");
assert.equal(state.doc.child(2).attrs.textDirection,"ltr");
state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,state.doc.child(0).nodeSize+state.doc.child(1).nodeSize+2)));
assert.equal(setWaveTextDirection(mock,"auto"),1,"Single caret applies to its containing checklist");
assert.equal(state.doc.child(2).attrs.textDirection,"rtl");
assert.equal(setWaveTextDirection(mock,"auto"),0,"Already correct text must not create a new undo item");
assert.equal(setWaveTextDirection(mock,"ltr","document"),2,"Whole note transforms as one edit");
assert.equal(state.doc.textContent,originalText,"Text stays unchanged");
assert.equal(state.doc.child(0).firstChild?.marks[0].type.name,"strong","Marks are preserved");
assert.equal(dispatched,3,"Only three actual changes were dispatched");
// A concealed Tape answer should NOT determine the visible paragraph direction.
const tape=schema.marks.waveTape.create();
const hiddenHebrew=schema.nodes.paragraph.create({textDirection:"rtl"},[
 schema.text("שלום",[tape]),schema.text(" Visible English",[mark])]);
const hiddenEnglish=schema.nodes.paragraph.create(null,[
 schema.text("English",[tape]),schema.text(" مرحبا",[mark])]);
const hiddenOnly=schema.nodes.paragraph.create({textDirection:"ltr"},schema.text("שלום",[tape]));
let privacyState=EditorState.create({schema,doc:schema.nodes.doc.create(null,[hiddenHebrew,hiddenEnglish,hiddenOnly])});
let privacyEdits=0;
const privacyEditor={isEditable:true,isDestroyed:false,get state(){return privacyState;},
 view:{dispatch(tr:any){privacyEdits++;privacyState=privacyState.apply(tr);}}} as any;
assert.equal(visibleTextForDirection(hiddenHebrew)," Visible English");
assert.equal(visibleTextForDirection(hiddenEnglish)," مرحبا");
assert.equal(visibleTextForDirection(hiddenOnly),"");
const originalHiddenText=privacyState.doc.textContent;
assert.equal(setWaveTextDirection(privacyEditor,"auto","document"),2,
 "Only the visible letters may choose the automatic direction");
assert.equal(privacyEdits,1,"One change to the document remains one undoable transaction");
assert.equal(privacyState.doc.child(0).attrs.textDirection,"ltr");
assert.equal(privacyState.doc.child(1).attrs.textDirection,"rtl");
assert.equal(privacyState.doc.child(2).attrs.textDirection,"ltr");
assert.equal(privacyState.doc.textContent,originalHiddenText,"Text is never deleted");
assert.equal(privacyState.doc.child(0).firstChild?.marks[0].type.name,"waveTape",
 "The secret answer remains concealed after changing direction");
assert.equal(privacyState.doc.child(1).firstChild?.marks[0].type.name,"waveTape");
assert.equal(setWaveTextDirection(privacyEditor,"auto","document"),0,"No-op cannot create another undo item");
// A fully concealed or blank RTL paragraph keeps its manual direction.
// No strong visible letter exists to justify switching to LTR.
const invisibleRtl=schema.nodes.paragraph.create({textDirection:"rtl"},schema.text("مرحبا",[tape]));
const emptyRtl=schema.nodes.paragraph.create({textDirection:"rtl"});
let noVisibleState=EditorState.create({schema,doc:schema.nodes.doc.create(null,[invisibleRtl,emptyRtl])});
let noVisibleEdits=0;
const noVisibleEditor={isEditable:true,isDestroyed:false,get state(){return noVisibleState;},
 view:{dispatch(tr:any){noVisibleEdits++;noVisibleState=noVisibleState.apply(tr);}}} as any;
assert.equal(setWaveTextDirection(noVisibleEditor,"auto","document"),0);
assert.equal(noVisibleEdits,0,"Empty / fully hidden blocks do not add undo items");
assert.equal(noVisibleState.doc.child(0).attrs.textDirection,"rtl");
assert.equal(noVisibleState.doc.child(1).attrs.textDirection,"rtl");
assert.equal(noVisibleState.doc.child(0).firstChild?.marks[0].type.name,"waveTape");
assert.equal(setWaveTextDirection(noVisibleEditor,"ltr","document"),2,
 "Explicit manual direction still works on hidden and empty paragraphs");
assert.equal(noVisibleEdits,1);
assert.equal(noVisibleState.doc.child(0).attrs.textDirection,"ltr");

const sectionSchema=new Schema({nodes:{
 doc:{content:"block+"},paragraph:{group:"block",content:"inline*",attrs:{textDirection:{default:"ltr"}}},
 waveFold:{group:"block",content:"block+"},text:{group:"inline"}
},marks:{strong:{},waveTape:{}}});
const sectionParagraph=(text:string)=>sectionSchema.nodes.paragraph.create(null,sectionSchema.text(text));
let sectionState=EditorState.create({schema:sectionSchema,doc:sectionSchema.nodes.doc.create(null,[
 sectionParagraph("English outside"),
 sectionSchema.nodes.waveFold.create(null,[sectionParagraph("مرحبا"),sectionParagraph("שלום")]),
 sectionParagraph("שלום outside")
])});
let sectionEdits=0;
const sectionEditor={isEditable:true,isDestroyed:false,get state(){return sectionState;},
 view:{dispatch(tr:any){sectionEdits++;sectionState=sectionState.apply(tr);}}} as any;
const sectionStart=sectionState.doc.child(0).nodeSize;
sectionState=sectionState.apply(sectionState.tr.setSelection(TextSelection.create(sectionState.doc,sectionStart+2)));
assert.equal(setWaveTextDirection(sectionEditor,"auto","section"),2);
assert.equal(sectionEdits,1);
assert.equal(sectionState.doc.child(1).child(0).attrs.textDirection,"rtl");
assert.equal(sectionState.doc.child(1).child(1).attrs.textDirection,"rtl");
assert.equal(sectionState.doc.child(2).attrs.textDirection,"ltr");
assert.equal(setWaveTextDirection(sectionEditor,"auto","section"),0);
sectionState=sectionState.apply(sectionState.tr.setSelection(TextSelection.create(
 sectionState.doc,sectionStart+2,sectionState.doc.content.size-2)));
assert.equal(setWaveTextDirection(sectionEditor,"auto","section"),0);
assert.equal(sectionEdits,1);
assert.ok(editor.includes('setWaveTextDirection(editor,"auto","section")'));
assert.ok(editor.includes('setWaveTextDirection(editor,"rtl","section")'));
assert.ok(editor.includes('setWaveTextDirection(editor,"ltr","section")'));
assert.ok(editor.includes('aria-label="Справа налево внутри текущего раздела"'));
assert.ok(editor.includes('aria-label="Слева направо внутри текущего раздела"'));
sectionState=sectionState.apply(sectionState.tr.setSelection(TextSelection.create(sectionState.doc,sectionStart+2)));
assert.equal(setWaveTextDirection(sectionEditor,"ltr","section"),2);
assert.equal(sectionState.doc.child(1).child(0).attrs.textDirection,"ltr");
assert.equal(sectionState.doc.child(1).child(1).attrs.textDirection,"ltr");
assert.equal(sectionState.doc.child(2).attrs.textDirection,"ltr");
assert.equal(setWaveTextDirection(sectionEditor,"rtl","section"),2);
assert.equal(sectionState.doc.child(1).child(0).attrs.textDirection,"rtl");
assert.equal(sectionState.doc.child(1).child(1).attrs.textDirection,"rtl");
assert.equal(setWaveTextDirection(sectionEditor,"rtl","section"),0);
assert.equal(sectionEdits,3,"Only actual section changes create Undo transactions");
assert.equal(sectionState.doc.textContent,"English outsideمرحباשלוםשלום outside");

const pageSchema=new Schema({nodes:{
 doc:{content:"block+"},
 paragraph:{group:"block",content:"text*",attrs:{textDirection:{default:"ltr"}}},
 wavePageBreak:{group:"block",atom:true},
 text:{group:"inline"}
},marks:{}});
const pg1=pageSchema.nodes.paragraph.create(null,pageSchema.text("مرحبا в первой"));
const pg2=pageSchema.nodes.paragraph.create(null,pageSchema.text("שלום בשנייה"));
const pg3=pageSchema.nodes.paragraph.create(null,pageSchema.text("English in second"));
let scopeState=EditorState.create({schema:pageSchema,doc:pageSchema.nodes.doc.create(null,[
 pg1,pageSchema.nodes.wavePageBreak.create(),pg2,pg3
])});
let scopeWrites=0;
const pageEditor={isEditable:true,isDestroyed:false,get state(){return scopeState;},
 view:{dispatch(tr:any){scopeWrites++;scopeState=scopeState.apply(tr);}}} as any;
scopeState=scopeState.apply(scopeState.tr.setSelection(TextSelection.create(scopeState.doc,pg1.nodeSize+3)));
assert.equal(setWaveTextDirection(pageEditor,"auto","page"),1);
assert.equal(scopeState.doc.child(0).attrs.textDirection,"ltr","First page stays unchanged");
assert.equal(scopeState.doc.child(2).attrs.textDirection,"rtl","Second page uses Hebrew direction");
assert.equal(scopeState.doc.child(3).attrs.textDirection,"ltr");
assert.equal(scopeState.doc.textContent,"مرحبا в первойשלום בשנייהEnglish in second");
assert.equal(scopeWrites,1);
assert.equal(setWaveTextDirection(pageEditor,"auto","page"),0);
assert.equal(scopeWrites,1);
assert.ok(editor.includes('setWaveTextDirection(editor,"auto","page")'),
 "RTL current page must be accessible in the existing editor");

assert.equal(setWaveTextDirection(pageEditor,"rtl","page"),1,
 "Only the English paragraph changes; Hebrew is already RTL");
assert.equal(scopeWrites,2);
assert.equal(scopeState.doc.child(0).attrs.textDirection,"ltr");
assert.equal(scopeState.doc.child(2).attrs.textDirection,"rtl");
assert.equal(scopeState.doc.child(3).attrs.textDirection,"rtl");
assert.equal(setWaveTextDirection(pageEditor,"ltr","page"),2);
assert.equal(scopeWrites,3);
assert.equal(scopeState.doc.child(2).attrs.textDirection,"ltr");
assert.equal(scopeState.doc.child(3).attrs.textDirection,"ltr");
assert.equal(scopeState.doc.textContent,"مرحبا в первойשלום בשנייהEnglish in second");
assert.ok(editor.includes('setWaveTextDirection(editor,"rtl","page")'));
assert.ok(editor.includes('setWaveTextDirection(editor,"ltr","page")'));
