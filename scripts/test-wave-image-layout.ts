import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const image=readFileSync("src/components/editor/WaveImage.tsx","utf8");
for(const s of ['aria-label="Расположение фотографии"','aria-label="Изменить размер фото перетаскиванием"','data-align','updateAttributes({width:Math.max(120,Math.min(720','setPointerCapture'])assert.ok(image.includes(s),s);
console.log("Photo alignment, saved marker, resize and bounds present");
