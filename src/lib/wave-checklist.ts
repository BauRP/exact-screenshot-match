import { Node, mergeAttributes } from "@tiptap/core";
export type CheckShape="square"|"circle"|"diamond"|"check";
const valid=(shape:string):shape is CheckShape=>["square","circle","diamond","check"].includes(shape);
/** The checkbox is real saved document data. The DOM marker is only its UI.
 * No external network, no separate HTML listener on the document.
 */
export const WaveChecklistItem=Node.create({
 name:"waveChecklistItem",
 priority:1100,
 addKeyboardShortcuts(){
  return {"Mod-Enter":()=>{
    const {$from}=this.editor.state.selection;
    if($from.parent.type.name!=="waveChecklistItem")return false;
    const pos=$from.before();
    const node=$from.parent;
    this.editor.view.dispatch(this.editor.state.tr.setNodeMarkup(pos,undefined,{...node.attrs,done:!node.attrs.done}));
    return true;
   },Enter:()=>{
    const {$from}=this.editor.state.selection;
    if($from.parent.type.name!=="waveChecklistItem")return false;
    if(!$from.parent.textContent.trim()){
      return this.editor.commands.setNode("paragraph");
    }
    const at=$from.after();
    return this.editor.chain().focus()
      .insertContentAt(at,{type:"waveChecklistItem",attrs:{shape:$from.parent.attrs.shape,done:false},
        content:[{type:"text",text:" "}]})
      .setTextSelection(at+1).run();
  }};
 },
 group:"block",
 content:"inline*",
 defining:true,
 draggable:true,
 addAttributes(){return {
  done:{default:false,parseHTML:el=>el.getAttribute("data-done")==="true",renderHTML:attrs=>({"data-done":attrs.done?"true":"false"})},
  shape:{default:"square",parseHTML:el=>valid(el.getAttribute("data-shape")||"")?el.getAttribute("data-shape"):"square",renderHTML:attrs=>({"data-shape":valid(attrs.shape)?attrs.shape:"square"})},
 };},
 parseHTML(){return [{tag:'div[data-type="wave-check-item"]'}];},
 renderHTML({HTMLAttributes}){return ["div",mergeAttributes(HTMLAttributes,{"data-type":"wave-check-item"}),0];},
 addNodeView(){
  return ({node,editor,getPos})=>{
   let current=node;
   const root=document.createElement("div");root.className="wave-check-row";
   const button=document.createElement("button");button.type="button";
   button.className="wave-check-mark";button.contentEditable="false";
   button.setAttribute("aria-label","Отметить задачу выполненной");
   const content=document.createElement("div");content.className="wave-check-content";
   root.append(button,content);
   const paint=()=>{
    root.dataset.done=current.attrs.done?"true":"false";
    root.dataset.shape=valid(current.attrs.shape)?current.attrs.shape:"square";
    button.setAttribute("aria-pressed",current.attrs.done?"true":"false");
    button.textContent=current.attrs.done?"✓":({square:"□",circle:"○",diamond:"◇",check:"✓"}[root.dataset.shape||"square"]||"□");
   };
   paint();
   button.addEventListener("pointerdown",e=>e.preventDefault());
   button.addEventListener("click",e=>{
     e.preventDefault();e.stopPropagation();
     const pos=typeof getPos==="function"?getPos():undefined;
     if(typeof pos!=="number")return;
     editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,done:!current.attrs.done}));
   });
   return {
    dom:root,contentDOM:content,
    update(next){if(next.type!==current.type)return false;current=next;paint();return true;},
    stopEvent(event){return button.contains(event.target as globalThis.Node);},
   };
  };
 },
});
