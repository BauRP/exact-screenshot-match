import {strict as assert} from "node:assert";
import {archivedNoteMedia,localMediaDiffers} from "../src/lib/backup-media-conflicts";
import {recoveredVersionId} from "../src/lib/backup-restore-plan";

const text='<p>Запись</p><div data-audio-note src="audiodb:voice-one"></div><p data-image-id="photo-one"></p>';
const note={id:"note-1",title:"Без изменений",body:text,createdAt:100,updatedAt:200,kind:"note" as const};
const audio=new Uint8Array([1,2,3,4,5]),image=new Uint8Array([255,216,255,1,2,3,4,255,217]);
const files={"audio/voice-one.blob":audio,"images/photo-one.blob":image};
const attachments=archivedNoteMedia(text,files);
assert.equal(attachments.length,2);
const asBlob=(bytes:Uint8Array)=>new Blob([bytes.slice().buffer]);
const loadAudio=async(id:string)=>id==="voice-one"?asBlob(audio):null;
const loadImage=async(id:string)=>id==="photo-one"?asBlob(image):null;
assert.equal(await localMediaDiffers(attachments,loadAudio,loadImage),false,
 "Exactly equal media must not produce duplicate restored notes");
assert.equal(await localMediaDiffers(attachments,async()=>null,loadImage),true,
 "Missing audio must recover from backup even when HTML matches");
assert.equal(await localMediaDiffers(attachments,loadAudio,async()=>null),true,
 "Missing photo must recover from backup even when HTML matches");
assert.equal(await localMediaDiffers(attachments,async()=>asBlob(new Uint8Array([1,2])),loadImage),true,
 "Audio length change is a real backup conflict");
assert.equal(await localMediaDiffers(attachments,loadAudio,async()=>asBlob(new Uint8Array([255,216,255,1,2,3,5,255,217]))),true,
 "Equal photo length cannot hide a damaged byte");
const id=recoveredVersionId(note,undefined,attachments);
assert.equal(id,recoveredVersionId(note,undefined,[...attachments].reverse()),
 "The recovery ID must not depend on attachment enumeration order");
assert.notEqual(id,recoveredVersionId(note,undefined,attachments.map(item=>item.kind==="audio"?{...item,bytes:new Uint8Array([1,2,3,4,6])}:item)),
 "Two audio recordings with identical markup must get independent recoverable versions");
assert.notEqual(id,recoveredVersionId(note,undefined,attachments.map(item=>item.kind==="image"?{...item,bytes:new Uint8Array([255,216,255,1,2,3,5,255,217])}:item)),
 "Two photo versions with identical markup must not overwrite each other");
assert.notEqual(id,recoveredVersionId(note),
 "Media version identifiers include bytes, legacy no-media IDs remain unchanged");
assert.throws(()=>archivedNoteMedia(text,{"audio/voice-one.blob":audio}),/фотография/,
 "Missing media must stop restoration before any writes");
console.log("Backup media conflicts: unchanged text cannot hide missing or modified audio/photos, IDs stay stable");
