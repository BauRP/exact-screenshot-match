import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const native=readFileSync("android-overlay/app/src/main/java/app/lovable/supernotes/NativeAudioRecorderPlugin.java","utf8");
const bridge=readFileSync("src/lib/native-audio.ts","utf8");
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const str of ["public synchronized void cancel(PluginCall call)","clean();call.resolve();"])assert.ok(native.includes(str));
assert.ok(bridge.includes("cancelNativeAudio=()=>plugin.cancel()"));
assert.ok(editor.includes("if(!imageSessionRef.current){await cancelNativeAudio();return;}"));
assert.ok(editor.includes("if(!imageSessionRef.current){stream.getTracks().forEach(track=>track.stop());return;}"));
assert.ok(editor.includes("if(nativeRecordingRef.current){"));
assert.ok(editor.includes('toast.error("Не удалось выключить микрофон")'));
assert.ok(editor.includes("if(recordingWriteRef.current)await recordingWriteRef.current;"));
console.log("Native audio discard, permission-race cleanup and save sequencing verified");

const abandon=editor.indexOf("if(nativeRecordingRef.current){");
const settle=editor.indexOf("settleRecordingRef.current?.resolve();",abandon);
const cleanup=editor.indexOf("const pending=recordingWriteRef.current;",abandon);
assert.ok(abandon>=0&&settle>abandon&&cleanup>settle,
 "Abandoned microphone promise must settle before orphan cleanup");

assert.ok(editor.includes("if(!imageSessionRef.current||!editor||editor.isDestroyed)"));
assert.ok(editor.includes("if(!imageSessionRef.current||editor.isDestroyed){"));
assert.ok(editor.includes("await deleteAudioFile(audioId);"));
assert.ok(editor.includes("createdAudioIdsRef.current.delete(audioId);"));
assert.ok(editor.includes("if(imageSessionRef.current)alert"));
const playback=readFileSync("src/components/editor/AudioNode.tsx","utf8");
assert.ok(playback.includes("if(!AC)return;"),"Old Android WebViews must still play audio");
assert.ok(playback.includes("if(!analyser)return;"));
assert.ok(playback.includes("Audio visualization is unavailable on this WebView"));

assert.ok(native.includes("startRecordingWithFormat(44100,64000)"));
assert.ok(native.includes("startRecordingWithFormat(16000,32000)"));
assert.ok(native.includes("fallbackFailure.addSuppressed(standardFailure)"));
assert.ok(native.includes('file=File.createTempFile("wave-audio-"'));
assert.ok(native.includes("rec.prepare();"));
assert.ok(native.includes("rec.start();"));
assert.ok(native.includes("}catch(Exception standardFailure){\n   clean();"),
 "The failed recorder and its temporary file must be released before retry");
