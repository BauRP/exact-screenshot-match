/** Compare actual archived binary attachments, not only the note HTML.
 * A note can keep identical text and attachment IDs while the bytes on disk
 * were damaged or changed. Restoring must then preserve BOTH versions. */
import {audioIdsInHtml} from "./audio-files";
import {imageIdsInHtml} from "./image-files";
import {equalBlobBytesCooperative} from "./backup-byte-work";
export type ArchivedNoteMedia={kind:"audio"|"image";id:string;bytes:Uint8Array};
export function archivedNoteMedia(
 html:string,files:Record<string,Uint8Array>,
):ArchivedNoteMedia[]{
 const attachments:ArchivedNoteMedia[]=[];
 for(const id of audioIdsInHtml(html)){
  const bytes=files["audio/"+id+".blob"];
  if(!bytes?.byteLength)throw new Error("В резервной копии отсутствует аудиозапись: "+id);
  attachments.push({kind:"audio",id,bytes});
 }
 for(const id of imageIdsInHtml(html)){
  const bytes=files["images/"+id+".blob"];
  if(!bytes?.byteLength)throw new Error("В резервной копии отсутствует фотография: "+id);
  attachments.push({kind:"image",id,bytes});
 }
 // Version IDs must not depend on traversal order or HTML attribute order.
 attachments.sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
 return attachments;
}
export async function localMediaDiffers(
 attachments:readonly ArchivedNoteMedia[],
 loadAudio:(id:string)=>Promise<Blob|null>,
 loadImage:(id:string)=>Promise<Blob|null>,
):Promise<boolean>{
 for(const item of attachments){
  const blob=await (item.kind==="audio"?loadAudio(item.id):loadImage(item.id));
  if(!await equalBlobBytesCooperative(blob,item.bytes))return true;
 }
 return false;
}
