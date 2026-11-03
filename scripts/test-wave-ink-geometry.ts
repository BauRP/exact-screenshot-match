import {strict as assert} from "node:assert";
import {ellipseInkPoints,inkStrokeAt,inkStrokeAlong,inkStrokeIndicesAlong,parseInk,serializeInk,type InkStroke} from "../src/lib/wave-ink";
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
console.log("Ink eraser line-segment and serialization tests passed");

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
