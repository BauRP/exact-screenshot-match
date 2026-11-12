import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {appendInkPoint,ellipseInkPoints,inkStrokeAt,inkStrokeAlong,inkStrokeIndicesAlong,parseInk,serializeInk,type InkStroke,type InkPoint} from "../src/lib/wave-ink";
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
assert.ok(canvas.includes("appendInkPoint(last.points,point)"),"Canvas must keep sampling after 500 points");
assert.ok(canvas.includes('role="alert"'),"An unsaved drawing must show a warning");
assert.ok(canvas.includes("onLostPointerCapture={cancel}"),"Lost capture must release an interrupted gesture");
assert.ok(canvas.includes("replace(before.strokes)"),"Cancel must restore the exact previous strokes");
assert.ok(canvas.includes("  move(e);\n  e.preventDefault();gesture.current=null;"),
 "Pointer-up must incorporate the final finger location before the ink is saved");
assert.ok(canvas.includes("past.current=before.past;future.current=before.future"),"Cancel must preserve Undo/Redo history");
assert.ok(canvas.includes('inkStrokeAt(current.current,point,eraserRadius)'));
assert.ok(canvas.includes('inkStrokeIndicesAlong(current.current,previous,point,eraserRadius)'));
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
