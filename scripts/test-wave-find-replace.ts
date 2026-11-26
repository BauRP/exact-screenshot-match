import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState} from "@tiptap/pm/state";
import {replaceOneInNote,replaceAllInNote} from "../src/lib/wave-find-replace";
const schema=new Schema({nodes:{doc:{content:"block+"},paragraph:{group:"block",content:"text*"},text:{group:"inline"}},marks:{}});
const paragraph=(text:string)=>schema.nodes.paragraph.create(null,schema.text(text));
let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[paragraph("cat dog cat"),paragraph("cat again")])});
const editor={isEditable:true,isDestroyed:false,get state(){return state;},view:{dispatch(tr:any){state=state.apply(tr);}}} as any;
assert.equal(replaceAllInNote(editor,"cat","bird"),3);
assert.equal(state.doc.textContent,"bird dog birdbird again");
assert.equal(replaceOneInNote(editor,"bird","fox",1),true);
assert.equal(state.doc.textContent,"bird dog foxbird again");
assert.equal(replaceAllInNote(editor,"not found","x"),0);
console.log("Single and reverse-order bulk text replacements passed");

// Turkish dotted capital I expands to two code units when lowercased.
// Find/replace must use ORIGINAL ProseMirror offsets, not folded offsets.
const richSchema=new Schema({nodes:{
 doc:{content:"block+"},paragraph:{group:"block",content:"text*"},
 text:{group:"inline"}
},marks:{waveTape:{},strong:{}}});
const rich=(text:string,mark?:string)=>richSchema.text(text,mark?[richSchema.marks[mark].create()]:[]);
let richState=EditorState.create({schema:richSchema,doc:richSchema.nodes.doc.create(null,[
 richSchema.nodes.paragraph.create(null,[rich("İ"),rich(" SECRET ","waveTape"),rich("İ text ","strong"),rich("end")]),
 richSchema.nodes.paragraph.create(null,rich("İ more"))
])});
let writes=0;
const richEditor={isEditable:true,isDestroyed:false,get state(){return richState;},
 view:{dispatch(tr:any){writes++;richState=richState.apply(tr);}}} as any;
assert.equal(replaceAllInNote(richEditor,"i","X"),3,
 "Case-insensitive search must match dotted capitals without touching hidden Tape");
assert.equal(writes,1,"Bulk replacement is one undoable transaction");
assert.equal(richState.doc.child(0).textContent,"X SECRET X text end");
assert.equal(richState.doc.child(1).textContent,"X more");
assert.equal(richState.doc.child(0).child(1).marks[0].type.name,"waveTape",
 "Concealed words and marks must not be modified");
assert.equal(richState.doc.check(),undefined);
const original=JSON.stringify(richState.doc.toJSON());
assert.equal(replaceAllInNote(richEditor,"SECRET","oops"),0);
assert.equal(JSON.stringify(richState.doc.toJSON()),original);
assert.equal(writes,1);
