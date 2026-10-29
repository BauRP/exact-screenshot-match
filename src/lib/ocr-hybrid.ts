import {
  lineScore, mergeOcrCandidates,
  type OcrCandidate, type OcrLine,
} from "./ocr-merge";

/**
 * One image region -> one reading. This is a local multi-script OCR fusion
 * stage, NOT a language translator. The geometry comes from the existing
 * ML Kit and Tesseract line rectangles (normalized 0..1).
 *
 * The automatic path never appends a second recognizer's text merely because
 * it uses another alphabet. Multiple independent regions, including different
 * scripts in the same physical row, are preserved in reading order.
 */
type Located = {line:OcrLine;score:number;source:OcrCandidate};

const goodBox=(line:OcrLine)=>Boolean(line.text.trim()) &&
  [line.left,line.top,line.right,line.bottom].every(Number.isFinite) &&
  line.left>=0&&line.top>=0&&line.right<=1.01&&line.bottom<=1.01 &&
  line.right>line.left&&line.bottom>line.top;

function regionConflict(a:OcrLine,b:OcrLine):boolean {
  const width=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left));
  const height=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  if(!width||!height)return false;
  const aw=a.right-a.left,bw=b.right-b.left;
  const ah=a.bottom-a.top,bh=b.bottom-b.top;
  const widthFraction=width/Math.min(aw,bw);
  const heightFraction=height/Math.min(ah,bh);
  // Same physical text read by two models: substantial overlap on BOTH axes.
  // Nearby side-by-side Cyrillic/Japanese words must survive separately.
  return widthFraction>=.62 && heightFraction>=.65 &&
    Math.min(ah,bh)/Math.max(ah,bh)>=.44;
}

function quality(line:OcrLine,candidate:OcrCandidate):number {
  const confidence=line.confidence??candidate.confidence;
  const base=lineScore(line.text,line.script,line.language,confidence);
  const count=(regex:RegExp)=>(line.text.match(regex)??[]).length;
  // Independent distinctive glyphs are stronger evidence than text that a
  // mismatched model may hallucinate in another alphabet on the same pixels.
  const distinctive=line.script==="japanese"
    ? count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)
    : line.script==="korean" ? count(/\p{Script=Hangul}/gu)
    : line.script==="devanagari" ? count(/\p{Script=Devanagari}/gu)
    : line.script==="cyrillic"
      ? count(/[ӘәҒғҚқҢңӨөҰұҮүҺһІіЁёЫыЭэЮюЯяЩщЦцЧчШш]/gu) : 0;
  return base+Math.min(24,distinctive*5);
}

export type HybridOcrResult={
  text:string; discardedOverlappingReadings:number; hadLocatedLines:boolean;
};

export function mergeHybridOcr(candidates:readonly OcrCandidate[]):HybridOcrResult {
  const located:Located[]=[];
  for(const source of candidates){
    for(const line of source.lines){
      if(!goodBox(line))continue;
      const score=quality(line,source);
      if(score<20)continue;
      located.push({line,score,source});
    }
  }
  if(!located.length) {
    // No usable coordinates: retain exactly the existing safe full-text
    // fallback rather than inventing positions or translating glyphs.
    return {text:mergeOcrCandidates([...candidates]),
      discardedOverlappingReadings:0,hadLocatedLines:false};
  }
  // Bound comparisons on dense pages, consistent with the existing native
  // geometry budget. Never do unbounded quadratic filtering.
  if(located.length>350) {
    return {text:mergeOcrCandidates([...candidates]),
      discardedOverlappingReadings:0,hadLocatedLines:true};
  }
  located.sort((a,b)=>b.score-a.score);
  const kept:Located[]=[];
  let discarded=0;
  for(const candidate of located) {
    const duplicate=kept.find(old=>regionConflict(candidate.line,old.line));
    if(duplicate) {
      discarded++;
      // Keep the highest-quality reading already selected for this region.
      continue;
    }
    kept.push(candidate);
  }
  // Preserve geometry and one chosen reading per location. In particular,
  // don't pass excluded original full-text strings into the old routine:
  // fallback append logic could reintroduce the same fake Cyrillic passage.
  const byScript=new Map<OcrCandidate["script"],OcrLine[]>();
  for(const {line} of kept){
    const group=byScript.get(line.script)??[];
    group.push(line);
    byScript.set(line.script,group);
  }
  const filtered:OcrCandidate[]=[...byScript].map(([script,lines])=>({
    script,lines,
    text:lines.map(line=>line.text).join("\n"),
  }));
  return {text:mergeOcrCandidates(filtered),
    discardedOverlappingReadings:discarded,hadLocatedLines:true};
}
