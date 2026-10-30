/**
 * Single-note exchange (.wnote). Unlike full backups, imports always create
 * an independent copy. Import never writes to existing note IDs or folders.
 * The ZIP includes note HTML, styling and all supported PDF/audio attachments.
 */
import { zip, unzip, strToU8, strFromU8 } from "fflate";
import {audioIdsInHtml,loadAudioFile,saveNewAudioFile,deleteAudioFile} from "./audio-files";
import {loadPdfFile,saveNewPdfFile,deletePdfFile} from "./pdf-files";
import {createNote,type Note} from "./notes-store";
import {imageIdsInHtml,loadImageFile,saveNewImageFile,deleteImageFile} from "./image-files";

const LIMIT=80*1024*1024;
const ID=/^[a-zA-Z0-9_-]{1,128}$/;
type Envelope={format:"wave-notes-single";version:1;createdAt:number;originId:string;note:Note;audioIds:string[];imageIds?:string[];hasPdf:boolean};

async function pack(files:Record<string,Uint8Array>):Promise<Uint8Array>{
 return new Promise((resolve,reject)=>zip(files,{level:0},(err,output)=>err?reject(err):resolve(output)));
}
async function unpack(blob:Blob):Promise<Record<string,Uint8Array>>{
 if(blob.size>LIMIT)throw Error("Файл заметки больше 80 МБ");
 let sum=0;let count=0;let blocked=false;

 const bytes=new Uint8Array(await blob.arrayBuffer());
 return new Promise((resolve,reject)=>{
  unzip(bytes,{filter(entry){
   count+=1;sum+=entry.originalSize;
   if(count>150||entry.originalSize>LIMIT||sum>LIMIT){blocked=true;return false;}
   return true;
  }},(err,files)=>{
   if(blocked)reject(Error("Содержимое архива превышает безопасный размер"));
   else if(err)reject(err);
   else resolve(files);
  });
 });
}
function parseManifest(files:Record<string,Uint8Array>):Envelope{
 const raw=files["manifest.json"];
 if(!raw||raw.length>1024*1024)throw Error("Нет корректного описания заметки");
 let obj:unknown;
 try{obj=JSON.parse(strFromU8(raw));}catch{throw Error("Повреждено описание заметки");}
 if(!obj||typeof obj!=="object")throw Error("Неправильный формат заметки");
 const p=obj as Partial<Envelope>;
 const n=p.note;
 if(p.format!=="wave-notes-single"||p.version!==1||!n||!ID.test(p.originId||"")||!ID.test(n.id)||
    typeof n.title!=="string"||n.title.length>250||typeof n.body!=="string"||n.body.length>2_000_000||
    !Array.isArray(p.audioIds)||p.audioIds.length>50||typeof p.hasPdf!=="boolean"||
    p.audioIds.some(id=>!ID.test(id))||
    (p.imageIds!==undefined&&(!Array.isArray(p.imageIds)||p.imageIds.length>50||p.imageIds.some(id=>typeof id!=="string"||!ID.test(id)))))throw Error("Недопустимые данные заметки");
 const refs=audioIdsInHtml(n.body);
 if(refs.some(id=>!p.audioIds!.includes(id)))throw Error("Вложение заметки отсутствует в описании");
 for(const id of p.audioIds){
  if(!files["audio/"+id+".blob"]?.byteLength)throw Error("Отсутствует аудиозапись");
 }
 const imageIds=p.imageIds||[];
 const imageRefs=imageIdsInHtml(n.body);
 if(imageRefs.some(id=>!imageIds.includes(id)))throw Error("Вложение фотографии отсутствует в описании");
 for(const id of imageIds){
  if(!files["images/"+id+".blob"]?.byteLength)throw Error("Отсутствует фотография");
 }
 if(p.hasPdf){
  if(n.kind!=="pdf"||!files["document.pdf"]?.byteLength)throw Error("Отсутствует оригинал PDF");
 }
 if(n.kind==="pdf"&&!p.hasPdf)throw Error("Не указан PDF");
 return p as Envelope;
}
export async function inspectWaveFile(file:File):Promise<{title:string;originId:string;kind:"note"|"pdf";containsPdf:boolean;audioCount:number}>{
 const envelope=parseManifest(await unpack(file));
 return {title:envelope.note.title,originId:envelope.originId,kind:envelope.note.kind==="pdf"?"pdf":"note",containsPdf:envelope.hasPdf,audioCount:envelope.audioIds.length};
}
export async function makeWaveNote(note:Note):Promise<Blob>{
 const audioIds=audioIdsInHtml(note.body);
 const imageIds=imageIdsInHtml(note.body);
 const files:Record<string,Uint8Array>={};
 for(const id of audioIds){
  const blob=await loadAudioFile(id);
  if(!blob)throw Error("Не найдена прикреплённая аудиозапись");
  files["audio/"+id+".blob"]=new Uint8Array(await blob.arrayBuffer());
 }
 for(const id of imageIds){
  const blob=await loadImageFile(id);
  if(!blob)throw Error("Не найдена прикреплённая фотография");
  files["images/"+id+".blob"]=new Uint8Array(await blob.arrayBuffer());
 }
 if(note.kind==="pdf"){
  const data=await loadPdfFile(note.id);
  if(!data)throw Error("Исходный PDF не найден");
  files["document.pdf"]=new Uint8Array(data);
 }
 const originId=note.originId&&ID.test(note.originId)?note.originId:note.id;
 files["manifest.json"]=strToU8(JSON.stringify({
  format:"wave-notes-single",version:1,createdAt:Date.now(),originId,note,audioIds,imageIds,hasPdf:note.kind==="pdf"
 } satisfies Envelope));
 const binary=await pack(files);
 if(binary.byteLength>LIMIT)throw Error("Размер заметки превышает 80 МБ");
 return new Blob([binary.slice().buffer],{type:"application/octet-stream"});
}
export async function shareWaveNote(note:Note):Promise<void>{
 const blob=await makeWaveNote(note);
 const name="WaveNotes-"+Date.now()+".wnote";
 const {Capacitor}=await import("@capacitor/core");
 if(Capacitor.isNativePlatform()&&Capacitor.getPlatform()==="android"){
  const [{Filesystem,Directory},{Share}]=await Promise.all([import("@capacitor/filesystem"),import("@capacitor/share")]);
  const encoded=await new Promise<string>((resolve,reject)=>{
   const reader=new FileReader();reader.onerror=()=>reject(reader.error||Error("Ошибка чтения файла"));
   reader.onload=()=>{const data=String(reader.result||"");resolve(data.slice(data.indexOf(",")+1));};
   reader.readAsDataURL(blob);
  });
  const output=await Filesystem.writeFile({directory:Directory.Cache,path:name,data:encoded});
  await Share.share({title:"Заметка Wave Notes",url:output.uri});
  return;
 }
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export async function receiveWaveNote(file:File,folderId:string):Promise<Note>{
 const files=await unpack(file),p=parseManifest(files);
 const generatedAudio:string[]=[];const generatedImages:string[]=[];let generatedPdf:string|null=null;
 try{
  let body=p.note.body;
  for(const id of p.audioIds){
   const fresh=crypto.randomUUID();
   await saveNewAudioFile(fresh,new Blob([files["audio/"+id+".blob"].slice().buffer]));
   generatedAudio.push(fresh);
   body=body.split("audiodb:"+id).join("audiodb:"+fresh);
  }
  for(const imageId of p.imageIds||[]){
   const fresh=crypto.randomUUID();
   const data=files["images/"+imageId+".blob"];
   const type=data[0]===0x89&&data[1]===0x50?"image/png":data[0]===0xff&&data[1]===0xd8?"image/jpeg":"image/webp";
   await saveNewImageFile(fresh,new Blob([data.slice().buffer],{type}));
   generatedImages.push(fresh);
   body=body.split('data-image-id="'+imageId+'"').join('data-image-id="'+fresh+'"');
   body=body.split("data-image-id='"+imageId+"'").join("data-image-id='"+fresh+"'");
  }
  const id=crypto.randomUUID();
  if(p.hasPdf){
   generatedPdf=id;
   await saveNewPdfFile(id,files["document.pdf"].slice().buffer);
  }
  // Never overwrite local records. Returned edits carry the original originId
  // for a future diff/merge flow, even when they arrive via Telegram/WhatsApp.
  return createNote({...p.note,id,originId:p.originId,body,folderId,
    title:p.note.title+" — получено",createdAt:Date.now(),updatedAt:Date.now(),
    pinned:false,manualOrder:undefined});
 }catch(error){
  await Promise.allSettled(generatedAudio.map(id=>deleteAudioFile(id)));
  await Promise.allSettled(generatedImages.map(id=>deleteImageFile(id)));
  if(generatedPdf)await deletePdfFile(generatedPdf).catch(console.error);
  throw error;
 }
}
