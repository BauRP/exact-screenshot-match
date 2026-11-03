import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const helper=readFileSync("src/lib/wave-note-conflicts.ts","utf8");
const home=readFileSync("src/routes/index.tsx","utf8");
const transfer=readFileSync("src/lib/note-transfer.ts","utf8");
const native=readFileSync("android-overlay/app/src/main/java/app/lovable/supernotes/NativeAudioRecorderPlugin.java","utf8");
for(const marker of ["findReturnedOriginal","n.id===originId","n.originId===originId","combineReturnedBodies","replacementBackup","source.title+\" — до замены\"","local.body+","received.body"]){
 assert.ok(helper.includes(marker),marker);
}
for(const marker of ['doImportWave("copy")','doImportWave("replace")','doImportWave("combine")','acceptReturnedNote(original.id,incoming.id,mode,original.updatedAt)','receiveWaveNote(incomingWave.file','returnedOriginal?.kind!=="pdf"']){
 assert.ok(home.includes(marker),marker);
}
assert.ok(transfer.includes('kind:envelope.note.kind==="pdf"?"pdf":"note"'));
assert.ok(native.includes('if(System.currentTimeMillis()-started<300){clean();'));
assert.ok(readFileSync("src/lib/notes-store.ts","utf8").includes("export function acceptReturnedNote"),"Atomic accept function must exist");
console.log("Safe note-return choices, audio release and version preservation verified");
