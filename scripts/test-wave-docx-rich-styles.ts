import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {docxRun} from "../src/lib/note-export";
const rendered=docxRun("Привет & <World>",{
 bold:true,italic:true,underline:true,strike:true,color:"e11d48",highlight:"fde68a",fontSize:18
});
for(const code of ['<w:b/>','<w:i/>','<w:u w:val="single"/>','<w:strike/>',
 '<w:color w:val="E11D48"/>','<w:shd w:fill="FDE68A"/>','<w:sz w:val="27"/>',
 'Привет &amp; &lt;World&gt;'])assert.ok(rendered.includes(code),code);
assert.ok(!docxRun("x",{color:'FF0000" bad="1',highlight:'BAD!',fontSize:999}).includes("bad="));
assert.equal(docxRun("x",{color:"broken"}).includes("<w:color"),false);
const source=readFileSync("src/lib/note-export.ts","utf8");
for(const code of ['if(["S","DEL","STRIKE"].includes(tag))next.strike=true;',
 'if(decoration.includes("line-through"))next.strike=true;',
 'el.style.getPropertyValue("background-color")',
 'next.fontSize=Number.parseInt(size,10)'])assert.ok(source.includes(code),code);
console.log("Word rich text style, safe formatting attributes and XML escaping passed");
