import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {appendInkPoint,ellipseInkPoints,inkStrokeAt,inkStrokeAlong,inkStrokeIndicesAlong,paintInk,parseInk,serializeInk,type InkStroke,type InkPoint} from "../src/lib/wave-ink";
const line:InkStroke={tool:"pen",color:"#161b22",width:4,points:[[0,0],[1000,0]]};
assert.equal(inkStrokeAt([line],[500,5],5),0);
assert.equal(inkStrokeAt([line],[500,100],5),-1);
assert.equal(inkStrokeAt([line],[995,2],5),0);
assert.equal(inkStrokeAlong([line],[500,-10],[500,10],5),0);
assert.equal(inkStrokeAlong([line],[500,100],[500,110],5),-1);
assert.equal(inkStrokeAlong([line],[1100,0],[1200,0],5),-1);
assert.deepEqual(parseInk(serializeInk([line])),[line]);
assert.deepEqual(parseInk('not-json'),[]);
const upper:InkStroke={...line,points:[[0,10],[1000,10]]};
assert.deepEqual(inkStrokeIndicesAlong([line,upper],[500,-10],[500,20],3),[0,1]);
assert.deepEqual(inkStrokeIndicesAlong([line,upper],[500,100],[500,110],3),[]);
let longPath:InkPoint[]=[[0,0]];
for(let i=1;i<=2500;i++){
 longPath=appendInkPoint(longPath,[i%1001,Math.round(i/3)%1001]);
 assert.ok(longPath.length<=500,"Freehand gestures never exceed storage point limit");
}
assert.deepEqual(longPath[0],[0,0],"First endpoint must survive compaction");
assert.deepEqual(longPath[longPath.length-1],[2500%1001,Math.round(2500/3)%1001],
 "Final pointer position must survive");
assert.deepEqual(parseInk(serializeInk([{...line,points:longPath}]))[0].points,longPath,
 "A long gesture must survive real save and re-open");
console.log("Long ink drawing and serialization tested");

const straight:InkStroke={tool:"line",color:"#2563eb",width:8,points:[[100,100],[900,900]]};
assert.deepEqual(parseInk(serializeInk([straight])),[straight]);
assert.equal(inkStrokeAt([straight],[500,500],5),0);
assert.equal(inkStrokeAt([straight],[500,800],5),-1);
assert.deepEqual(parseInk(JSON.stringify([{...straight,points:[[100,100]]}])),[]);

const box:InkStroke={tool:"rectangle",color:"#2563eb",width:6,
 points:[[100,100],[400,100],[400,300],[100,300],[100,100]]};
assert.deepEqual(parseInk(serializeInk([box])),[box]);
assert.equal(inkStrokeAt([box],[250,103],4),0);
assert.equal(inkStrokeAt([box],[250,200],4),-1);
assert.deepEqual(parseInk(JSON.stringify([{...box,points:[[100,100],[400,300]]}])),[]);

const oval:InkStroke={tool:"ellipse",color:"#e11d48",width:5,points:ellipseInkPoints([100,100],[500,300])};
assert.equal(oval.points.length,33);
assert.deepEqual(oval.points[0],oval.points[32]);
assert.deepEqual(parseInk(serializeInk([oval])),[oval]);
assert.equal(inkStrokeAt([oval],[500,200],8),0);
assert.equal(inkStrokeAt([oval],[300,200],8),-1);
assert.deepEqual(parseInk(JSON.stringify([{...oval,points:oval.points.slice(0,-1)}])),[]);

const canvas=readFileSync("src/components/editor/WaveInkCanvas.tsx","utf8");
assert.ok(canvas.includes('aria-label="Размер ластика"'));
assert.ok(canvas.includes("onPointerCancel={cancel}"),"Cancelled ink must not commit an incomplete stroke");
assert.ok(canvas.includes("if(!editable||!active){cancel(e);return;}"),
 "Pointerup after annotation mode is closed must roll back unsaved ink");
