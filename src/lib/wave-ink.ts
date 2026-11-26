/** Offline vector ink with bounded markup, no server, base64 or binary files. */
export type InkPoint=[number,number];
export type InkStroke={tool:"pen"|"marker"|"line"|"arrow"|"rectangle"|"ellipse";color:string;width:number;points:InkPoint[]};
/** Long freehand strokes must not silently stop at the 500-point storage
 * limit. Sample older points while preserving both ends and each new point. */
export function appendInkPoint(points:readonly InkPoint[],point:InkPoint):InkPoint[]{
 if(points.length<500)return [...points,point];
 const compact:InkPoint[]=[];
 for(let i=0;i<points.length;i++){
  if(i===0||i===points.length-1||i%2===0)compact.push(points[i]);
 }
 return [...compact,point];
}
/** 32-segment closed vector ellipse: compatible with ink eraser, undo and export. */
export function ellipseInkPoints(from:InkPoint,to:InkPoint):InkPoint[]{
 const cx=(from[0]+to[0])/2,cy=(from[1]+to[1])/2;
 const rx=Math.abs(to[0]-from[0])/2,ry=Math.abs(to[1]-from[1])/2;
 const pts:InkPoint[]=[];
 for(let i=0;i<=32;i++){
  const theta=2*Math.PI*i/32;
  pts.push([Math.round(cx+rx*Math.cos(theta)),Math.round(cy+ry*Math.sin(theta))]);
 }
 pts[32]=pts[0];
 return pts;
}
/** A vector arrow is saved as one stroke, so eraser, rotation, sharing
 * and Undo work exactly like a regular line. Repeating the tip prevents
 * a diagonal line joining the two arrowhead wings. */
export function arrowInkPoints(from:InkPoint,to:InkPoint):InkPoint[]{
 const dx=to[0]-from[0],dy=to[1]-from[1],distance=Math.hypot(dx,dy);
 if(!distance)return [from,to,to,to,to];
 const ux=dx/distance,uy=dy/distance,head=Math.min(80,distance*0.3);
 const wing=(sign:number):InkPoint=>[
  Math.round(Math.max(0,Math.min(1000,to[0]-head*ux+sign*head*0.55*uy))),
  Math.round(Math.max(0,Math.min(1000,to[1]-head*uy-sign*head*0.55*ux)))
 ];
 return [from,to,wing(1),to,wing(-1)];
}
const COLORS=new Set(["#161b22","#e11d48","#2563eb","#16a34a","#f8fafc","#f59e0b","#7c3aed","#0d9488","#ca8a04","#64748b","#f97316","#be185d"]);
export function parseInk(encoded:unknown):InkStroke[]{
 if(typeof encoded!=="string"||encoded.length>120000)return [];
 let parsed:unknown;
 try{parsed=JSON.parse(encoded);}catch{return [];}
 if(!Array.isArray(parsed)||parsed.length>120)return [];
 const result:InkStroke[]=[];
 for(const raw of parsed){
  if(!raw||typeof raw!=="object")return [];
  const item=raw as Record<string,unknown>;
  if(item.tool!=="pen"&&item.tool!=="marker"&&item.tool!=="line"&&item.tool!=="arrow"&&item.tool!=="rectangle"&&item.tool!=="ellipse")return [];
  if(typeof item.color!=="string"||!COLORS.has(item.color))return [];
  if(typeof item.width!=="number"||!Number.isFinite(item.width)||item.width<1||item.width>28)return [];
  if(!Array.isArray(item.points)||item.points.length===0||item.points.length>500||
     (item.tool==="line"&&item.points.length!==2)||
     (item.tool==="arrow"&&item.points.length!==5)||
     (item.tool==="rectangle"&&item.points.length!==5)||
     (item.tool==="ellipse"&&item.points.length!==33))return [];
  const points:InkPoint[]=[];
  for(const p of item.points){
   if(!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=="number"||!Number.isFinite(n)||n<0||n>1000))return [];
   points.push([p[0],p[1]]);
  }
  result.push({tool:item.tool,color:item.color,width:item.width,points});
 }
 return result;
}
export function serializeInk(strokes:InkStroke[]):string{
 if(strokes.length>120)throw Error("Достигнут предел линий в рисунке");
 const text=JSON.stringify(strokes);
 if(text.length>120000||parseInk(text).length!==strokes.length)throw Error("Рисунок слишком большой или повреждён");
 return text;
}
/** Duplicate the last stroke for both drawings and photo annotations.
 * Safe no-op at the 120 stroke / 120 KB limits, with independent point
 * arrays for future erasing and editing. The original ink is never mutated. */
