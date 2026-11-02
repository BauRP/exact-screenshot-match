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

// Browser-independent first-strong-character heuristic for mixed-language notes.
// Hebrew/Arabic scripts need RTL; Latin/Cyrillic and Kazakh remain LTR.
export function directionForText(text:string):"ltr"|"rtl"{
 for(const letter of text){
  if(/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u.test(letter))return "rtl";
  if(/[A-Za-z\u00C0-\u04FF\u1E00-\u1EFF]/u.test(letter))return "ltr";
 }
 return "ltr";
}
