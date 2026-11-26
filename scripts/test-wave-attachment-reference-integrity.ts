import {strict as assert} from "node:assert";
import {noteAttachmentIds,rewriteNoteAttachmentIds} from "../src/lib/note-attachment-refs";
import {audioIdsInHtml} from "../src/lib/audio-files";
import {imageIdsInHtml} from "../src/lib/image-files";

const source='<p title="example data-image-id=\'fake\' >">Write audiodb:a and data-image-id="not-real" in ordinary text.</p>'+
 '<div data-audio-note="true" src="audiodb:a"></div>'+
 '<div data-audio-note="true" src=\'audiodb:a-long\'></div>'+
 '<div data-audio="audiodb:a" title="audiodb:a-long"></div>'+
 '<p DATA-IMAGE-ID="photo" title="data-image-id=\'fake\'"></p>'+
 "<div data-image-id='photo-long' title='audiodb:a > x'></div>"+
 '<p data-image-id=unquoted></p>'+
 '<!-- <div src="audiodb:comment"></div> -->'+
 '<div data-other="audiodb:ignored" data-src="audiodb:old"></div>';
const discovered=noteAttachmentIds(source);
assert.deepEqual(discovered.audio,["a","a-long","old"]);
assert.deepEqual(discovered.image,["photo","photo-long","unquoted"]);
assert.deepEqual(audioIdsInHtml(source),discovered.audio);
assert.deepEqual(imageIdsInHtml(source),discovered.image);
const audio=new Map([["a","fresh-a"],["a-long","fresh-long"],["old","fresh-old"]]);
const image=new Map([["photo","new-photo"],["photo-long","new-long"],["unquoted","new-unquoted"]]);
const replaced=rewriteNoteAttachmentIds(source,audio,image);
assert.deepEqual(noteAttachmentIds(replaced),{
 audio:["fresh-a","fresh-long","fresh-old"],image:["new-photo","new-long","new-unquoted"]
});
assert.ok(replaced.includes('src="audiodb:fresh-a"'));
assert.ok(replaced.includes("src='audiodb:fresh-long'"));
assert.ok(replaced.includes('data-image-id=new-unquoted'));
assert.ok(replaced.includes('title="audiodb:a-long"'),"Unrelated title is not an attachment");
assert.ok(replaced.includes('>Write audiodb:a and data-image-id="not-real" in ordinary text.</p>'));
assert.ok(replaced.includes('<!-- <div src="audiodb:comment"></div> -->'),"HTML comments stay untouched");
assert.ok(replaced.includes('data-other="audiodb:ignored"'));
assert.ok(!replaced.includes('audiodb:fresh-a-long'),"Prefix collisions are impossible");
assert.equal(rewriteNoteAttachmentIds(replaced,audio,image),replaced,
 "Repeated transforms cannot rewrite a generated ID");
assert.equal(rewriteNoteAttachmentIds(source,new Map(),new Map()),source,
 "No reference map means byte-for-byte preserved formatting and Tape");
assert.throws(()=>rewriteNoteAttachmentIds(source,new Map([["a",'<injection>']]),image),/Недопустимый ID/);
const hidden='<span data-wave-tape="true">secret audiodb:a</span><div src="audiodb:a"></div>';
assert.equal(rewriteNoteAttachmentIds(hidden,audio,new Map()),
 '<span data-wave-tape="true">secret audiodb:a</span><div src="audiodb:fresh-a"></div>');
const fullId="x".repeat(128);
assert.deepEqual(noteAttachmentIds('<div src="audiodb:'+fullId+'"></div>').audio,[fullId]);
assert.deepEqual(noteAttachmentIds('<div src="audiodb:'+fullId+'x"></div>').audio,[],
 "Overlong IDs cannot be interpreted as truncated live attachments");
console.log("Exact serialized attachment references: prefixes, mixed quotes, hidden Tape and text isolation passed");
