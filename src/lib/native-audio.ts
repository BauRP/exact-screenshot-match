import {Capacitor,registerPlugin} from "@capacitor/core";
import {decodeNativeAudio} from "./native-audio-decode";
const plugin=registerPlugin<{start():Promise<void>;cancel():Promise<void>;stop():Promise<{data:string;mimeType:string}>}>("NativeAudioRecorder");
export const nativeAudioAvailable=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==="android";
export const startNativeAudio=()=>plugin.start();
export const cancelNativeAudio=()=>plugin.cancel();
export async function stopNativeAudio():Promise<Blob>{
 const r=await plugin.stop();
 if(!r||r.mimeType!=="audio/mp4")throw new Error("Некорректное аудио");
 return decodeNativeAudio(r.data);
}