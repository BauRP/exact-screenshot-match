import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {directionForText,setWaveTextDirection,visibleTextForDirection} from "../src/lib/wave-text-direction";
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
