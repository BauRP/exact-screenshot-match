import type {Note} from "./notes-store";

/** Only saved content matters. Timestamps, pin and folder selection do not
 * represent a different version of the user's note.
 */
function savedContent(note:Note):unknown {
  return {
    title:note.title,body:note.body,kind:note.kind??"note",
    style:note.style??null,
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
export function recoveredVersionId(backedUp:Note,pdfBytes?:Uint8Array):string {
  const source=JSON.stringify({id:backedUp.id,content:savedContent(backedUp)});
  let a=0x811c9dc5,b=0x9e3779b9;
  const feed=(v:number)=>{
    a=Math.imul(a^(v&255),0x01000193)>>>0;
    b=Math.imul(b^(v&255),0x01000193)>>>0;
    b=Math.imul(b^((v>>>8)&255),0x01000193)>>>0;
  };
  for(let i=0;i<source.length;i++)feed(source.charCodeAt(i));
  if(pdfBytes){
    feed(pdfBytes.byteLength);
    for(const value of pdfBytes)feed(value);
  }
  return "restored-"+a.toString(16).padStart(8,"0")+"-"+b.toString(16).padStart(8,"0");
}
export function restoredNoteTitle(title:string):string {
  const suffix=" (восстановленная)";
  return title.endsWith(suffix)?title:title+suffix;
}
