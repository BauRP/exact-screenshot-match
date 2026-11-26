import {strict as assert} from "node:assert";
import {equalArrayBufferBytesCooperative,equalBlobBytesCooperative} from "../src/lib/backup-byte-work";
import {recoveredVersionId,recoveredVersionIdCooperative} from "../src/lib/backup-restore-plan";
import {localMediaDiffers} from "../src/lib/backup-media-conflicts";

const record={id:"long",title:"Large document",body:"<p>Test</p>",kind:"pdf" as const,
 pdf:{fileName:"notes.pdf",size:0,pageCount:1},createdAt:1,updatedAt:2};
const pdf=new Uint8Array(12*1024*1024);
const image=new Uint8Array(4*1024*1024);
for(let i=0;i<pdf.length;i+=1021)pdf[i]=(i%251)+1;
for(let i=0;i<image.length;i+=1031)image[i]=(i%247)+1;
const media=[{kind:"image" as const,id:"photo",bytes:image}];
assert.equal(await recoveredVersionIdCooperative(record,pdf,media),recoveredVersionId(record,pdf,media),
 "Cooperative hashing must preserve exact existing backup recovery identifiers");
const old={id:"legacy",title:"X",body:"<p>Y</p>",createdAt:1,updatedAt:2};
assert.equal(await recoveredVersionIdCooperative(old),recoveredVersionId(old));
assert.equal(recoveredVersionId(old as any),"restored-d85c9b41-d974542d");
assert.equal(await recoveredVersionIdCooperative(record,pdf,[...media].reverse()),recoveredVersionId(record,pdf,media));
const changed=new Uint8Array(pdf);changed[changed.length-1]^=1;
assert.notEqual(await recoveredVersionIdCooperative(record,changed,media),recoveredVersionId(record,pdf,media));
const modified=new Uint8Array(pdf);modified[modified.length-1]^=1;
assert.equal(await equalArrayBufferBytesCooperative(pdf.buffer,pdf),true);
assert.equal(await equalArrayBufferBytesCooperative(pdf.buffer,modified),false);
assert.equal(await equalArrayBufferBytesCooperative(null,pdf),false);
// Abort if an early chunk differs, without scanning the rest.
const early=new Uint8Array(pdf);early[1]^=1;
assert.equal(await equalArrayBufferBytesCooperative(pdf.buffer,early),false);
class SlicedBlob extends Blob{
 override arrayBuffer():Promise<ArrayBuffer>{throw new Error("Never load the entire attachment into memory");}
}
const wrapped=new SlicedBlob([image]);
assert.equal(await equalBlobBytesCooperative(wrapped,image),true,
 "Attachment comparison must use small slices, never the entire media blob");
const modifiedImage=new Uint8Array(image);modifiedImage[modifiedImage.length-1]^=1;
assert.equal(await equalBlobBytesCooperative(wrapped,modifiedImage),false);
assert.equal(await equalBlobBytesCooperative(null,image),false);
const mismatch=await localMediaDiffers(media,async()=>null,async()=>wrapped);
assert.equal(mismatch,false);
assert.equal(await localMediaDiffers(media,async()=>null,async()=>new Blob([modifiedImage])),true);
// Macrotask scheduling: these operations must allow UI/alarms to run mid-scan.
let timerRan=false;
setTimeout(()=>{timerRan=true;},0);
await recoveredVersionIdCooperative(record,pdf,media);
assert.equal(timerRan,true,"Long version hashing must yield to the event loop");
let compareTick=false;
setTimeout(()=>{compareTick=true;},0);
await equalBlobBytesCooperative(wrapped,image);
assert.equal(compareTick,true,"Large attachments must not monopolize WebView JS");
console.log("Large PDF/photo/audio comparison and fingerprint preserve IDs and yield to WebView");
