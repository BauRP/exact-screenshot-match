import {strict as assert} from "node:assert";
import {Schema} from "@tiptap/pm/model";
import {EditorState} from "@tiptap/pm/state";
import {AutoLinkExtras} from "../src/lib/editor-extensions";

const schema=new Schema({
 nodes:{doc:{content:"block+"},paragraph:{group:"block",content:"text*"},text:{}},
 marks:{link:{attrs:{href:{}},inclusive:false},waveTape:{}}
});
const paragraph=(s:string)=>schema.nodes.paragraph.create(null,schema.text(s));
const create=(lines:string[])=>EditorState.create({
 schema,doc:schema.nodes.doc.create(null,lines.map(paragraph)),
 plugins:(AutoLinkExtras.config.addProseMirrorPlugins as (this:any)=>any[]).call({})
});
const hrefs=(state:EditorState,index:number)=>state.doc.child(index).content.content.flatMap(
 node=>node.marks.filter(mark=>mark.type.name==="link").map(mark=>String(mark.attrs.href)));

// Existing unrelated paragraphs stay untouched, including a deliberately
// unlinked old email, after editing only the last line of a long offline note.
const lines=Array.from({length:1500},(_,i)=>"Offline paragraph "+i);
lines[0]="old-sentinel@example.org";
let state=create(lines);
state=state.apply(state.tr.insertText(" newuser@example.org",state.doc.content.size-1));
assert.deepEqual(hrefs(state,0),[],"Typing near the end must not relink the first paragraph");
assert.ok(hrefs(state,1499).includes("mailto:newuser@example.org"));
assert.equal(state.doc.childCount,1500);
assert.equal(state.doc.child(700).textContent,lines[700]);

let phone=create(["Call +1 415 555 1234"]);
phone=phone.apply(phone.tr.insertText("!",phone.doc.content.size-1));
assert.ok(hrefs(phone,0).some(x=>x.startsWith("tel:")),"Phone number still links");

let top=create(["admin@example.org","unrelated@site.org","final note"]);
top=top.apply(top.tr.insertText("!",top.doc.firstChild!.nodeSize-1));
assert.ok(hrefs(top,0).includes("mailto:admin@example.org"));
assert.deepEqual(hrefs(top,1),[],"Nearby unrelated paragraph must not acquire a link");

let replaced=create(["placeholder"]);
replaced=replaced.apply(replaced.tr.replaceWith(0,replaced.doc.content.size,[
 paragraph("one@example.org"),paragraph("two@example.org")
]));
assert.ok(hrefs(replaced,0).includes("mailto:one@example.org"));
assert.ok(hrefs(replaced,1).includes("mailto:two@example.org"));

top=top.apply(top.tr.removeMark(1,top.doc.child(0).nodeSize-1,schema.marks.link));
assert.deepEqual(hrefs(top,0),[],"Manual unlink must not be undone by the plugin");

let hidden=create(["masked@site.org"]);
hidden=hidden.apply(hidden.tr.addMark(1,hidden.doc.firstChild!.nodeSize-1,
 schema.marks.waveTape.create()));
hidden=hidden.apply(hidden.tr.insertText("!",hidden.doc.firstChild!.nodeSize-1));
assert.deepEqual(hrefs(hidden,0),[],"Concealed Tape answers must not gain links");
assert.equal(hidden.doc.firstChild!.textContent,"masked@site.org!");

/** An email containing only digits must stay ONE mailto link, never split
 * into a tel segment and a separate domain link. */
const numericEmail="1234567890@example.org";
let numeric=create(["Contact "+numericEmail+" or +1 415 555 1234"]);
numeric=numeric.apply(numeric.tr.insertText("!",numeric.doc.content.size-1));
const numericLinks=numeric.doc.firstChild!.content.content
 .filter(n=>n.marks.some(m=>m.type.name==="link"))
 .map(n=>({text:n.textContent,href:String(n.marks.find(m=>m.type.name==="link")!.attrs.href)}));
assert.ok(numericLinks.some(x=>x.text===numericEmail&&x.href==="mailto:"+numericEmail),
 "Numeric email must remain one uninterrupted mailto link");
assert.ok(numericLinks.some(x=>x.href==="tel:+14155551234"),
 "Standalone phone next to numeric email still works");
assert.ok(!numericLinks.some(x=>x.href.startsWith("tel:")&&x.text.includes("@")),
 "Phone matcher must never overlap an email");

let falsePhones=create(["Only 1        2 and item1234567890suffix and 12 34"]);
falsePhones=falsePhones.apply(falsePhones.tr.insertText(".",falsePhones.doc.content.size-1));
assert.deepEqual(hrefs(falsePhones,0),[],
 "Spaced two-digit patterns and digits inside identifiers are not phone numbers");

let phoneOnly=create(["Call 8 (800) 555-35-35"]);
phoneOnly=phoneOnly.apply(phoneOnly.tr.insertText("!",phoneOnly.doc.content.size-1));
assert.ok(hrefs(phoneOnly,0).includes("tel:8(800)5553535")||
 hrefs(phoneOnly,0).includes("tel:88005553535"),
 "Legitimate formatted phone still gets a callable link");

console.log("Incremental auto-links preserve numeric emails and reject false phones in large notes");

const tooLongEmail="a".repeat(255)+"@example.org";
let long=create([tooLongEmail]);
long=long.apply(long.tr.insertText("!",long.doc.content.size-1));
assert.deepEqual(hrefs(long,0),[],"Invalid long emails may not become outbound links");
let tooLongPhone=create(["Call "+"1234567890123456789012345"]);
tooLongPhone=tooLongPhone.apply(tooLongPhone.tr.insertText(".",tooLongPhone.doc.content.size-1));
assert.deepEqual(hrefs(tooLongPhone,0),[],"Invalid long phone numbers may not become outbound links");
