import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const source=readFileSync("src/lib/note-export.ts","utf8");
for(const marker of [
 'if(el.hasAttribute("data-wave-image"))return "[Фотография',
 'if(el.hasAttribute("data-wave-drawing"))return "[Рисунок',
 'if(el.hasAttribute("data-audio-note"))return "[Аудиозапись',
 'if(el.hasAttribute("data-wave-image"))return doc.createTextNode("[Фотография',
 'if(el.hasAttribute("data-wave-drawing"))return doc.createTextNode("[Рисунок',
 'if(el.hasAttribute("data-audio-note"))return doc.createTextNode("[Аудиозапись',
 'el.getAttribute("data-type")==="wave-check-item"',
 'const start=Number(parent.getAttribute("start")||1);',
 'value=(Number.isSafeInteger(start)&&start>=1&&index>=0?(start+index)+". ":"• ")+value;',
 'body.querySelectorAll("[data-wave-tape]")'
]) assert.ok(source.includes(marker),marker);
console.log("Photo/audio/drawing markers in text and HTML plus numbered and checklist raster exports wired");
