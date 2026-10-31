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
   const root=document.createElement("section");
   root.className="wave-fold";
   const heading=document.createElement("div");
   heading.className="wave-fold-heading";
   heading.contentEditable="false";
   const toggle=document.createElement("button");
   toggle.type="button";
   toggle.className="wave-fold-toggle";
   toggle.setAttribute("aria-label","Свернуть или развернуть раздел");
   const title=document.createElement("span");
   title.className="wave-fold-title";
   const rename=document.createElement("button");
   rename.type="button";
   rename.className="wave-fold-rename";
   rename.setAttribute("aria-label","Переименовать раздел");
   rename.textContent="✎";
   const child=document.createElement("button");
   child.type="button";
   child.className="wave-fold-nest";
   child.setAttribute("aria-label","Добавить вложенный раздел");
   child.textContent="+";
   const input=document.createElement("input");
   input.type="text";
   input.className="wave-fold-title-input";
   input.maxLength=100;
   input.setAttribute("aria-label","Название раздела");
   input.hidden=true;
   const body=document.createElement("div");
   body.className="wave-fold-body";
   heading.append(toggle,title,rename,child,input);
   root.append(heading,body);
   const position=()=>typeof getPos==="function"?getPos():undefined;
   const updateAttrs=(patch:Record<string,unknown>)=>{
    const pos=position();
    if(typeof pos!=="number"||!editor.isEditable)return;
    editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,...patch}));
   };
   const paint=()=>{
     const collapsed=!!current.attrs.collapsed;
     const name=String(current.attrs.title||"Раздел").slice(0,100);
     toggle.textContent=collapsed?"▸":"▾";
     toggle.setAttribute("aria-expanded",collapsed?"false":"true");
     title.textContent=name;
     if(input.hidden)input.value=name;
     root.dataset.collapsed=String(collapsed);
     root.dataset.title=name;
     body.hidden=collapsed;
     rename.hidden=!editor.isEditable;
     child.hidden=!editor.isEditable;
   };
   const finishRename=(accept:boolean)=>{
     if(input.hidden)return;
     const value=input.value.trim().slice(0,100);
     input.hidden=true;
     title.hidden=false;
     if(accept&&value&&value!==current.attrs.title)updateAttrs({title:value});
     paint();
   };
   heading.addEventListener("pointerdown",e=>{
     if(!(e.target instanceof HTMLInputElement))e.preventDefault();
   });
   toggle.addEventListener("click",e=>{
     e.preventDefault();e.stopPropagation();
     updateAttrs({collapsed:!current.attrs.collapsed});
   });
   rename.addEventListener("click",e=>{
     e.preventDefault();e.stopPropagation();
     if(!editor.isEditable)return;
     title.hidden=true;
     input.hidden=false;
     input.value=String(current.attrs.title||"Раздел");
     input.focus();input.select();
   });
   input.addEventListener("keydown",e=>{
     e.stopPropagation();
     if(e.key==="Enter"){e.preventDefault();finishRename(true);}
     if(e.key==="Escape"){e.preventDefault();finishRename(false);}
   });
   input.addEventListener("blur",()=>finishRename(true));
   child.addEventListener("click",e=>{
     e.preventDefault();e.stopPropagation();
     const pos=position();
     if(typeof pos!=="number"||!editor.isEditable)return;
     const insertAt=pos+current.nodeSize-1;
     const section={type:"waveFold",attrs:{title:"Вложенный раздел",collapsed:false},
       content:[{type:"paragraph"}]};
     editor.chain().insertContentAt(insertAt,section).run();
     if(current.attrs.collapsed)updateAttrs({collapsed:false});
   });
   paint();
   return {
    dom:root,contentDOM:body,
    update(next){if(next.type!==current.type)return false;current=next;paint();return true;},
    stopEvent(event){return heading.contains(event.target as globalThis.Node);},
   };
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
