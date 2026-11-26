import {parseInk,serializeInk} from "./wave-ink";

/** Copy vector strokes only, kept in this JavaScript session, never shared
 * with Android clipboard, storage or another application. */
let savedInk:string|null=null;
export function copyWaveInk(encoded:unknown):number{
 const strokes=parseInk(encoded);
 if(!strokes.length)return 0;
 savedInk=serializeInk(strokes);
 return strokes.length;
}
/** Append strokes without touching existing strokes or binary photo data.
 * parseInk/serializeInk enforce the original limits of 120 strokes / 120 KB. */
export function pasteWaveInk(encoded:unknown):string|null{
 if(!savedInk)return null;
 const copy=parseInk(savedInk);
 if(!copy.length)return null;
 const existing=parseInk(encoded);
 if(existing.length+copy.length>120)return null;
 try{return serializeInk([...existing,...copy]);}
 catch{return null;}
}
