import {strict as assert} from "node:assert";import {readFileSync} from "node:fs";
import {imageWidthForDrag} from "../src/lib/wave-image-resize";
const image=readFileSync("src/components/editor/WaveImage.tsx","utf8");
const canvas=readFileSync("src/components/editor/WaveInkCanvas.tsx","utf8");
for(const mark of ["[retry,setRetry]","},[id,retry]);","Повторить загрузку","setRetry(value=>value+1)"])assert.ok(image.includes(mark),mark);
for(const mark of ["inkStrokeIndicesAlong(current.current,previous??point,point,eraserRadius)","lastEraserPoint.current=point"])assert.ok(canvas.includes(mark),mark);

// Geometry and gesture state are tested offline, without a browser.
assert.equal(imageWidthForDrag(320,100,167),390);
assert.equal(imageWidthForDrag(320,100,101),320,"Tiny moves stay at original width");
assert.equal(imageWidthForDrag(320,100,-900),120,"Minimum size");
assert.equal(imageWidthForDrag(320,100,900),720,"Maximum size");
assert.equal(imageWidthForDrag(320,100,199),420,"Final pointer coordinate counts");
assert.equal(imageWidthForDrag(320,100,NaN),320,"Invalid pointer does not corrupt note");
assert.equal(imageWidthForDrag(NaN,100,100),320,"Invalid width is harmless");
// Pointer moves only update a local preview; the note is saved on release.
// Canceled gestures, lost capture and secondary fingers do not save.
const dragging=image.slice(image.indexOf("onPointerMove={e=>{"),image.indexOf("onPointerUp={e=>{"));
const finishing=image.slice(image.indexOf("onPointerUp={e=>{"),image.indexOf("onPointerCancel={e=>{"));
const stopping=image.slice(image.indexOf("onPointerCancel={e=>{"),image.indexOf("onKeyDown={e=>{"));
assert.ok(dragging.includes("setPreviewWidth(imageWidthForDrag"));
assert.ok(!dragging.includes("updateAttributes("),"Pointer moves must not flood Undo history");
assert.ok(finishing.includes("if(editor.isEditable&&!editor.isDestroyed&&next!==width)updateAttributes({width:next})"));
assert.ok(!stopping.includes("updateAttributes("),"Cancel/lost capture must not persist changes");
assert.ok(image.includes("drag.pointerId!==e.pointerId"),"Only the captured pointer can resize");
assert.ok(image.includes("onLostPointerCapture={e=>{"),"Capture loss discards previews");
assert.ok(image.includes('width:shownWidth+"px"'),"Drag preview must be visible");
console.log("Offline image retry, bounded single-commit photo resize and drawing erase integration checked");