import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {directionForText,setWaveTextDirection} from "../src/lib/wave-text-direction";
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
},marks:{strong:{}}});
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
