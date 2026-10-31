/** Offline vector ink with bounded markup, no server, base64 or binary files. */
export type InkPoint=[number,number];
export type InkStroke={tool:"pen"|"marker";color:string;width:number;points:InkPoint[]};
const COLORS=new Set(["#161b22","#e11d48","#2563eb","#16a34a","#f8fafc","#f59e0b"]);
export function parseInk(encoded:unknown):InkStroke[]{
 if(typeof encoded!=="string"||encoded.length>120000)return [];
 let parsed:unknown;
 try{parsed=JSON.parse(encoded);}catch{return [];}
 if(!Array.isArray(parsed)||parsed.length>120)return [];
 const result:InkStroke[]=[];
 for(const raw of parsed){
  if(!raw||typeof raw!=="object")return [];
  const item=raw as Record<string,unknown>;
  if(item.tool!=="pen"&&item.tool!=="marker")return [];
  if(typeof item.color!=="string"||!COLORS.has(item.color))return [];
  if(typeof item.width!=="number"||!Number.isFinite(item.width)||item.width<1||item.width>28)return [];
  if(!Array.isArray(item.points)||item.points.length===0||item.points.length>500)return [];
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
/** Hit-test a whole line segment; the previous point-only eraser missed long strokes. */
function segmentDistance(p:InkPoint,a:InkPoint,b:InkPoint):number{
 const dx=b[0]-a[0],dy=b[1]-a[1],squared=dx*dx+dy*dy;
 if(squared===0)return Math.hypot(p[0]-a[0],p[1]-a[1]);
 const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/squared));
 return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);
}
export function inkStrokeAt(strokes:InkStroke[],point:InkPoint,radius=22):number{
 for(let i=strokes.length-1;i>=0;i--){
  const stroke=strokes[i],points=stroke.points;
  const threshold=radius+stroke.width/2;
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
export function inkStrokeAlong(strokes:InkStroke[],from:InkPoint,to:InkPoint,radius=22):number{
 if(from[0]===to[0]&&from[1]===to[1])return inkStrokeAt(strokes,to,radius);
 for(let i=strokes.length-1;i>=0;i--){
  const stroke=strokes[i],points=stroke.points,threshold=radius+stroke.width/2;
  if(points.length===1){
   if(segmentDistance(points[0],from,to)<=threshold)return i;
   continue;
  }
  for(let j=1;j<points.length;j++){
   const a=points[j-1],c=points[j];
   if(segmentCrosses(from,to,a,c)||
      segmentDistance(a,from,to)<=threshold||
      segmentDistance(c,from,to)<=threshold||
      segmentDistance(from,a,c)<=threshold||
      segmentDistance(to,a,c)<=threshold)return i;
  }
 }
 return -1;
}

/** Render saved vector strokes at any bounded destination size. */
export function paintInk(ctx:CanvasRenderingContext2D,encoded:string,x:number,y:number,width:number,height:number):void{
 const strokes=parseInk(encoded);
 ctx.save();
 ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();
 for(const stroke of strokes){
  const points=stroke.points;
  if(!points.length)continue;
  ctx.beginPath();
  ctx.strokeStyle=stroke.color;
  ctx.fillStyle=stroke.color;
  ctx.lineCap="round";ctx.lineJoin="round";
  ctx.lineWidth=stroke.width*width/1000;
  ctx.globalAlpha=stroke.tool==="marker"?0.4:1;
  for(let i=0;i<points.length;i++){
   const px=x+points[i][0]*width/1000,py=y+points[i][1]*height/1000;
   if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  if(points.length===1){
   ctx.arc(x+points[0][0]*width/1000,y+points[0][1]*height/1000,ctx.lineWidth/2,0,Math.PI*2);
   ctx.fill();
  }else ctx.stroke();
 }
 ctx.restore();
}