assert.ok(canvas.includes("appendInkPoint(last.points,point)"),"Canvas must keep sampling after 500 points");
assert.ok(canvas.includes('role="alert"'),"An unsaved drawing must show a warning");
assert.ok(canvas.includes("onLostPointerCapture={cancel}"),"Lost capture must release an interrupted gesture");
assert.ok(canvas.includes("replace(before.strokes)"),"Cancel must restore the exact previous strokes");
assert.ok(canvas.includes("  move(e);\n  e.preventDefault();gesture.current=null;"),
 "Pointer-up must incorporate the final finger location before the ink is saved");
assert.ok(canvas.includes("past.current=before.past;future.current=before.future"),"Cancel must preserve Undo/Redo history");
assert.ok(canvas.includes('inkStrokeIndicesAlong(current.current,previous??point,point,eraserRadius)'),"Tapped eraser must not leave hidden overlapping strokes");
assert.ok(canvas.includes('previous??point'),"The same eraser path handles taps and swipes");
assert.ok(canvas.includes('[8,16,28,40]'));
for(const color of ["#7c3aed","#0d9488","#ca8a04","#64748b","#f97316","#be185d"]){
 const colored={...line,color};
 assert.deepEqual(parseInk(serializeInk([colored])),[colored],"New ink palette colors must survive save/restore");
 assert.ok(canvas.includes(color),"Palette color visible in both drawing and photo tools");
}
assert.equal(inkStrokeAt([line],[500,30],8),-1,"Thin eraser must spare distant strokes");
assert.equal(inkStrokeAt([line],[500,30],40),0,"Wide eraser should reach distant strokes");
assert.deepEqual(inkStrokeIndicesAlong([line],[500,30],[600,30],8),[]);
assert.deepEqual(inkStrokeIndicesAlong([line],[500,30],[600,30],40),[0]);

// A tapped eraser at the crossing of two strokes removes both, consistently
// with a swipe. A non-hit must not remove anything.
const crossing:InkStroke={...line,points:[[500,0],[500,1000]]};
assert.deepEqual(inkStrokeIndicesAlong([line,crossing],[500,0],[500,0],5),[0,1]);
assert.deepEqual(inkStrokeIndicesAlong([line,crossing],[900,900],[900,900],5),[]);

// The export must match SVG preserveAspectRatio="none": the SAME normalized
// pen width is stretched in both dimensions, not just horizontal scale.
const calls:{name:string;args:unknown[]}[]=[];
const record=(name:string)=>(...args:unknown[])=>calls.push({name,args});
const ctx={
 save:record("save"),restore:record("restore"),translate:record("translate"),
 scale:record("scale"),beginPath:record("beginPath"),rect:record("rect"),
 clip:record("clip"),moveTo:record("moveTo"),lineTo:record("lineTo"),
 stroke:record("stroke"),fill:record("fill"),arc:record("arc"),
 lineWidth:0,strokeStyle:"",fillStyle:"",lineCap:"butt",lineJoin:"miter",globalAlpha:1,
} as unknown as CanvasRenderingContext2D;
paintInk(ctx,serializeInk([line,{...line,tool:"marker",points:[[600,600]]}]),13,17,800,320);
assert.deepEqual(calls.filter(c=>["translate","scale","rect"].includes(c.name)),[
 {name:"translate",args:[13,17]},{name:"scale",args:[0.8,0.32]},
 {name:"rect",args:[0,0,1000,1000]}
]);
assert.ok(calls.some(c=>c.name==="moveTo"&&c.args[0]===0&&c.args[1]===0),
 "Ink export must use normalized coordinates, not double-scale points");
assert.equal(ctx.lineWidth,4,"Pen width stays normalized to match editor strokes");
assert.equal(ctx.globalAlpha,0.4,"Marker transparency is retained");
assert.equal(calls.filter(c=>c.name==="save").length,1);
assert.equal(calls.filter(c=>c.name==="restore").length,1);
const count=calls.length;
paintInk(ctx,"[]",0,0,800,320);
paintInk(ctx,serializeInk([line]),0,0,0,100);
assert.equal(calls.length,count,"Empty/zero-sized drawings must not alter canvas state");
