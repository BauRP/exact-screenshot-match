import {useEffect,useRef,useState} from "react";
import type {PointerEvent as ReactPointerEvent} from "react";
import {appendInkPoint,ellipseInkPoints,inkStrokeIndicesAlong,parseInk,serializeInk,type InkPoint,type InkStroke} from "@/lib/wave-ink";

/** Per-drawing undo/redo also works for ink layered over a photograph. */
export function WaveInkCanvas({value,onChange,editable,active=false}:{
 value:string;onChange:(value:string)=>void;editable:boolean;active?:boolean;
}){
 const [strokes,setStrokes]=useState<InkStroke[]>(()=>parseInk(value));
 const [saveError,setSaveError]=useState(false);
 const current=useRef(strokes);
 const past=useRef<InkStroke[][]>([]);
 const future=useRef<InkStroke[][]>([]);
 const [historyVersion,setHistoryVersion]=useState(0);
 const gesture=useRef<number|null>(null);
 const gestureChanged=useRef(false);
 const gestureBefore=useRef<{strokes:InkStroke[];past:InkStroke[][];future:InkStroke[][]}|null>(null);
 const lastEraserPoint=useRef<InkPoint|null>(null);
 const shapeStart=useRef<InkPoint|null>(null);
 const mode=useRef<"pen"|"marker"|"line"|"rectangle"|"ellipse"|"eraser">("pen");
 const lastEmitted=useRef<string|null>(null);
 const [tool,setTool]=useState<"pen"|"marker"|"line"|"rectangle"|"ellipse"|"eraser">("pen");
 const [color,setColor]=useState("#161b22");
 const [size,setSize]=useState(4);
 const [eraserRadius,setEraserRadius]=useState(16);
 useEffect(()=>{
   if(gesture.current!==null)return;
   // A local emission must not erase our undo history when React re-renders.
   if(value===lastEmitted.current){lastEmitted.current=null;return;}
   const next=parseInk(value);
   current.current=next;setStrokes(next);
   past.current=[];future.current=[];setHistoryVersion(v=>v+1);
 },[value]);
 const replace=(list:InkStroke[])=>{current.current=list;setStrokes(list);};
 const markChanged=()=>{
   if(gestureChanged.current)return;
   past.current=[...past.current.slice(-29),current.current];
   future.current=[];gestureChanged.current=true;setHistoryVersion(v=>v+1);
 };
 const emit=(list:InkStroke[])=>{
   try{
     const encoded=serializeInk(list);
     lastEmitted.current=encoded;
     onChange(encoded);
     setSaveError(false);
   }catch(error){
     console.error("Ink save failed",error);
     setSaveError(true);
     // Restore the last serialized state rather than displaying unsaved ink.
     replace(parseInk(value));
     past.current=[];future.current=[];setHistoryVersion(v=>v+1);
   }
 };
 const position=(e:ReactPointerEvent<SVGSVGElement>):InkPoint=>{
  const rect=e.currentTarget.getBoundingClientRect();
  return [Math.round(Math.min(1000,Math.max(0,(e.clientX-rect.left)/Math.max(rect.width,1)*1000))),
    Math.round(Math.min(1000,Math.max(0,(e.clientY-rect.top)/Math.max(rect.height,1)*1000)))];
 };
 const erase=(point:InkPoint,previous:InkPoint|null=null)=>{
   // A tap and a continuous swipe should erase the same overlapping strokes.
   // Treat a tap as a zero-length eraser path, keeping one Undo step.
   const hits=inkStrokeIndicesAlong(current.current,previous??point,point,eraserRadius);
   if(!hits.length)return;
   markChanged();
   const removed=new Set(hits);
   replace(current.current.filter((_,i)=>!removed.has(i)));
 };
 const start=(e:ReactPointerEvent<SVGSVGElement>)=>{
  if(!editable||!active||gesture.current!==null||(current.current.length>=120&&tool!=="eraser"))return;
  if(e.pointerType==="mouse"&&e.button!==0)return;
  e.preventDefault();gesture.current=e.pointerId;gestureChanged.current=false;mode.current=tool;
  gestureBefore.current={strokes:current.current,past:past.current,future:future.current};
  e.currentTarget.setPointerCapture(e.pointerId);
  const point=position(e);
  lastEraserPoint.current=point;
  shapeStart.current=point;
  if(tool==="eraser")erase(point);
  else{
   markChanged();
   replace([...current.current,{tool,color,width:size,points:tool==="line"?[point,point]:tool==="rectangle"?[point,point,point,point,point]:tool==="ellipse"?ellipseInkPoints(point,point):[point]}]);
  }
 };
 const move=(e:ReactPointerEvent<SVGSVGElement>)=>{
  if(gesture.current!==e.pointerId)return;
  e.preventDefault();const point=position(e);
  if(mode.current==="eraser"){erase(point,lastEraserPoint.current);lastEraserPoint.current=point;}
  else{
   const previous=current.current,last=previous[previous.length-1];
   if(!last)return;
   if(mode.current==="line"){
     if(last.points.length!==2)return;
     replace([...previous.slice(0,-1),{...last,points:[last.points[0],point]}]);
     return;
   }
   if(mode.current==="ellipse"){
     if(last.points.length!==33)return;
     replace([...previous.slice(0,-1),{...last,points:ellipseInkPoints(shapeStart.current??last.points[0],point)}]);
     return;
   }
   if(mode.current==="rectangle"){
     if(last.points.length!==5)return;
     const [x,y]=last.points[0],[rx,ry]=point;
     replace([...previous.slice(0,-1),{...last,points:[[x,y],[rx,y],[rx,ry],[x,ry],[x,y]]}]);
     return;
   }
   const prior=last.points[last.points.length-1];
   if(Math.hypot(point[0]-prior[0],point[1]-prior[1])<2)return;
   replace([...previous.slice(0,-1),{...last,points:appendInkPoint(last.points,point)}]);
  }
 };
 const stop=(e:ReactPointerEvent<SVGSVGElement>)=>{
  if(gesture.current!==e.pointerId)return;
  // Android can deliver the final coordinate only on pointerup (especially
  // for quick strokes and eraser swipes). Apply that segment before saving.
  move(e);
  e.preventDefault();gesture.current=null;lastEraserPoint.current=null;shapeStart.current=null;
  gestureBefore.current=null;
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(gestureChanged.current)emit(current.current);
  gestureChanged.current=false;
 };
 // Android may cancel pointer capture on an incoming call, navigation gesture
 // or lost focus. A canceled gesture must not be saved as a completed stroke.
 const cancel=(e:ReactPointerEvent<SVGSVGElement>)=>{
  if(gesture.current!==e.pointerId)return;
  e.preventDefault();
  gesture.current=null;lastEraserPoint.current=null;shapeStart.current=null;
  const before=gestureBefore.current;
  gestureBefore.current=null;
  if(before&&gestureChanged.current){
   replace(before.strokes);
   past.current=before.past;future.current=before.future;
   setHistoryVersion(v=>v+1);
  }
  gestureChanged.current=false;
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 };
 const clear=()=>{
   if(gesture.current!==null||current.current.length===0)return;
   past.current=[...past.current.slice(-29),current.current];
   future.current=[];
   replace([]);
   setHistoryVersion(v=>v+1);
   emit([]);
 };
 const undo=()=>{
   if(gesture.current!==null||!past.current.length)return;
   const previous=past.current[past.current.length-1];
   past.current=past.current.slice(0,-1);
   future.current=[...future.current.slice(-29),current.current];
   replace(previous);setHistoryVersion(v=>v+1);emit(previous);
 };
 const redo=()=>{
   if(gesture.current!==null||!future.current.length)return;
   const next=future.current[future.current.length-1];
   future.current=future.current.slice(0,-1);
   past.current=[...past.current.slice(-29),current.current];
   replace(next);setHistoryVersion(v=>v+1);emit(next);
 };
 return <div className="relative h-full w-full">
   {saveError&&<div role="alert" className="absolute left-2 right-2 top-2 z-10 rounded-lg bg-destructive px-3 py-2 text-xs text-destructive-foreground">
     Рисунок слишком большой. Последний штрих не сохранён.
   </div>}
   <svg role="img" aria-label="Рисунок" viewBox="0 0 1000 1000" preserveAspectRatio="none"
     className={`absolute inset-0 h-full w-full ${editable&&active?"touch-none cursor-crosshair":"pointer-events-none"}`}
     onPointerDown={start} onPointerMove={move} onPointerUp={stop}
     onPointerCancel={cancel} onLostPointerCapture={cancel}>
     {strokes.map((stroke,i)=>stroke.points.length===1?
       <circle key={i} cx={stroke.points[0][0]} cy={stroke.points[0][1]} r={stroke.width/2} fill={stroke.color} opacity={stroke.tool==="marker"?.4:1}/>:
       <polyline key={i} points={stroke.points.map(p=>p.join(",")).join(" ")} fill="none" stroke={stroke.color}
         strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.tool==="marker"?.4:1}/>)}
   </svg>
   {editable&&active&&<div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card/95 p-2 shadow-lg">
     {(["pen","marker","line","rectangle","ellipse","eraser"] as const).map(item=><button key={item} type="button" aria-pressed={tool===item}
       className={`rounded-lg px-2 py-1 text-xs ${tool===item?"bg-primary text-primary-foreground":"bg-secondary"}`}
       onClick={()=>setTool(item)}>{item==="pen"?"Ручка":item==="marker"?"Маркер":item==="line"?"Прямая":item==="rectangle"?"Прямоугольник":item==="ellipse"?"Овал":"Ластик"}</button>)}
     <button type="button" aria-label="Очистить рисунок" title="Очистить рисунок (можно отменить)"
       disabled={strokes.length===0} onClick={clear}
       className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40">Очистить</button>
     <button type="button" aria-label="Отменить штрих" title="Отменить штрих" disabled={!past.current.length}
       onClick={undo} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40">↶</button>
     <button type="button" aria-label="Вернуть штрих" title="Вернуть штрих" disabled={!future.current.length}
       onClick={redo} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40">↷</button>
     {tool!=="eraser"&&<>
       <div className="flex items-center gap-1" aria-label="Цвет пера">
         {(["#161b22","#e11d48","#2563eb","#16a34a","#f8fafc","#f59e0b","#7c3aed","#0d9488","#ca8a04","#64748b","#f97316","#be185d"] as const).map(ink=>
           <button key={ink} type="button" aria-label={"Цвет "+ink} aria-pressed={color===ink}
             onClick={()=>setColor(ink)} className="h-6 w-6 rounded-full border-2"
             style={{backgroundColor:ink,borderColor:color===ink?"#64748b":"transparent"}}/>)}
       </div>
       <select aria-label="Толщина линии" value={size} onChange={e=>setSize(Number(e.target.value))}
         className="rounded-lg bg-secondary px-1 py-1 text-xs">{[1,2,4,8,14,24,28].map(v=><option value={v} key={v}>{v}px</option>)}</select>
     </>}
     {tool==="eraser"&&<label className="flex items-center gap-1 text-xs">
       <span>Размер ластика</span>
       <select aria-label="Размер ластика" value={eraserRadius}
         onChange={event=>setEraserRadius(Number(event.target.value))}
         className="rounded-lg bg-secondary px-1 py-1 text-xs">
         {[8,16,28,40].map(value=><option key={value} value={value}>{value}</option>)}
       </select>
     </label>}
   </div>}
 </div>;
}
