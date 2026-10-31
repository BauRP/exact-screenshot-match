import {strict as assert} from "node:assert";import {readFileSync} from "node:fs";
const audio=readFileSync("src/components/editor/AudioNode.tsx","utf8");
for(const key of ["audioError","setReloadToken","Аудиофайл не найден","Не удалось воспроизвести аудио","onError={()=>setAudioError"])assert.ok(audio.includes(key),key);
console.log("Audio missing-file, playback error and retry UI wired");