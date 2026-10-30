import { Node, Mark, mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

export type CalloutKind = "important" | "tip" | "warning" | "info";
const KINDS:CalloutKind[]=["important","tip","warning","info"];
export const isCalloutKind=(value:unknown):value is CalloutKind=>typeof value==="string"&&KINDS.includes(value as CalloutKind);

export const WaveCallout=Node.create({
 name:"waveCallout", group:"block", content:"block+", defining:true,
 addAttributes(){return {
  kind:{default:"important",parseHTML:el=>isCalloutKind(el.getAttribute("data-kind"))?el.getAttribute("data-kind"):"important",
   renderHTML:attrs=>({"data-kind":isCalloutKind(attrs.kind)?attrs.kind:"important"})},
 };},
 parseHTML(){return [{tag:'aside[data-wave-callout]'}];},
 renderHTML({HTMLAttributes}){return ["aside",mergeAttributes(HTMLAttributes,{"data-wave-callout":"true","class":"wave-callout"}),0];},
});

/** A genuine document section, not text hidden by deleting its content.
 * The folded flag and heading survive save/reopen/backups.
 */
export const WaveFold=Node.create({
 name:"waveFold", group:"block", content:"block+", defining:true, isolating:true,
 addAttributes(){return {
  title:{default:"Раздел",parseHTML:el=>el.getAttribute("data-title")||"Раздел",
   renderHTML:attrs=>({"data-title":String(attrs.title||"Раздел")})},
  collapsed:{default:false,parseHTML:el=>el.getAttribute("data-collapsed")==="true",
   renderHTML:attrs=>({"data-collapsed":attrs.collapsed?"true":"false"})},
 };},
 parseHTML(){return [{tag:'section[data-wave-fold]'}];},
 renderHTML({HTMLAttributes}){
  return ["section",mergeAttributes(HTMLAttributes,{"data-wave-fold":"true","class":"wave-fold"}),
    ["div",{"class":"wave-fold-body"},0]];
 },
 addNodeView(){
  return ({node,editor,getPos})=>{
   let current=node;
   const root=document.createElement("section");root.className="wave-fold";
   const header=document.createElement("button");header.type="button";header.contentEditable="false";
   header.className="wave-fold-heading";
   const body=document.createElement("div");body.className="wave-fold-body";
   root.append(header,body);
   const paint=()=>{
     header.textContent=(current.attrs.collapsed?"▸ ":"▾ ")+String(current.attrs.title||"Раздел");
     header.setAttribute("aria-expanded",current.attrs.collapsed?"false":"true");
     root.setAttribute("data-collapsed",current.attrs.collapsed?"true":"false");
     root.setAttribute("data-title",String(current.attrs.title||"Раздел"));
     body.hidden=!!current.attrs.collapsed;
   };
   header.addEventListener("pointerdown",event=>event.preventDefault());
   header.addEventListener("click",event=>{
     event.preventDefault();event.stopPropagation();
     const pos=typeof getPos==="function"?getPos():undefined;
     if(typeof pos!=="number")return;
     editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,collapsed:!current.attrs.collapsed}));
   });
   paint();
   return {dom:root,contentDOM:body,
    update(next){if(next.type!==current.type)return false;current=next;paint();return true;},
    stopEvent(event){return header.contains(event.target as globalThis.Node);}};
  };
 },
});

/** Tape is a revision-safe mark around real text. Clicking reveals only on
 * screen, without mutating or stripping the underlying note content.
 */
export const WaveTape=Mark.create({
 name:"waveTape", inclusive:false,
 parseHTML(){return [{tag:'span[data-wave-tape]'}];},
 renderHTML({HTMLAttributes}){return ["span",mergeAttributes(HTMLAttributes,{"data-wave-tape":"true","class":"wave-tape"}),0];},
 addProseMirrorPlugins(){
  return [new Plugin({props:{
   handleClick(_view,_pos,event){
    const target=event.target instanceof Element?event.target:null;
    const tape=target?.closest("[data-wave-tape]");
    if(!tape)return false;
    tape.classList.toggle("wave-tape-open");
    return true;
   },
  }})];
 },
});
