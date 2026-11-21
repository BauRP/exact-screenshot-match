/** Shared defensive validation for incoming and previous internal ZIP snapshots.
 * Never trust a backup's manifest path list or permit ZIP members that do not
 * belong to this exact version of the Wave Notes backup format. */
export type BackupArchiveShape={
 notes:Array<{id:string;title:string;body:string;kind?:string}>;
 pdfIds:string[];audioIds:string[];imageIds?:string[];
 folders:unknown[];hiddenSystem:unknown[];
};
const ID=/^[a-zA-Z0-9_-]{1,128}$/;
const MAX_MANIFEST=24*1024*1024;
const MAX_NOTE_BODY=2_000_000;
function verifiedIds(list:unknown,kind:string):string[]{
 if(!Array.isArray(list)||list.length>10_000||
    list.some(id=>typeof id!=="string"||!ID.test(id))||
    new Set(list).size!==list.length)throw Error("Повреждён список "+kind+" в резервной копии");
 return list;
}
export function verifyBackupArchiveStructure(
 files:Record<string,Uint8Array>,
 manifest:BackupArchiveShape,
 audioReferences:(html:string)=>string[],
 imageReferences:(html:string)=>string[],
):void{
 if(!files["manifest.json"]?.byteLength||files["manifest.json"].byteLength>MAX_MANIFEST)
  throw Error("Повреждено или слишком велико описание резервной копии");
 if(!Array.isArray(manifest.notes)||manifest.notes.length>10000||
    !Array.isArray(manifest.folders)||manifest.folders.length>1000||
    !Array.isArray(manifest.hiddenSystem))throw Error("Повреждены записи резервной копии");
 const pdf=verifiedIds(manifest.pdfIds,"PDF"),audio=verifiedIds(manifest.audioIds,"аудио");
 const images=verifiedIds(manifest.imageIds??[],"фотографий");
 const expected=new Set(["manifest.json",...pdf.map(id=>"pdf/"+id+".pdf"),
   ...audio.map(id=>"audio/"+id+".blob"),...images.map(id=>"images/"+id+".blob")]);
 const actual=Object.keys(files);
 if(actual.length!==expected.size||actual.some(path=>!expected.has(path)))
  throw Error("В резервной копии есть посторонние или отсутствующие файлы");
 const notes=new Set<string>(),refsAudio=new Set<string>(),refsImages=new Set<string>(),pdfNotes=new Set<string>();
 for(const note of manifest.notes){
  if(!note||typeof note!=="object"||!ID.test(note.id)||
     notes.has(note.id)||typeof note.title!=="string"||note.title.length>250||
     typeof note.body!=="string"||note.body.length>MAX_NOTE_BODY||
     (note.kind!==undefined&&note.kind!=="note"&&note.kind!=="pdf"))
    throw Error("В архиве обнаружена повреждённая или повторная заметка");
  notes.add(note.id);
  if(note.kind==="pdf")pdfNotes.add(note.id);
  for(const id of audioReferences(note.body))refsAudio.add(id);
  for(const id of imageReferences(note.body))refsImages.add(id);
 }
 if(pdf.length!==pdfNotes.size||pdf.some(id=>!pdfNotes.has(id))||
    audio.length!==refsAudio.size||audio.some(id=>!refsAudio.has(id))||
    images.length!==refsImages.size||images.some(id=>!refsImages.has(id)))
  throw Error("Список вложений не соответствует содержимому заметок");
 for(const filename of expected)if(!files[filename]?.byteLength)
  throw Error("В резервной копии отсутствует файл: "+filename);
 // Do not publish malformed PDF data as an apparently successful restore.
 // The PDF header may legally follow a short binary prefix.
 for(const id of pdf){
  const bytes=files["pdf/"+id+".pdf"];
  const limit=Math.min(bytes.length,1024);
  let valid=false;
  for(let i=0;i+4<limit;i++){
   if(bytes[i]===37&&bytes[i+1]===80&&bytes[i+2]===68&&
      bytes[i+3]===70&&bytes[i+4]===45){valid=true;break;}
  }
  if(!valid)throw Error("В резервной копии повреждён PDF: "+id);
 }
}
