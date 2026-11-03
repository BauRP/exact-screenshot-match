import {strict as assert} from "node:assert";
import {strToU8} from "fflate";
import {verifyBackupArchiveStructure} from "../src/lib/backup-archive-guard";
import {audioIdsInHtml} from "../src/lib/audio-files";
import {imageIdsInHtml} from "../src/lib/image-files";
const notes=[{id:"note1",title:"Saved",body:'<p data-image-id="img1">photo</p><div data-audio="audiodb:rec1"></div>',kind:"note"}];
const manifest={notes,pdfIds:[],audioIds:["rec1"],imageIds:["img1"],folders:[],hiddenSystem:[]};
const entries={"manifest.json":strToU8(JSON.stringify(manifest)),
 "audio/rec1.blob":new Uint8Array([1,2,3]),
 "images/img1.blob":new Uint8Array([137,80,78,71,13,10,26,10])};
const check=(m:typeof manifest=manifest,e:typeof entries=entries)=>verifyBackupArchiveStructure(e,m,audioIdsInHtml,imageIdsInHtml);
check();
assert.throws(()=>check(manifest,{...entries,"../../private.txt":new Uint8Array([1])}),/посторонние/);
assert.throws(()=>check(manifest,{...entries,"audio/rec1.blob":undefined as any}),/отсутствующие/);
assert.throws(()=>check({...manifest,audioIds:["rec1","rec1"]}),/список аудио/);
assert.throws(()=>check({...manifest,imageIds:[]}),/посторонние|отсутствующие|не соответствует/);
assert.throws(()=>check({...manifest,notes:[...notes,{...notes[0]}]}),/повторная/);
assert.throws(()=>check({...manifest,notes:[{...notes[0],id:"../escape"}]}),/повреждённая/);
assert.throws(()=>check({...manifest,notes:[{...notes[0],body:"x".repeat(2_000_001)}]}),/повреждённая/);
assert.throws(()=>check({...manifest,notes:[{...notes[0],body:"not referring to attachments"}]}),/не соответствует/);
assert.throws(()=>check(manifest,{...entries,"manifest.json":new Uint8Array(24*1024*1024+1)}),/описание/);
console.log("Backup guard rejects ZIP path injection, duplicate IDs, missing and unreferenced binary data, oversized metadata");
