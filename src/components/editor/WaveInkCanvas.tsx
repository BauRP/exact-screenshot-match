import {useEffect,useRef,useState} from "react";
import type {PointerEvent as ReactPointerEvent} from "react";
import {appendInkPoint,arrowInkPoints,ellipseInkPoints,inkStrokeAt,inkStrokeIndicesAlong,parseInk,serializeInk,prepareInkTransform,translateInkStrokes,duplicateInkStrokeAt,type InkTransform,type InkPoint,type InkStroke} from "@/lib/wave-ink";
type InkTool="select"|"pen"|"marker"|"line"|"arrow"|"rectangle"|"ellipse"|"eraser";

/** Per-drawing undo/redo also works for ink layered over a photograph. */
export function WaveInkCanvas({value,onChange,editable,active=false}:{
 value:string;onChange:(value:string)=>void;editable:boolean;active?:boolean;
}){
 const [strokes,setStrokes]=useState<InkStroke[]>(()=>parseInk(value));
 const [saveError,setSaveError]=useState(false);
 const [selectedStroke,setSelectedStroke]=useState<number|null>(null);
 const current=useRef(strokes);
 const past=useRef<InkStroke[][]>([]);
 const future=useRef<InkStroke[][]>([]);
 const [historyVersion,setHistoryVersion]=useState(0);
 const gesture=useRef<number|null>(null);
 const canvasRef=useRef<SVGSVGElement|null>(null);
 const gestureChanged=useRef(false);
 const gestureBefore=useRef<{strokes:InkStroke[];past:InkStroke[][];future:InkStroke[][]}|null>(null);
 const lastEraserPoint=useRef<InkPoint|null>(null);
 const shapeStart=useRef<InkPoint|null>(null);
 const mode=useRef<InkTool>("pen");
 const lastEmitted=useRef<string|null>(null);
 const [tool,setTool]=useState<InkTool>("pen");
 const [color,setColor]=useState("#161b22");
 const [size,setSize]=useState(4);
 const [eraserRadius,setEraserRadius]=useState(16);
 useEffect(()=>{
   if(gesture.current!==null)return;
   // A local emission must not erase our undo history when React re-renders.
   if(value===lastEmitted.current){lastEmitted.current=null;return;}
   const next=parseInk(value);
   current.current=next;setStrokes(next);setSelectedStroke(null);
   past.current=[];future.current=[];setHistoryVersion(v=>v+1);
 },[value]);
 const replace=(list:InkStroke[])=>{current.current=list;setStrokes(list);};
 // When a photo is closed, editor becomes read-only or annotation is
 // switched off mid-gesture, abort immediately. Android may never deliver
 // pointerup after a modal or focus change, so do not leave the canvas locked.
 useEffect(()=>{
   if((editable&&active)||gesture.current===null)return;
   const pointer=gesture.current;
   gesture.current=null;lastEraserPoint.current=null;shapeStart.current=null;
   const before=gestureBefore.current;
   gestureBefore.current=null;
   if(before&&gestureChanged.current){
     replace(before.strokes);
     past.current=before.past;future.current=before.future;
     setHistoryVersion(v=>v+1);
   }
   gestureChanged.current=false;
   const canvas=canvasRef.current;
   if(canvas?.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);
 },[editable,active]);
 const markChanged=()=>{
   if(gestureChanged.current)return;
   past.current=[...past.current.slice(-29),current.current];
   future.current=[];gestureChanged.current=true;setHistoryVersion(v=>v+1);
 };
 const publish=(list:InkStroke[],preparedEncoding?:string):boolean=>{
   let encoded=preparedEncoding;
   try{encoded??=serializeInk(list);}
   catch(error){
     console.error("Ink serialization failed",error);
     setSaveError(true);
     return false;
   }
   const previousEmission=lastEmitted.current;
   lastEmitted.current=encoded;
   try{
     onChange(encoded);
     setSaveError(false);
     return true;
   }catch(error){
     lastEmitted.current=previousEmission;
     console.error("Ink save failed",error);
     setSaveError(true);
     return false;
   }
 };
 const emit=(list:InkStroke[])=>publish(list);
 // Toolbar edits publish first. Only then may live strokes or history change.
 const commitEdit=(next:InkStroke[],selection:number|null=null,encoded?:string):boolean=>{
   if(!publish(next,encoded))return false;
   past.current=[...past.current.slice(-29),current.current];
   future.current=[];
   replace(next);
   setSelectedStroke(selection!==null&&selection>=0&&selection<next.length?selection:null);
   setHistoryVersion(v=>v+1);
   return true;
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
  if(!editable||!active||gesture.current!==null||
     (current.current.length>=120&&tool!=="eraser"&&tool!=="select"))return;
  if(e.pointerType==="mouse"&&e.button!==0)return;
  if(tool==="select"){
   e.preventDefault();e.stopPropagation();
   setSelectedStroke(inkStrokeAt(current.current,position(e),28));
   return;
  }
  setSelectedStroke(null);
  e.preventDefault();gesture.current=e.pointerId;gestureChanged.current=false;mode.current=tool;
  gestureBefore.current={strokes:current.current,past:past.current,future:future.current};
  e.currentTarget.setPointerCapture(e.pointerId);
  const point=position(e);
  lastEraserPoint.current=point;
  shapeStart.current=point;
  if(tool==="eraser")erase(point);
  else{
   markChanged();
   replace([...current.current,{tool,color,width:size,points:tool==="line"?[point,point]:tool==="arrow"?arrowInkPoints(point,point):tool==="rectangle"?[point,point,point,point,point]:tool==="ellipse"?ellipseInkPoints(point,point):[point]}]);
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
   if(mode.current==="arrow"){
     if(last.points.length!==5)return;
     replace([...previous.slice(0,-1),{...last,points:arrowInkPoints(shapeStart.current??last.points[0],point)}]);
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
  // A read-only or closed annotation tool cannot save a gesture that started
  // while editing was allowed. Restore its exact prior ink and Undo history.
  if(!editable||!active){cancel(e);return;}
  // Android can deliver the final coordinate only on pointerup (especially
  // for quick strokes and eraser swipes). Apply that segment before saving.
  move(e);
  e.preventDefault();gesture.current=null;lastEraserPoint.current=null;shapeStart.current=null;
  const before=gestureBefore.current;
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  const saved=!gestureChanged.current||emit(current.current);
  if(!saved&&before){
   replace(before.strokes);
   past.current=before.past;future.current=before.future;
   setHistoryVersion(v=>v+1);
  }
  gestureBefore.current=null;
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
 const transformAll=(operation:InkTransform)=>{
   if(!editable||!active||gesture.current!==null||current.current.length===0)return;
   const indices=selectedStroke===null?undefined:[selectedStroke];
   // Check the final 120 KB serialization limit before changing Undo/Redo.
   const prepared=prepareInkTransform(current.current,operation,indices);
   if(!prepared){setSaveError(true);return;}
   commitEdit(prepared.strokes,selectedStroke,prepared.encoded);
 };
 const nudgeInk=(dx:number,dy:number)=>{
   if(!editable||!active||gesture.current!==null)return;
   let next:InkStroke[]|null=null;
   if(selectedStroke===null)next=translateInkStrokes(current.current,dx,dy);
   else{
    const selected=current.current[selectedStroke];
    if(!selected)return;
    const moved=translateInkStrokes([selected],dx,dy);
    if(moved)next=current.current.map((stroke,index)=>index===selectedStroke?moved[0]:stroke);
   }
   if(!next)return;
   let encoded:string;
   try{encoded=serializeInk(next);}catch{setSaveError(true);return;}
   commitEdit(next,selectedStroke,encoded);
 };
 const removeLastStroke=()=>{
   if(!editable||!active||gesture.current!==null||!current.current.length)return;
   const index=selectedStroke!==null&&selectedStroke<current.current.length
     ?selectedStroke:current.current.length-1;
   commitEdit(current.current.filter((_,position)=>position!==index),null);
 };
 const repeatLastStroke=()=>{
   if(!editable||!active||gesture.current!==null||!current.current.length)return;
   const index=selectedStroke!==null&&selectedStroke<current.current.length
     ?selectedStroke:current.current.length-1;
   // Validate count and serialized size before changing the canvas or history.
   const next=duplicateInkStrokeAt(current.current,index);
   if(!next)return;
   commitEdit(next,next.length-1);
 };
 const clear=()=>{
   if(!editable||!active||gesture.current!==null||current.current.length===0)return;
   commitEdit([],null);
 };
 const undo=()=>{
   if(!editable||!active||gesture.current!==null||!past.current.length)return;
   const previous=past.current[past.current.length-1];
   if(!publish(previous))return;
   past.current=past.current.slice(0,-1);
   future.current=[...future.current.slice(-29),current.current];
   replace(previous);setSelectedStroke(null);setHistoryVersion(v=>v+1);
 };
 const redo=()=>{
   if(!editable||!active||gesture.current!==null||!future.current.length)return;
   const next=future.current[future.current.length-1];
   if(!publish(next))return;
   future.current=future.current.slice(0,-1);
   past.current=[...past.current.slice(-29),current.current];
   replace(next);setSelectedStroke(null);setHistoryVersion(v=>v+1);
 };
 return <div className="relative h-full w-full">
   {saveError&&<div role="alert" className="absolute left-2 right-2 top-2 z-10 rounded-lg bg-destructive px-3 py-2 text-xs text-destructive-foreground">
     Рисунок слишком большой. Последний штрих не сохранён.
   </div>}
   <svg ref={canvasRef} role="img" aria-label="Рисунок" viewBox="0 0 1000 1000" preserveAspectRatio="none"
     className={`absolute inset-0 h-full w-full ${editable&&active?"touch-none cursor-crosshair":"pointer-events-none"}`}
     onPointerDown={start} onPointerMove={move} onPointerUp={stop}
     onPointerCancel={cancel} onLostPointerCapture={cancel}>
     {strokes.map((stroke,i)=><g key={i}>
       {stroke.points.length===1
         ?<circle cx={stroke.points[0][0]} cy={stroke.points[0][1]} r={stroke.width/2} fill={stroke.color} opacity={stroke.tool==="marker"?.4:1}/>
         :<polyline points={stroke.points.map(p=>p.join(",")).join(" ")} fill="none" stroke={stroke.color}
           strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.tool==="marker"?.4:1}/>}
       {selectedStroke===i&&(stroke.points.length===1
         ?<circle cx={stroke.points[0][0]} cy={stroke.points[0][1]} r={stroke.width/2+8} fill="none" stroke="var(--primary)" strokeWidth={4} strokeDasharray="5 4"/>
         :<polyline points={stroke.points.map(p=>p.join(",")).join(" ")} fill="none" stroke="var(--primary)"
           strokeWidth={stroke.width+9} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 6" opacity={0.8}/>)}
     </g>)}
   </svg>
   {editable&&active&&<div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card/95 p-2 shadow-lg">
     {(["select","pen","marker","line","arrow","rectangle","ellipse","eraser"] as const).map(item=><button key={item} type="button" aria-pressed={tool===item}
       className={`rounded-lg px-2 py-1 text-xs ${tool===item?"bg-primary text-primary-foreground":"bg-secondary"}`}
       onClick={()=>setTool(item)}>{item==="select"?"Выбрать":item==="pen"?"Ручка":item==="marker"?"Маркер":item==="line"?"Прямая":item==="arrow"?"Стрелка":item==="rectangle"?"Прямоугольник":item==="ellipse"?"Овал":"Ластик"}</button>)}
     <button type="button" aria-label="Отразить линии горизонтально" title="Отразить линии, не фотографию"
       disabled={strokes.length===0} onClick={()=>transformAll("flip-x")}
       className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40">⇔</button>
     <button type="button" aria-label="Отразить линии вертикально" title="Отразить линии, не фотографию"
       disabled={strokes.length===0} onClick={()=>transformAll("flip-y")}
       className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40">⇕</button>
     <button type="button" aria-label="Повернуть линии на 90 градусов" title="Повернуть только линии"
       disabled={strokes.length===0} onClick={()=>transformAll("rotate-cw")}
       className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40">⟳ 90°</button>
     <button type="button" aria-label="Повернуть линии на 90 градусов против часовой стрелки"
       title="Повернуть нарисованные линии влево с возможностью отмены"
       disabled={strokes.length===0} onClick={()=>transformAll("rotate-ccw")}
       className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40">⟲ 90°</button>
     <div role="group" aria-label="Передвинуть линии рисунка" className="flex items-center gap-1">
       {([
         {dx:0,dy:-20,label:"Сдвинуть линии вверх",text:"↑"},
         {dx:0,dy:20,label:"Сдвинуть линии вниз",text:"↓"},
         {dx:-20,dy:0,label:"Сдвинуть линии влево",text:"←"},
         {dx:20,dy:0,label:"Сдвинуть линии вправо",text:"→"},
       ] as const).map(option=><button key={option.label} type="button"
         aria-label={option.label} title="Переместить весь рисунок, не изображение"
         disabled={!strokes.length} onClick={()=>nudgeInk(option.dx,option.dy)}
         className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40">{option.text}</button>)}
     </div>
     <button type="button" aria-label={selectedStroke===null?"Удалить последний штрих":"Удалить выбранный штрих"}
       title={selectedStroke===null?"Удалить один последний штрих с возможностью отмены":"Удалить выбранный штрих с возможностью отмены"}
       disabled={!strokes.length} onClick={removeLastStroke}
       className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40">{selectedStroke===null?"− штрих":"Удалить выбранное"}</button>
     <button type="button" aria-label={selectedStroke===null?"Повторить последний штрих":"Дублировать выбранный штрих"}
       title={selectedStroke===null?"Продублировать последнюю линию, можно отменить":"Создать независимую копию выбранного штриха"}
       disabled={strokes.length===0||strokes.length>=120}
       onClick={repeatLastStroke}
       className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40">{selectedStroke===null?"Повторить штрих":"Дублировать выбранное"}</button>
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
