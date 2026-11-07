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
// Include supplementary-plane RTL letters: Adlam, Hanifi Rohingya, Yezidi,
 // Old South Arabian and Arabic mathematical alphabetics. Do not classify
 // numerals or combining marks as a paragraph's first strong letter.
const RTL_LETTER=/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10A00}-\u{10A7F}\u{10A80}-\u{10A9F}\u{10AC0}-\u{10AFF}\u{10B00}-\u{10B7F}\u{10D00}-\u{10D3F}\u{10E80}-\u{10EBF}\u{1E900}-\u{1E95F}\u{1EE00}-\u{1EEFF}]/u;
export function directionForText(text:string):"ltr"|"rtl"{
 for(const character of text){
  if(!STRONG_LETTER.test(character))continue;
  return RTL_LETTER.test(character)?"rtl":"ltr";
 }
 return "ltr";
}

  // Whole note and selected RTL actions share a single ProseMirror transaction
  // instead of rebuilding HTML or losing text marks.
/** A single undoable operation can change the selected paragraphs, headings
 * and task rows, even inside nested sections. Never edit the text itself or
 * discard bold/italic marks, attachment IDs, and saved page dividers. */
import type {Editor} from "@tiptap/react";
export type WaveDirectionMode="ltr"|"rtl"|"auto";
export type WaveDirectionScope="selection"|"document";
export function setWaveTextDirection(editor:Editor,mode:WaveDirectionMode,scope:WaveDirectionScope="selection"):number{
 if(!editor.isEditable||editor.isDestroyed)return 0;
 const {doc,selection}=editor.state;
 const from=selection.from,to=selection.to;
 const changes:{pos:number;attrs:Record<string,unknown>}[]=[];
 doc.descendants((node,pos)=>{
  if(!node.isTextblock||!("textDirection" in node.attrs))return;
  const end=pos+node.nodeSize;
  const selected=from===to?pos<from&&from<end:pos<to&&end>from;
  if(scope==="selection"&&!selected)return;
  const next=mode==="auto"?directionForText(node.textContent):mode;
  if(node.attrs.textDirection!==next)
   changes.push({pos,attrs:{...node.attrs,textDirection:next}});
 });
 if(!changes.length)return 0;
 let transaction=editor.state.tr;
 for(const change of changes)transaction=transaction.setNodeMarkup(change.pos,undefined,change.attrs);
 editor.view.dispatch(transaction.scrollIntoView());
 return changes.length;
}
