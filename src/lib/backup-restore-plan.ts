import type {Note} from "./notes-store";

/** Only saved content matters. Timestamps, pin and folder selection do not
 * represent a different version of the user's note.
 */
function savedContent(note:Note):unknown {
  return {
    title:note.title,body:note.body,kind:note.kind??"note",
    style:note.style??null,
    // Reminder appointments are saved user data. A backup with another
    // deadline or repeat mode is a different note version, even if its
    // visible text has not changed.
    // Omit absent reminder metadata to retain stable recovery IDs from
    // older Wave Notes builds. Only explicitly saved reminder changes
    // create distinct backup versions.
    ...(note.reminderAt===undefined?{}:{reminderAt:note.reminderAt}),
    ...(note.reminderRepeat===undefined?{}:{reminderRepeat:note.reminderRepeat}),
    pdf:note.kind==="pdf"?(note.pdf??null):null,
  };
}
export function hasDifferentSavedContent(current:Note,backedUp:Note):boolean {
  return JSON.stringify(savedContent(current))!==JSON.stringify(savedContent(backedUp));
}
export function equalDocumentBytes(a:ArrayBuffer|null,b:Uint8Array):boolean {
  if(!a||a.byteLength!==b.byteLength)return false;
  const left=new Uint8Array(a);
  for(let i=0;i<left.length;i++)if(left[i]!==b[i])return false;
  return true;
}

/** Deterministic ID = idempotent recovery without replacing existing data.
 * Both the source ID and the saved content (including PDF binary if present)
 * participate. Two independent 32-bit FNV streams make accidental collisions
 * vastly less likely. Never use this fingerprint for security or encryption.
 */
type VersionMedia={kind:"audio"|"image";id:string;bytes:Uint8Array};
/** Existing FNV state: do not alter the byte order or legacy recovery IDs. */
function versionHasher(backedUp:Note){
 const source=JSON.stringify({id:backedUp.id,content:savedContent(backedUp)});
 let a=0x811c9dc5,b=0x9e3779b9;
 const feed=(v:number)=>{
  a=Math.imul(a^(v&255),0x01000193)>>>0;
  b=Math.imul(b^(v&255),0x01000193)>>>0;
  b=Math.imul(b^((v>>>8)&255),0x01000193)>>>0;
 };
 for(let i=0;i<source.length;i++)feed(source.charCodeAt(i));
 return {feed,finish:()=> "restored-"+a.toString(16).padStart(8,"0")+"-"+b.toString(16).padStart(8,"0")};
}
function sortedVersionMedia(media?:readonly VersionMedia[]):VersionMedia[]{
 return media?.length?[...media].sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id)):[];
}
/** Synchronous reference API retained for existing callers and stable IDs. */
export function recoveredVersionId(
 backedUp:Note,pdfBytes?:Uint8Array,media?:readonly VersionMedia[],
):string{
 const hash=versionHasher(backedUp),feed=hash.feed;
 if(pdfBytes){
  feed(pdfBytes.byteLength);
  for(const byte of pdfBytes)feed(byte);
 }
 for(const item of sortedVersionMedia(media)){
  feed(item.kind==="audio"?1:2);feed(item.id.length);
  for(let i=0;i<item.id.length;i++)feed(item.id.charCodeAt(i));
  feed(item.bytes.byteLength);
  for(const byte of item.bytes)feed(byte);
 }
 return hash.finish();
}
/** Same version IDs as the synchronous API, but long PDF/photo/audio bytes
 * are hashed cooperatively so a large recovery never blocks WebView input. */
export async function recoveredVersionIdCooperative(
 backedUp:Note,pdfBytes?:Uint8Array,media?:readonly VersionMedia[],
):Promise<string>{
 const hash=versionHasher(backedUp),feed=hash.feed;
 const feedBytes=async(bytes:Uint8Array)=>{
  for(let start=0;start<bytes.byteLength;start+=MEDIA_CHUNK_BYTES){
   const end=Math.min(start+MEDIA_CHUNK_BYTES,bytes.byteLength);
   for(let i=start;i<end;i++)feed(bytes[i]);
   if(end<bytes.byteLength)await yieldToWebView();
  }
 };
 if(pdfBytes){feed(pdfBytes.byteLength);await feedBytes(pdfBytes);}
 for(const item of sortedVersionMedia(media)){
  feed(item.kind==="audio"?1:2);feed(item.id.length);
  for(let i=0;i<item.id.length;i++)feed(item.id.charCodeAt(i));
  feed(item.bytes.byteLength);
  await feedBytes(item.bytes);
  // Many small attachments still need to allow time for the interface.
  await yieldToWebView();
 }
 return hash.finish();
}

export function restoredNoteTitle(title:string):string {
  const suffix=" (восстановленная)";
  return title.endsWith(suffix)?title:title+suffix;
}
