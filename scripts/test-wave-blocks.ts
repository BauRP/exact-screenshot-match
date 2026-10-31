import { strict as assert } from "node:assert";
import {readFileSync} from "node:fs";
import {WaveCallout,WaveFold,WaveTape,isCalloutKind} from "../src/lib/wave-blocks";
assert.equal(WaveCallout.name,"waveCallout");
assert.equal(WaveFold.name,"waveFold");
assert.equal(WaveTape.name,"waveTape");
assert.equal(isCalloutKind("info"),true);
assert.equal(isCalloutKind("script"),false);
const blocks=readFileSync("src/lib/wave-blocks.ts","utf8");
assert.ok(blocks.includes("setNodeMarkup(pos,undefined"));
assert.ok(blocks.includes('"data-wave-tape":"true"'));
assert.ok(blocks.includes("classList.toggle(\"wave-tape-open\")"));
const e=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const name of ["WaveCallout,","WaveFold,","WaveTape,","Вставить блок","Скрыть выбранный ответ","Сворачиваемый раздел","Быстрое меню вставки","toggleBlockquote()"]){
 assert.ok(e.includes(name),name);
}
assert.ok(e.includes("onClick={handleSave}"));
console.log("Wave callout, folding, reveal tape and slash UI checks passed");
