import {Node,mergeAttributes} from "@tiptap/core";
import {ReactNodeViewRenderer,NodeViewWrapper,type NodeViewProps} from "@tiptap/react";
import {useEffect,useState} from "react";
import {loadImageFile} from "@/lib/image-files";
import {WaveInkCanvas} from "@/components/editor/WaveInkCanvas";
import {moveWaveBlock} from "@/lib/wave-block-motion";

declare module "@tiptap/core" {
 interface Commands<ReturnType> {
  waveImage:{insertWaveImage:(id:string)=>ReturnType};
 }
}
function ImageView({node,updateAttributes,deleteNode,editor,getPos}:NodeViewProps){
 const [annotating,setAnnotating]=useState(false);
 const id=String(node.attrs.imageId||"");
 const width=Number(node.attrs.width)||320;
 const [src,setSrc]=useState("");
 const [error,setError]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  let disposed=false,url="";
  setError(false);setSrc("");
  void loadImageFile(id).then(blob=>{
   if(disposed)return;
   if(!blob){setError(true);return;}
   url=URL.createObjectURL(blob);setSrc(url);
  }).catch(()=>{if(!disposed)setError(true);});
  return ()=>{disposed=true;if(url)URL.revokeObjectURL(url);};
 },[id,retry]);
 return <NodeViewWrapper data-image-id={id} className="wave-image-block my-3" contentEditable={false}>
   <div className="mx-auto w-full max-w-full" style={{width:width+"px"}}>
    {src?<div className="relative aspect-auto w-full overflow-hidden rounded-xl">
      <img src={src} alt={String(node.attrs.alt||"Фото в заметке")} draggable={false} className="block h-auto w-full" />
      <div className={annotating?"absolute inset-0":"pointer-events-none absolute inset-0"}>
        <WaveInkCanvas value={String(node.attrs.ink||"[]")} editable={editor.isEditable} active={annotating}
          onChange={ink=>updateAttributes({ink})}/>
      </div>
    </div>:
      <div role="status" className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
        {error?<div className="flex flex-col items-center gap-2"><span>Фотография не найдена в памяти телефона</span><button type="button" className="rounded-lg border border-border px-3 py-2" onClick={()=>setRetry(value=>value+1)}>Повторить загрузку</button></div>:"Загрузка фотографии…"}
      </div>}
    {editor.isEditable&&<div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Ширина <input type="range" min={120} max={720} step={20} value={width}
          aria-label="Ширина фотографии" onChange={e=>updateAttributes({width:Number(e.target.value)})}/>
        <span>{width}px</span>
      </label>
      <button type="button" onClick={()=>setAnnotating(v=>!v)} className="rounded-lg border border-border px-3 py-2 text-xs">
        {annotating?"Готово":"Рисовать поверх"}
      </button>
      <button type="button" onClick={()=>moveWaveBlock(editor,getPos,"up")} aria-label="Поднять фото" className="rounded-lg border px-2 py-2 text-xs">↑</button>
      <button type="button" onClick={()=>moveWaveBlock(editor,getPos,"down")} aria-label="Опустить фото" className="rounded-lg border px-2 py-2 text-xs">↓</button>
      <button type="button" className="rounded-lg border border-border px-3 py-2 text-xs" onClick={deleteNode}>Удалить фото</button>
    </div>}
   </div>
  </NodeViewWrapper>;
}
export const WaveImage=Node.create({
 name:"waveImage",group:"block",atom:true,selectable:true,draggable:true,
 addAttributes(){return {
  imageId:{default:"",parseHTML:el=>el.getAttribute("data-image-id")||"",renderHTML:a=>({"data-image-id":a.imageId})},
  width:{default:320,parseHTML:el=>Math.min(720,Math.max(120,Number(el.getAttribute("data-width"))||320)),renderHTML:a=>({"data-width":a.width})},
  ink:{default:"[]",parseHTML:el=>el.getAttribute("data-ink")||"[]",renderHTML:a=>({"data-ink":a.ink})},
  alt:{default:"Фото в заметке",parseHTML:el=>el.getAttribute("data-alt")||"Фото в заметке",renderHTML:a=>({"data-alt":a.alt})},
 };},
 parseHTML(){return [{tag:"div[data-wave-image]"}];},
 renderHTML({HTMLAttributes}){return ["div",mergeAttributes(HTMLAttributes,{"data-wave-image":"true"})];},
 addNodeView(){return ReactNodeViewRenderer(ImageView);},
 addCommands(){return {insertWaveImage:(id:string)=>({chain})=>chain().insertContent([{type:this.name,attrs:{imageId:id,width:320}},{type:"paragraph"}]).run()};},
});
