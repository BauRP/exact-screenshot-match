import {Node,mergeAttributes} from "@tiptap/core";
import {NodeViewWrapper,ReactNodeViewRenderer,type NodeViewProps} from "@tiptap/react";
import {useState} from "react";
import {WaveInkCanvas} from "@/components/editor/WaveInkCanvas";
import {moveWaveBlock} from "@/lib/wave-block-motion";
import {parseInk} from "@/lib/wave-ink";
declare module "@tiptap/core"{
 interface Commands<ReturnType>{waveDrawing:{insertWaveDrawing:()=>ReturnType}}
}
function DrawingView({node,updateAttributes,deleteNode,editor,getPos}:NodeViewProps){
 const [editing,setEditing]=useState(false);
 const strokes=typeof node.attrs.strokes==="string"?node.attrs.strokes:"[]";
 return <NodeViewWrapper className="wave-drawing my-3" contentEditable={false}>
   <div className="rounded-xl border border-border bg-white p-2">
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-md bg-white">
      <WaveInkCanvas value={strokes} editable={editor.isEditable} active={editing}
       onChange={encoded=>updateAttributes({strokes:encoded})}/>
    </div>
    {editor.isEditable&&<div className="mt-2 flex flex-wrap items-center gap-1">
      <button type="button" onClick={()=>setEditing(v=>!v)}
        aria-label={editing?"Завершить рисование":"Редактировать рисунок"}
        className="rounded-lg bg-secondary px-3 py-2 text-xs">{editing?"Готово":"Рисовать"}</button>
      <button type="button" onClick={()=>moveWaveBlock(editor,getPos,"up")} aria-label="Поднять рисунок"
        className="rounded-lg border px-3 py-2 text-xs">↑</button>
      <button type="button" onClick={()=>moveWaveBlock(editor,getPos,"down")} aria-label="Опустить рисунок"
        className="rounded-lg border px-3 py-2 text-xs">↓</button>
      <button type="button" onClick={deleteNode} className="ml-auto rounded-lg border px-3 py-2 text-xs">Удалить</button>
    </div>}
   </div>
 </NodeViewWrapper>;
}
export const WaveDrawing=Node.create({
 name:"waveDrawing",group:"block",atom:true,selectable:true,draggable:true,
 addAttributes(){return {strokes:{default:"[]",parseHTML:element=>typeof element.getAttribute("data-wave-ink")==="string"&&parseInk(element.getAttribute("data-wave-ink")).length?
   element.getAttribute("data-wave-ink"):"[]",renderHTML:attributes=>({"data-wave-ink":String(attributes.strokes||"[]")})}};},
 parseHTML(){return [{tag:"div[data-wave-drawing]"}];},
 renderHTML({HTMLAttributes}){return ["div",mergeAttributes(HTMLAttributes,{"data-wave-drawing":"true"})];},
 addNodeView(){return ReactNodeViewRenderer(DrawingView);},
 addCommands(){return {insertWaveDrawing:()=>({chain})=>chain().insertContent([{type:this.name,attrs:{strokes:"[]"}},{type:"paragraph"}]).run()};},
});
