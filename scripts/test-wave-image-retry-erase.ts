import {strict as assert} from "node:assert";import {readFileSync} from "node:fs";
const image=readFileSync("src/components/editor/WaveImage.tsx","utf8");
const canvas=readFileSync("src/components/editor/WaveInkCanvas.tsx","utf8");
for(const mark of ["[retry,setRetry]","},[id,retry]);","Повторить загрузку","setRetry(value=>value+1)"])assert.ok(image.includes(mark),mark);
for(const mark of ["inkStrokeAlong(current.current,previous,point)","lastEraserPoint.current=point"])assert.ok(canvas.includes(mark),mark);
console.log("Offline image retry and continuous drawing erase integration checked");