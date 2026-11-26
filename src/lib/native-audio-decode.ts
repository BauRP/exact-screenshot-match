/** Decode native AAC without monopolising the Android WebView JS thread.
 * The bridge already carries base64, so reject oversized buffers BEFORE atob
 * and yield between 48-KiB chunks rather than freezing the editor. */
const MAX_AUDIO_BYTES=12*1024*1024;
const BASE64_CHARS=/^[A-Za-z0-9+/]*={0,2}$/;
export async function decodeNativeAudio(data:unknown):Promise<Blob>{
 if(typeof data!=="string"||!data.length||data.length%4!==0||
    data.length>Math.ceil(MAX_AUDIO_BYTES/3)*4||!BASE64_CHARS.test(data))
  throw new Error("Некорректное аудио");
 const padding=data.endsWith("==")?2:data.endsWith("=")?1:0;
 const byteLength=data.length/4*3-padding;
 if(byteLength<1||byteLength>MAX_AUDIO_BYTES)
  throw new Error("Аудиозапись пуста или слишком велика");
 const bytes=new Uint8Array(byteLength);
 const CHUNK=65_536; // multiple of 4, so base64 groups never split
 try{
  for(let offset=0;offset<data.length;offset+=CHUNK){
   const decoded=atob(data.slice(offset,offset+CHUNK));
   const base=offset/4*3;
   for(let i=0;i<decoded.length;i++)bytes[base+i]=decoded.charCodeAt(i);
   if(offset+CHUNK<data.length)
    await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
 }catch{
  throw new Error("Некорректное аудио");
 }
 return new Blob([bytes],{type:"audio/mp4"});
}
