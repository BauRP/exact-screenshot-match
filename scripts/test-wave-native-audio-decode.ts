import {strict as assert} from "node:assert";
import {decodeNativeAudio} from "../src/lib/native-audio-decode";
const small=await decodeNativeAudio("AQIDBA==");
assert.equal(small.type,"audio/mp4");
assert.deepEqual([...new Uint8Array(await small.arrayBuffer())],[1,2,3,4]);
for(const invalid of [undefined,"","x","AA==AAAA","AQ=D","AA==="]){
 await assert.rejects(decodeNativeAudio(invalid),/Некорректное аудио/);
}
await assert.rejects(decodeNativeAudio("A".repeat(16_777_220)),/Некорректное аудио|велика/,
 "Reject oversized bridge payload before allocating or decoding");
const raw=Uint8Array.from({length:300_000},(_,i)=>i%251);
const encoded=Buffer.from(raw).toString("base64");
const decoded=await decodeNativeAudio(encoded);
assert.equal(decoded.size,raw.byteLength);
assert.deepEqual(new Uint8Array(await decoded.arrayBuffer()),raw,
 "Chunked base64 decoding must preserve every byte across boundaries");
console.log("Android audio bridge decoding: malformed, oversized and chunked payloads passed");
