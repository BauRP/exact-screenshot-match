import {imageBlobFromBytes} from "./image-files";

/** Validate file signatures, not just user-controlled extensions or MIME. */
export async function verifiedNoteImage(source:Blob):Promise<Blob>{
  if(source.size===0||source.size>12*1024*1024){
    throw new Error("Фотография должна быть не больше 12 МБ");
  }
  const bytes=new Uint8Array(await source.arrayBuffer());
  return imageBlobFromBytes(bytes);
}

/**
 * Uses the installed Capacitor camera plugin on Android. The result is copied
 * into our own IndexedDB so deleting Android's temporary capture cannot
 * remove an existing note attachment. Camera permissions stay under Android.
 */
export async function takeNotePhoto():Promise<Blob>{
  const {Camera,CameraResultType,CameraSource}=await import("@capacitor/camera");
  const photo=await Camera.getPhoto({
    resultType:CameraResultType.Uri,
    source:CameraSource.Camera,
    quality:85,
    allowEditing:false,
    saveToGallery:false,
  });
  if(!photo.webPath)throw new Error("Камера не вернула фотографию");
  const response=await fetch(photo.webPath);
  if(!response.ok)throw new Error("Фотографию не удалось прочитать после съёмки");
  return verifiedNoteImage(await response.blob());
}

/** Only take over clipboard/drop when a real photo is present. */
export function clipboardImage(event:ClipboardEvent):File|undefined {
  const items=event.clipboardData?.items;
  if(!items)return undefined;
  for(const item of Array.from(items)){
    if(item.kind==="file"&&item.type.startsWith("image/")){
      const file=item.getAsFile();
      if(file)return file;
    }
  }
  return undefined;
}
export function droppedImage(event:DragEvent):File|undefined {
  return Array.from(event.dataTransfer?.files||[]).find(file=>file.type.startsWith("image/"));
}
