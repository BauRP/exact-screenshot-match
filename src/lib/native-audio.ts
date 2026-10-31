import {Capacitor,registerPlugin} from "@capacitor/core";
const plugin=registerPlugin<{start():Promise<void>;stop():Promise<{data:string;mimeType:string}>}>("NativeAudioRecorder");
export const nativeAudioAvailable=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==="android";
export const startNativeAudio=()=>plugin.start();
export async function stopNativeAudio():Promise<Blob>{
 const r=await plugin.stop();
 if(!r||r.mimeType!=="audio/mp4"||!/^[A-Za-z0-9+/]*={0,2}$/.test(r.data))throw new Error("Некорректное аудио");
 const s=atob(r.data);if(!s.length||s.length>12*1024*1024)throw new Error("Аудиозапись пуста или слишком велика");
 const b=new Uint8Array(s.length);for(let i=0;i<b.length;i++)b[i]=s.charCodeAt(i);
 return new Blob([b],{type:"audio/mp4"});
}