export function duplicateInkStrokeAt(strokes:readonly InkStroke[],index:number):InkStroke[]|null{
 if(!Number.isInteger(index)||index<0||index>=strokes.length||strokes.length>=120)return null;
 const original=strokes[index];
 const xs=original.points.map(p=>p[0]),ys=original.points.map(p=>p[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const dx=maxX<=988?12:minX>=12?-12:0;
 const dy=maxY<=988?12:minY>=12?-12:0;
 const copy:InkStroke={...original,points:original.points.map(([x,y]):InkPoint=>[x+dx,y+dy])};
 const result=[...strokes,copy];
 try{serializeInk(result);return result;}catch{return null;}
}
export function duplicateLastInkStroke(strokes:readonly InkStroke[]):InkStroke[]|null{
 return duplicateInkStrokeAt(strokes,strokes.length-1);
}

/** Move complete ink geometry within the 1000-unit canvas without clipping
 * or distorting any line, arrow, ellipse or annotation. Clamps a shared
 * displacement for ALL points (clamping each point would deform drawings).
 * null means no safe movement; callers must not create an Undo entry. */
export function translateInkStrokes(
 strokes:readonly InkStroke[],dx:number,dy:number
):InkStroke[]|null{
 if(!strokes.length||!Number.isSafeInteger(dx)||!Number.isSafeInteger(dy)||
    (dx===0&&dy===0))return null;
 let minX=1000,maxX=0,minY=1000,maxY=0;
 for(const stroke of strokes)for(const [x,y] of stroke.points){
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1000||y<0||y>1000)return null;
  minX=Math.min(minX,x);maxX=Math.max(maxX,x);
  minY=Math.min(minY,y);maxY=Math.max(maxY,y);
 }
 const shiftX=Math.max(-minX,Math.min(1000-maxX,dx));
 const shiftY=Math.max(-minY,Math.min(1000-maxY,dy));
 if(!shiftX&&!shiftY)return null;
 return strokes.map(stroke=>({...stroke,points:stroke.points.map(([x,y]):InkPoint=>[x+shiftX,y+shiftY])}));
}

/** Reversible transformations of vector ink, never touching image files.
 * Fresh coordinate arrays preserve hit-test caching and undo correctness. */
export type InkTransform="flip-x"|"flip-y"|"rotate-cw"|"rotate-ccw";
export function transformInkStrokes(strokes:readonly InkStroke[],op:InkTransform):InkStroke[]{
 return strokes.map(stroke=>({...stroke,points:stroke.points.map(([x,y]):InkPoint=>
  op==="flip-x"?[1000-x,y]:op==="flip-y"?[x,1000-y]:op==="rotate-ccw"?[y,1000-x]:[1000-y,x]
 )}));
}
/** Prepare and serialize a transform before callers touch live state or Undo/Redo.
 * A null result means the selected stroke(s) or final encoded drawing is invalid. */
export function prepareInkTransform(
 strokes:readonly InkStroke[],op:InkTransform,selectedIndices?:readonly number[]
):{strokes:InkStroke[];encoded:string}|null{
 if(!strokes.length)return null;
 const selected=selectedIndices===undefined?null:new Set(selectedIndices);
 if(selected&&(!selected.size||[...selected].some(index=>
   !Number.isInteger(index)||index<0||index>=strokes.length)))return null;
 const next=strokes.map((stroke,index)=>
   selected===null||selected.has(index)?transformInkStrokes([stroke],op)[0]:stroke
 );
 try{return {strokes:next,encoded:serializeInk(next)};}catch{return null;}
}
/** Hit-test a whole line segment; the previous point-only eraser missed long strokes. */
function segmentDistance(p:InkPoint,a:InkPoint,b:InkPoint):number{
 const dx=b[0]-a[0],dy=b[1]-a[1],squared=dx*dx+dy*dy;
 if(squared===0)return Math.hypot(p[0]-a[0],p[1]-a[1]);
 const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/squared));
 return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);
}
/** Immutable ink objects remain stable across pointer moves. Cache only their
 * geometry so fast eraser swipes on drawings with 120 x 500 points do not scan
 * 60,000 line segments for each irrelevant pointer event.
 * The editor always creates new stroke objects when points change. */
