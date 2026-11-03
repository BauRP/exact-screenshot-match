import {Extension} from "@tiptap/core";
/** Persist paragraph direction as real HTML attributes for offline documents. */
export const WaveTextDirection=Extension.create({
 name:"waveTextDirection",
 addGlobalAttributes(){
  return [{types:["paragraph","heading","waveChecklistItem"],attributes:{
   textDirection:{
    default:"ltr",
    parseHTML:element=>element.getAttribute("dir")==="rtl"?"rtl":"ltr",
    renderHTML:attrs=>attrs.textDirection==="rtl"?{dir:"rtl"}:{dir:"ltr"},
   },
  }}];
 },
});

// Browser-independent first-strong *letter* heuristic for pasted text.
// Numbers and punctuation are neutral, even Arabic-Indic digits. Otherwise
// “١٢٣ Hello” would incorrectly turn an English paragraph RTL.
const STRONG_LETTER=/\p{L}/u;
const RTL_LETTER=/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
export function directionForText(text:string):"ltr"|"rtl"{
 for(const character of text){
  if(!STRONG_LETTER.test(character))continue;
  return RTL_LETTER.test(character)?"rtl":"ltr";
 }
 return "ltr";
}
