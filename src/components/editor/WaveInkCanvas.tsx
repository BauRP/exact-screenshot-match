import {useEffect,useRef,useState} from "react";
import type {PointerEvent as ReactPointerEvent} from "react";
import {inkStrokeAt,parseInk,serializeInk,type InkPoint,type InkStroke} from "@/lib/wave-ink";

export function WaveInkCanvas({value,onChange,editable,active=false}:{
 value:string;onChange:(value:string)=>void;editable:boolean;active?:boolean;
}){
 const [strokes,setStrokes]=useState<InkStroke[]>(()=>parseInk(value));
 const current=useRef(strokes);
 const gesture=useRef<number|null>(null);
 const mode=useRef<"pen"|"marker"|"eraser">("pen");
 const [tool,setTool]=useState<"pen"|"marker"|"eraser">("pen");
 const [color,setColor]=useState("#161b22");
 const [size,setSize]=useState(4);
 useEffect(()=>{if(gesture.current!==null)return;const next=parseInk(value);current.current=next;setStrokes(next);},[value]);
 const replace=(list:InkStroke[])=>{current.current=list;setStrokes(list);};
 const position=(e:ReactPointerEvent<SVGSVGElement>):InkPoint=>{
  const rect=e.currentTarget.getBoundingClientRect();
  return [Math.round(Math.min(1000,Math.max(0,(e.clientX-rect.left)/Math.max(rect.width,1)*1000))),
    Math.round(Math.min(1000,Math.max(0,(e.clientY-rect.top)/Math.max(rect.height,1)*1000)))];
 };
 const start=(e:ReactPointerEvent<SVGSVGElement>)=>{
  if(!editable||!active||gesture.current!==null||current.current.length>=120&&tool!=="eraser")return;
  e.preventDefault();gesture.current=e.pointerId;mode.current=tool;
  e.currentTarget.setPointerCapture(e.pointerId);
  const point=position(e);
  if(tool==="eraser"){
   const at=inkStrokeAt(current.current,point);
   if(at>=0)replace(current.current.filter((_,i)=>i!==at));
  }else{
   replace([...current.current,{tool,color,width:size,points:[point]}]);
  }
 };
 const move=(e:ReactPointerEvent<SVGSVGElement>)=>{
  if(gesture.current!==e.pointerId)return;
  e.preventDefault();const point=position(e);
  if(mode.current==="eraser"){
   const at=inkStrokeAt(current.current,point);
   if(at>=0)replace(current.current.filter((_,i)=>i!==at));
  }else{
   const strokes=current.current;const last=strokes[strokes.length-1];
   if(!last||last.points.length>=500)return;
   const prior=last.points[last.points.length-1];
   if(Math.hypot(point[0]-prior[0],point[1]-prior[1])<2)return;
   replace([...strokes.slice(0,-1),{...last,points:[...last.points,point]}]);
  }
 };
 const stop=(e:ReactPointerEvent<SVGSVGElement>)=>{
  if(gesture.current!==e.pointerId)return;
  e.preventDefault();gesture.current=null;
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  try{onChange(serializeInk(current.current));}catch(error){console.error("Ink save failed",error);}
 };
 return <div className="relative h-full w-full">
   <svg role="img" aria-label="Рисунок" viewBox="0 0 1000 1000" preserveAspectRatio="none"
     className={`absolute inset-0 h-full w-full ${editable&&active?"touch-none cursor-crosshair":"pointer-events-none"}`}
     onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
     {strokes.map((stroke,i)=>stroke.points.length===1?
       <circle key={i} cx={stroke.points[0][0]} cy={stroke.points[0][1]} r={stroke.width/2} fill={stroke.color} opacity={stroke.tool==="marker"?.4:1}/>:
       <polyline key={i} points={stroke.points.map(p=>p.join(",")).join(" ")} fill="none" stroke={stroke.color}
         strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.tool==="marker"?.4:1}/>)}
   </svg>
   {editable&&active&&<div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card/95 p-2 shadow-lg">
     {(["pen","marker","eraser"] as const).map(item=><button key={item} type="button" aria-pressed={tool===item}
       className={`rounded-lg px-2 py-1 text-xs ${tool===item?"bg-primary text-primary-foreground":"bg-secondary"}`}
       onClick={()=>setTool(item)}>{item==="pen"?"Ручка":item==="marker"?"Маркер":"Ластик"}</button>)}
     {tool!=="eraser"&&<>
       <div className="flex items-center gap-1" aria-label="Цвет пера">
         {(["#161b22","#e11d48","#2563eb","#16a34a","#f8fafc","#f59e0b"] as const).map(ink=>
           <button key={ink} type="button" aria-label={"Цвет "+ink} aria-pressed={color===ink}
             onClick={()=>setColor(ink)} className="h-6 w-6 rounded-full border-2"
             style={{backgroundColor:ink,borderColor:color===ink?"#64748b":"transparent"}}/>)}
       </div>
       <select aria-label="Толщина линии" value={size} onChange={e=>setSize(Number(e.target.value))}
         className="rounded-lg bg-secondary px-1 py-1 text-xs">{[2,4,8,14,24].map(v=><option value={v} key={v}>{v}px</option>)}</select>
     </>}
   </div>}
 </div>;
}
