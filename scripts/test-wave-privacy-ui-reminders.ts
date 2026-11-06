import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState,TextSelection} from "@tiptap/pm/state";
import {findWords} from "../src/lib/in-note-search";
import {replaceAllInNote} from "../src/lib/wave-find-replace";
import {noteCaretColor} from "../src/lib/note-caret-color";
import {paperAppearance} from "../src/lib/note-paper";
import {reminderPresetTime,snoozeReminderTime} from "../src/lib/note-reminders";
import {setSelectedChecklistShape} from "../src/lib/wave-checklist-actions";
const schema=new Schema({nodes:{
 doc:{content:"block+"},
 paragraph:{content:"inline*",group:"block"},
 waveChecklistItem:{content:"inline*",group:"block",attrs:{done:{default:false},shape:{default:"square"}}},
 text:{group:"inline"}
},marks:{waveTape:{}}});
const hidden=schema.text("secret",[schema.marks.waveTape.create()]);
const paragraph=schema.nodes.paragraph.create(null,[schema.text("hello "),hidden,schema.text(" hello")]);
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[paragraph])});
const editor={isEditable:true,isDestroyed:false,get state(){return state;},view:{dispatch(tr:any){state=state.apply(tr);}}} as any;
assert.equal(findWords(state.doc,"secret").length,0);
assert.equal(findWords(state.doc,"hello").length,2);
assert.equal(findWords(state.doc,"hello secret").length,0);
assert.equal(replaceAllInNote(editor,"secret","leak"),0);
assert.equal(replaceAllInNote(editor,"hello","bonjour"),2);
assert.equal(state.doc.textContent,"bonjour secret bonjour");
assert.equal(findWords(state.doc,"secret").length,0);
assert.equal(noteCaretColor("#FDE68A"),"#000000");
assert.equal(noteCaretColor("#000000"),"#FFFFFF");
assert.equal(noteCaretColor("rgb(255, 255, 255)"),"#000000");
assert.equal(paperAppearance("solid","dots").backgroundSize,"20px 20px");
assert.equal(paperAppearance("mist","grid").backgroundSize,"24px 24px,24px 24px,auto");
const spring=new Date("2026-03-08T01:30:00-05:00").getTime();
assert.equal(snoozeReminderTime("hour",spring)-spring,3600000);
assert.equal(snoozeReminderTime("quarter",spring)-spring,900000);
assert.equal(reminderPresetTime("hour",spring)-spring,3600000);
const check=schema.nodes.waveChecklistItem.create({done:true,shape:"square"},[schema.text("task")]);
state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[check])});
state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,2)));
assert.equal(setSelectedChecklistShape(editor,"circle"),true);
assert.equal(state.doc.firstChild?.attrs.shape,"circle");
assert.equal(state.doc.firstChild?.attrs.done,true);
assert.equal(state.doc.firstChild?.textContent,"task");
console.log("Wave search privacy, checklist shape, paper, caret and reminder tests passed");
