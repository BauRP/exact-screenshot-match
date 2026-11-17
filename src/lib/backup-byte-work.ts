/** Explicit macrotask breaks keep large offline ZIP/PDF work responsive on
 * older Android WebViews. Never use a microtask-only Promise.resolve() here. */
export const MEDIA_CHUNK_BYTES=256*1024;
export function yieldToWebView():Promise<void>{
 return new Promise(resolve=>setTimeout(resolve,0));
}
export async function equalArrayBufferBytesCooperative(
 data:ArrayBuffer|null, expected:Uint8Array,
):Promise<boolean>{
 if(!data||data.byteLength!==expected.byteLength)return false;
 const actual=new Uint8Array(data);
 for(let start=0;start<actual.length;start+=MEDIA_CHUNK_BYTES){
  const end=Math.min(start+MEDIA_CHUNK_BYTES,actual.length);
  for(let i=start;i<end;i++)if(actual[i]!==expected[i])return false;
  if(end<actual.length)await yieldToWebView();
 }
 return true;
}
/** Compare Blob data in slices to avoid allocating an extra full-size copy
 * of an audio recording or photograph while a ZIP is already in memory. */
export async function equalBlobBytesCooperative(
 blob:Blob|null,expected:Uint8Array,
):Promise<boolean>{
 if(!blob||blob.size!==expected.byteLength)return false;
 for(let start=0;start<expected.length;start+=MEDIA_CHUNK_BYTES){
  const end=Math.min(start+MEDIA_CHUNK_BYTES,expected.length);
  const actual=new Uint8Array(await blob.slice(start,end).arrayBuffer());
  if(actual.length!==end-start)return false;
  for(let i=0;i<actual.length;i++)if(actual[i]!==expected[start+i])return false;
  if(end<expected.length)await yieldToWebView();
 }
 return true;
}
