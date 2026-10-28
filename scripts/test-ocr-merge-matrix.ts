import { strict as assert } from "node:assert";
import { mergeOcrCandidates, type OcrCandidate, type OcrScript } from "../src/lib/ocr-merge";

/** Deterministic script/geometry regression matrix; no simulated confidence
 * should be interpreted as measured accuracy of a physical photograph.
 */
const texts: Record<OcrScript,string> = {
 latin:"Detailed English information about the document",
 cyrillic:"Подробная информация о документе",
 chinese:"中文识别的段落内容与真实文本信息",
 japanese:"日本語の説明文と長い文章があります",
 korean:"한국어 문서에는 중요한 정보가 있습니다",
 devanagari:"हिन्दी भाषा में विस्तृत जानकारी मौजूद",
};
const scripts = Object.keys(texts) as OcrScript[];
const located = (script:OcrScript,top:number):OcrCandidate=>({
 script,text:texts[script],
 lines:[{text:texts[script],script,left:.09,right:.82,top,bottom:top+.05}],
});
let checked=0;
for(const [i,primary] of scripts.entries()){
 const p=located(primary,.12);
 assert.equal(mergeOcrCandidates([p,p]),texts[primary]);
 checked++;
 for(const [j,secondary] of scripts.entries()){
   if(j===i)continue;
   const q=located(secondary,.52);
   // Japanese and Chinese read identical Han characters sometimes, so only
   // test safe spatial separation here, not automatic identity inference.
   const expected=texts[primary]+"\n\n"+texts[secondary];
   assert.equal(mergeOcrCandidates([p,q]),expected);
   assert.equal(mergeOcrCandidates([q,p]),expected);
   checked+=2;
 }
}
// One native model can recognize just a small word of a much longer line.
// Ensure the more complete located text survives regardless of model order.
const full:OcrCandidate={script:"cyrillic",text:"Қазақша Hello әлем",
 lines:[{script:"cyrillic",text:"Қазақша Hello әлем",
 left:.1,right:.88,top:.18,bottom:.24}]};
const part:OcrCandidate={script:"latin",text:"Hello",
 lines:[{script:"latin",text:"Hello",left:.52,right:.70,top:.18,bottom:.24}]};
assert.equal(mergeOcrCandidates([full,part]),full.text);
assert.equal(mergeOcrCandidates([part,full]),full.text);
checked+=2;
console.log("OCR multi-script order and overlap matrix:",checked,"assertions passed.");
