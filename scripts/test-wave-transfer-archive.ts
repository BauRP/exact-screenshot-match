import {strict as assert} from "node:assert";
import {zipSync,strToU8} from "fflate";
import {inspectWaveFile} from "../src/lib/note-transfer";

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
