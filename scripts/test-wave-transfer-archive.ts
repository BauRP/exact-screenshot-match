import {strict as assert} from "node:assert";
import {zipSync,strToU8} from "fflate";
import {inspectWaveFile,makeWaveNote,transferAudioMime} from "../src/lib/note-transfer";
import type {Note} from "../src/lib/notes-store";

const base={
 format:"wave-notes-single",version:1,originId:"original",
 note:{id:"original",title:"Заметка",body:"<p>Тест</p>",createdAt:1,updatedAt:1},
 audioIds:[],imageIds:[],hasPdf:false,
};
function make(changes:Record<string,unknown>,extra:Record<string,Uint8Array>={}):File{
 const files={"manifest.json":strToU8(JSON.stringify({...base,...changes})),...extra};
 return new File([zipSync(files)],"test.wnote",{type:"application/octet-stream"});
}
async function rejected(changes:Record<string,unknown>,extra:Record<string,Uint8Array>,name:string){
 await assert.rejects(inspectWaveFile(make(changes,extra)),undefined,name);
}
await rejected({},{"../outside.txt":strToU8("bad")},"unrecognized ZIP entry");
await rejected({audioIds:["a","a"]},{"audio/a.blob":strToU8("audio")},"duplicate audio ID");
await rejected({imageIds:["a","a"]},{"images/a.blob":strToU8("image")},"duplicate image ID");
await rejected({audioIds:["a"]},{"audio/a.blob":strToU8("audio")},"orphaned audio file");
await rejected({imageIds:["a"]},{"images/a.blob":strToU8("image")},"orphaned image file");
await rejected({hasPdf:true},{"document.pdf":strToU8("bad")},"PDF on a text note");
console.log("Rejected malformed, unreferenced and untrusted .wnote archive members");

const pdfNote={...base.note,kind:"pdf",pdf:{fileName:"document.pdf"}};
await rejected({note:pdfNote,hasPdf:true},{"document.pdf":strToU8("not a PDF")},"reject forged PDF payload");
const validPdf=strToU8("%PDF-1.7\\n1 0 obj\\n<<>>\\nendobj\\n%%EOF");
const checked=await inspectWaveFile(make({note:pdfNote,hasPdf:true},{"document.pdf":validPdf}));
assert.equal(checked.containsPdf,true);
assert.equal(checked.kind,"pdf");

await rejected({note:{...base.note,kind:"unexpected"}},{},"unknown note kind");
await rejected({audioTypes:{"other":"audio/mp4"}},{},"MIME for undeclared audio");
await rejected({audioTypes:{"other":"text/html"}},{},"unsafe MIME");
assert.equal(transferAudioMime(new Uint8Array([0,0,0,20,102,116,121,112,0,0,0,0])),"audio/mp4");
assert.equal(transferAudioMime(new Uint8Array([0x1a,0x45,0xdf,0xa3])),"audio/webm");
assert.equal(transferAudioMime(strToU8("random"),"audio/webm;codecs=opus"),"audio/webm;codecs=opus");
assert.equal(transferAudioMime(strToU8("random"),"text/html"),"",
 "Older unknown recordings must keep their original empty Blob type for browser sniffing");
const tooManyAudio=Array.from({length:51},(_,i)=>'<div data-audio="audiodb:a'+i+'"></div>').join("");
await assert.rejects(makeWaveNote({...base.note,body:tooManyAudio} as Note),/предел формата/);
