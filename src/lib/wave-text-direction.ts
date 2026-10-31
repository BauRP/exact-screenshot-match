import {Extension} from "@tiptap/core";
/** Persist paragraph direction as real HTML attributes for offline documents. */
export const WaveTextDirection=Extension.create({
 name:"waveTextDirection",
 addGlobalAttributes(){
  return [{types:["paragraph","heading"],attributes:{
   textDirection:{
    default:"ltr",
    parseHTML:element=>element.getAttribute("dir")==="rtl"?"rtl":"ltr",
    renderHTML:attrs=>attrs.textDirection==="rtl"?{dir:"rtl"}:{dir:"ltr"},
   },
  }}];
 },
});