type InkBounds={points:InkPoint[];minX:number;maxX:number;minY:number;maxY:number};
const inkBoundsCache=new WeakMap<InkStroke,InkBounds>();
function inkBounds(stroke:InkStroke):InkBounds{
 const found=inkBoundsCache.get(stroke);
 if(found?.points===stroke.points)return found;
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(const [x,y] of stroke.points){
  minX=Math.min(minX,x);maxX=Math.max(maxX,x);
  minY=Math.min(minY,y);maxY=Math.max(maxY,y);
 }
 const bounds={points:stroke.points,minX,maxX,minY,maxY};
 inkBoundsCache.set(stroke,bounds);
 return bounds;
}
function boundsTouches(b:InkBounds,minX:number,maxX:number,minY:number,maxY:number,margin:number):boolean{
 return b.maxX+margin>=minX&&b.minX-margin<=maxX&&
  b.maxY+margin>=minY&&b.minY-margin<=maxY;
}
export function inkStrokeAt(strokes:InkStroke[],point:InkPoint,radius=22):number{
 for(let i=strokes.length-1;i>=0;i--){
  const stroke=strokes[i],points=stroke.points;
  const threshold=radius+stroke.width/2;
  if(!boundsTouches(inkBounds(stroke),point[0],point[0],point[1],point[1],threshold))continue;
  if(points.length===1&&Math.hypot(point[0]-points[0][0],point[1]-points[0][1])<=threshold)return i;
  for(let j=1;j<points.length;j++){
   if(segmentDistance(point,points[j-1],points[j])<=threshold)return i;
  }
 }
 return -1;
}

/** Continuous eraser path hit-test: quick pen/finger movement cannot skip
 * strokes in between pointer events. Works for drawing and photo annotations. */
function segmentCrosses(a:InkPoint,b:InkPoint,c:InkPoint,d:InkPoint):boolean {
 const cross=(p:InkPoint,q:InkPoint,z:InkPoint)=>(q[0]-p[0])*(z[1]-p[1])-(q[1]-p[1])*(z[0]-p[0]);
 const x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b);
 // Collinear but distant segments do not intersect.
 if(x===0&&y===0&&u===0&&v===0){
  return Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&
    Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]));
 }
 return ((x>=0&&y<=0)||(x<=0&&y>=0))&&((u>=0&&v<=0)||(u<=0&&v>=0));
}
/** All strokes hit by a continuous eraser movement. A single fast swipe
 * must remove EVERY crossing stroke, not just the topmost one. */
export function inkStrokeIndicesAlong(strokes:InkStroke[],from:InkPoint,to:InkPoint,radius=22):number[]{
 const hits:number[]=[];
 const minX=Math.min(from[0],to[0]),maxX=Math.max(from[0],to[0]);
 const minY=Math.min(from[1],to[1]),maxY=Math.max(from[1],to[1]);
 for(let i=0;i<strokes.length;i++){
  const stroke=strokes[i],points=stroke.points,threshold=radius+stroke.width/2;
  if(!boundsTouches(inkBounds(stroke),minX,maxX,minY,maxY,threshold))continue;
  if(points.length===1){
   if(segmentDistance(points[0],from,to)<=threshold)hits.push(i);
   continue;
  }
  for(let j=1;j<points.length;j++){
   const a=points[j-1],c=points[j];
   if(segmentCrosses(from,to,a,c)||
      segmentDistance(a,from,to)<=threshold||
      segmentDistance(c,from,to)<=threshold||
      segmentDistance(from,a,c)<=threshold||
      segmentDistance(to,a,c)<=threshold){
     hits.push(i);break;
   }
  }
 }
 return hits;
}
/** Keep the previous topmost-hit API for callers and older saved drawings. */
export function inkStrokeAlong(strokes:InkStroke[],from:InkPoint,to:InkPoint,radius=22):number{
 const hits=inkStrokeIndicesAlong(strokes,from,to,radius);
 return hits.length?hits[hits.length-1]:-1;
}
/** Render saved vector strokes with the same non-uniform SVG viewBox scaling
 * as the editor. Photos and notebook drawings are often not square: scaling
 * only the coordinates but not the pen thickness distorts PNG/PDF exports.
 * save/restore isolates the transformation from any following export item. */
export function paintInk(ctx:CanvasRenderingContext2D,encoded:string,x:number,y:number,width:number,height:number):void{
 if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return;
 const strokes=parseInk(encoded);
 if(!strokes.length)return;
 ctx.save();
 ctx.translate(x,y);
 ctx.scale(width/1000,height/1000);
 ctx.beginPath();ctx.rect(0,0,1000,1000);ctx.clip();
 for(const stroke of strokes){
  const points=stroke.points;
  ctx.beginPath();
  ctx.strokeStyle=stroke.color;
  ctx.fillStyle=stroke.color;
  ctx.lineCap="round";ctx.lineJoin="round";
  ctx.lineWidth=stroke.width;
  ctx.globalAlpha=stroke.tool==="marker"?0.4:1;
  for(let i=0;i<points.length;i++){
   const [px,py]=points[i];
   if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  if(points.length===1){
   ctx.arc(points[0][0],points[0][1],stroke.width/2,0,Math.PI*2);
   ctx.fill();
  }else ctx.stroke();
 }
 ctx.restore();
}
