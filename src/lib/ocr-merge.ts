/**
 * Pure OCR selection/merging logic. Coordinates are normalized to [0, 1] after
 * the native image has been oriented and copied into a private temporary file.
 * Neither OCR engines nor language identity are infallible: short Han-only text
 * cannot reliably distinguish Chinese from Japanese.
 */
export type OcrScript = "latin" | "cyrillic" | "chinese" | "japanese" | "korean" | "devanagari";
export interface OcrLine {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  script: OcrScript;
  language?: string;
  confidence?: number;
}
export interface OcrCandidate {
  script: OcrScript;
  text: string;
  lines: OcrLine[];
  confidence?: number;
}

const MATCH: Record<OcrScript, RegExp> = {
  latin: /\p{Script=Latin}/gu,
  cyrillic: /\p{Script=Cyrillic}/gu,
  chinese: /\p{Script=Han}/gu,
  japanese: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu,
  korean: /\p{Script=Hangul}/gu,
  devanagari: /\p{Script=Devanagari}/gu,
};
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN = /\p{Script=Han}/u;

export function lineScore(text: string, script: OcrScript, language?: string, confidence?: number): number {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const digits = (text.match(/\p{N}/gu) ?? []).length;
  // Numeric-only lines (dates, prices, page numbers) and one-character
  // labels are legitimate OCR results. Do not drop them just for being short.
  if (!letters && !digits) return -100;
  const matches = (text.match(MATCH[script]) ?? []).length;
  if (!letters) return 24 + Math.min(digits, 8) * 2 - (text.match(/[\ufffd\u25a1\u25af]/gu) ?? []).length * 20;
  // A model must have actual evidence of its alphabet. Other recognizers
  // sometimes hallucinate Latin letters on a Chinese or Cyrillic page.
  if (matches === 0) return -100;
  const ratio = matches / Math.max(1, letters);
  const invalid = (text.match(/[\ufffd\u25a1\u25af]/gu) ?? []).length;
  const expected = language?.toLowerCase() ?? "";
  const langBonus = script === "japanese" && expected.startsWith("ja") ? 12 :
    script === "chinese" && expected.startsWith("zh") ? 12 :
    script === "korean" && expected.startsWith("ko") ? 12 : 0;
  const kanaBonus = script === "japanese" && KANA.test(text) ? 22 : 0;
  // Japanese recognizers can return Han-only lines. Do not label those as
  // Japanese simply because Han characters are also used in Japanese.
  const japaneseAmbiguity = script === "japanese" && HAN.test(text) && !KANA.test(text) ? 7 : 0;
  const wrongKana = script === "chinese" && KANA.test(text) ? 35 : 0;
  // OCR confidence is a hint only, not a language detector.
  const certainty = Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence!)) * .15 : 0;
  return ratio * 60 + Math.min(letters + digits, 80) * .25 + langBonus + kanaBonus +
    certainty - japaneseAmbiguity - wrongKana - invalid * 20;
}

function valid(line: OcrLine): boolean {
  return Boolean(line.text.trim()) &&
    [line.left, line.top, line.right, line.bottom].every(Number.isFinite) &&
    line.left >= 0 && line.top >= 0 && line.right <= 1.01 && line.bottom <= 1.01 &&
    line.right > line.left && line.bottom > line.top;
}
function intersection(a: OcrLine, b: OcrLine): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}
/**
 * Whether one OCR engine returned a complete physical line while another
 * returned only one of its words. Compare whole words, not substring letters:
 * "7" must not suppress "70", and separate columns must remain separate.
 */
function includesWholePhrase(longer: string, shorter: string): boolean {
  const full = longer.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu," ").trim();
  const part = shorter.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu," ").trim();
  if (Array.from(part).length < 3 || full.length <= part.length) return false;
  let offset = 0;
  while (offset < full.length) {
    const at = full.indexOf(part, offset);
    if (at < 0) return false;
    const before = at === 0 ? "" : full[at - 1];
    const after = at + part.length === full.length ? "" : full[at + part.length];
    if ((!before || !/[\p{L}\p{N}]/u.test(before)) &&
        (!after || !/[\p{L}\p{N}]/u.test(after))) return true;
    offset = at + 1;
  }
  return false;
}

function textContainsOther(a: OcrLine, b: OcrLine): boolean {
  const longer = a.text.length >= b.text.length ? a : b;
  const shorter = a.text.length < b.text.length ? a : b;
  if (!includesWholePhrase(longer.text, shorter.text)) return false;
  const overlap = intersection(longer, shorter);
  if (overlap <= 0) return false;
  const overlapHeight = Math.max(0, Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  const overlapWidth = Math.max(0, Math.min(a.right,b.right)-Math.max(a.left,b.left));
  return overlapHeight / Math.min(a.bottom-a.top,b.bottom-b.top) >= .70 &&
    overlapWidth / (shorter.right-shorter.left) >= .75 &&
    Math.min(a.bottom-a.top,b.bottom-b.top) / Math.max(a.bottom-a.top,b.bottom-b.top) >= .52;
}
function sameRegion(a: OcrLine, b: OcrLine): boolean {
  const overlap = intersection(a, b);
  if (overlap <= 0) return false;
  // Same physical line with full text vs one of its words. Do not create
  // duplicate paragraphs merely because the full box is much wider.
  if (textContainsOther(a,b)) return true;
  const vertical = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const horizontal = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const aWidth = a.right - a.left, bWidth = b.right - b.left;
  const aHeight = a.bottom - a.top, bHeight = b.bottom - b.top;
  // A recognizer can hallucinate a page-wide line over a valid shorter label.
  // Deduplicate only comparable boxes on BOTH axes, not text in nearby columns.
  // One recognizer can draw a wider box around the EXACT same text.
  // Spatial-size disagreement is not evidence that text should be duplicated.
  const sameText = a.text.trim().normalize("NFKC").toLocaleLowerCase() ===
    b.text.trim().normalize("NFKC").toLocaleLowerCase();
  if (sameText && horizontal / Math.min(aWidth, bWidth) >= .65 &&
      vertical / Math.min(aHeight, bHeight) >= .65) return true;
  const widthRatio = Math.min(aWidth, bWidth) / Math.max(aWidth, bWidth);
  const heightRatio = Math.min(aHeight, bHeight) / Math.max(aHeight, bHeight);
  return widthRatio >= .60 && heightRatio >= .52 &&
    horizontal / Math.min(aWidth,bWidth) >= .65 &&
    vertical / Math.min(aHeight,bHeight) >= .65;
}


/** Recognize only clearly separated, multi-row, two-column documents.
 * Overlapping bounding boxes or a page-wide header disable column inference.
 * For less certain layouts retain the existing row-order fallback.
 */
function confirmedColumnSplit(lines: readonly OcrLine[]): number | null {
  if (lines.length < 4) return null;
  const sorted = [...lines].sort((a,b) => a.left - b.left);
  let bestGap = 0.055;
  let bestSplit: number | null = null;
  for (let i=2; i<=sorted.length-2; i++) {
    const left=sorted.slice(0,i), right=sorted.slice(i);
    const separation=Math.min(...right.map(x => x.left)) -
      Math.max(...left.map(x => x.right));
    if (separation <= bestGap) continue;
    const leftTop=Math.min(...left.map(x => x.top));
    const leftBottom=Math.max(...left.map(x => x.bottom));
    const rightTop=Math.min(...right.map(x => x.top));
    const rightBottom=Math.max(...right.map(x => x.bottom));
    const shared=Math.min(leftBottom,rightBottom) - Math.max(leftTop,rightTop);
    // Each column must contain distinct rows, with overlapping page height.
    if (shared < .08 ||
        leftBottom-leftTop < .11 || rightBottom-rightTop < .11) continue;
    bestGap=separation;
    bestSplit=(Math.max(...left.map(x=>x.right)) +
      Math.min(...right.map(x=>x.left)))/2;
  }
  return bestSplit;
}

/**
 * Merge non-overlapping lines from different models in photo reading order,
 * choosing one winner for each overlapping line. Never concatenate every
 * recognizer's whole text: that duplicates the entire page.
 */
export function mergeOcrCandidates(candidates: OcrCandidate[]): string {
  const lines = candidates.flatMap(c => c.lines.map(line => ({
    ...line, confidence: line.confidence ?? c.confidence,
  }))).filter(valid);

  // Some models return text without geometry. If there are too few reliable
  // located lines, use the most plausible COMPLETE text. Never prefer a
  // recognizer whose entire result belongs to another alphabet.
  const plausible = candidates
    .filter(c => c.text.trim())
    .map(c => ({candidate:c, score:lineScore(c.text,c.script,undefined,c.confidence)}))
    .filter(c => c.score >= 20)
    .sort((a,b) => b.score-a.score);
  const unlocated = plausible.filter(c => c.candidate.lines.length === 0);
  if (!lines.length) {
    const best = plausible[0]?.candidate;
    if (!best) return "";
    const kept: string[] = [best.text.trim()];
    const scripts = new Set<OcrScript>([best.script]);
    const normalized = (s: string) => s.normalize("NFKC").toLocaleLowerCase()
      .replace(/\s+/gu, " ").trim();
    const contains = (a: string, b: string) => normalized(a).includes(normalized(b));
    for (const { candidate, score } of plausible.slice(1)) {
      if (scripts.has(candidate.script) || score < 58 ||
          candidate.text.trim().length < 24) continue;
      // Han-only recognition cannot reliably distinguish Chinese/Japanese.
      if ((candidate.script === "chinese" && scripts.has("japanese")) ||
          (candidate.script === "japanese" && scripts.has("chinese"))) continue;
      const ownLetters = (candidate.text.match(MATCH[candidate.script]) ?? []).length;
      const allLetters = (candidate.text.match(/\p{L}/gu) ?? []).length;
      if (ownLetters < 8 || ownLetters / Math.max(1, allLetters) < .75) continue;
      // If the existing full page already contains the proposed script,
      // adding its independently recognized text would duplicate content.
      if (kept.some(existing => {
        const existingLetters = (existing.match(MATCH[candidate.script]) ?? []).length;
        return existingLetters >= 8 || contains(existing, candidate.text) ||
          contains(candidate.text, existing);
      })) continue;
      kept.push(candidate.text.trim());
      scripts.add(candidate.script);
    }
    return kept.join("\n\n");
  }
  // A single located line must not be discarded just because a second
  // model omitted bounding boxes. Only combine when scripts are independent.
  if (lines.length === 1 && unlocated.length) {
    const anchor = lines[0];
    const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
    const exact = unlocated.find(c => normalize(c.candidate.text).includes(normalize(anchor.text)) &&
      normalize(c.candidate.text).length > normalize(anchor.text).length && c.score >= 58);
    if (exact) return exact.candidate.text.trim();
    const different = unlocated.find(c => {
      const other = c.candidate;
      if (other.script === anchor.script ||
          (anchor.script === "japanese" && other.script === "chinese") ||
          (anchor.script === "chinese" && other.script === "japanese") ||
          c.score < 58 || other.text.trim().length < 30) return false;
      const matching = (other.text.match(MATCH[other.script]) ?? []).length;
      const shared = (other.text.match(MATCH[anchor.script]) ?? []).length;
      return matching >= 8 && matching > shared * 2 &&
        !normalize(other.text).includes(normalize(anchor.text));
    });
    if (different && lineScore(anchor.text, anchor.script, anchor.language, anchor.confidence) >= 20) {
      return anchor.text.trim() + "\n\n" + different.candidate.text.trim();
    }
  }

  // Prefer spatial fusion of located lines over a lower-quality unlocated result.
  // Strongest local line wins, not whichever model won the entire page.
  lines.sort((a, b) =>
    lineScore(b.text, b.script, b.language, b.confidence) -
    lineScore(a.text, a.script, a.language, a.confidence));
  const selected: OcrLine[] = [];
  for (const line of lines) {
    if (lineScore(line.text, line.script, line.language, line.confidence) < 20) continue;
    const sameIndex = selected.findIndex(existing => sameRegion(existing, line));
    if (sameIndex !== -1) {
      const current = selected[sameIndex];
      // Scoring favours pure-script fragments, so the shorter recognizer
      // often wins first. Replace it with the confirmed whole-line text.
      if (includesWholePhrase(line.text, current.text) &&
          textContainsOther(line,current) &&
          lineScore(line.text,line.script,line.language,line.confidence) >= 20) {
        selected[sameIndex] = line;
      }
      continue;
    }
    selected.push(line);
  }
  if (!selected.length) return plausible[0]?.candidate.text.trim() ?? "";

  // A model occasionally recognizes a whole multilingual page but omits its
  // bounding boxes. If its COMPLETE text includes every spatially confirmed
  // line in the same reading order, preserve extra lines rather than silently
  // discarding them. Do not append unlocated text: that duplicates paragraphs.
  const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
  const anchorLines = [...selected].sort((a, b) => ((a.top + a.bottom) / 2) - ((b.top + b.bottom) / 2) || a.left - b.left).map(line => normalize(line.text));
  const unlocatedFull = candidates
    .filter(c => c.lines.length === 0 && c.text.trim())
    .filter(c => {
      const parts = c.text.split(/\r?\n/u).map(normalize).filter(Boolean);
      if (parts.length <= anchorLines.length) return false;
      if (!parts.some(part => !anchorLines.includes(part) && /\p{L}/u.test(part))) return false;
      // Only trust an unlocated page if ALL confirmed text is still present.
      // Matching in reading order prevents choosing an unrelated model.
      let index = 0;
      for (const anchor of anchorLines) {
        const found = parts.findIndex((part, at) => at >= index && part.includes(anchor));
        if (found < 0) return false;
        index = found + 1;
      }
      return true;
    })
    .sort((a,b) => b.text.trim().length - a.text.trim().length)[0];
  if (unlocatedFull) return unlocatedFull.text.trim();

  const columnBoundary=confirmedColumnSplit(selected);
  selected.sort((a,b) => {
    if (columnBoundary !== null) {
      const colA=a.left < columnBoundary ? 0 : 1;
      const colB=b.left < columnBoundary ? 0 : 1;
      if (colA !== colB) return colA-colB;
    }
    const centerA=(a.top+a.bottom)/2;
    const centerB=(b.top+b.bottom)/2;
    const maxHeight=Math.max(a.bottom-a.top,b.bottom-b.top);
    return Math.abs(centerA-centerB) < maxHeight*.48 ? a.left-b.left : centerA-centerB;
  });
  const result: string[] = [];
  for (let i = 0; i < selected.length; i++) {
    const current = selected[i];
    if (i > 0) {
      const previous = selected[i - 1];
      const verticalGap = current.top - previous.bottom;
      const typical = Math.max(.005, previous.bottom - previous.top);
      const newColumn=columnBoundary !== null &&
        previous.left < columnBoundary && current.left >= columnBoundary;
      if (newColumn || verticalGap > typical * 1.5) result.push("");
    }
    result.push(current.text.trimEnd());
  }
  // A third script might have NO coordinates at all (e.g. an Asian ML Kit
  // model on a mixed-language document). Do not discard its entire paragraph.
  // Only retain a substantial independent alphabet not already represented
  // among the spatially verified lines, without pretending to know its layout.
  const locatedScripts = new Set(selected.map(line => line.script));
  const extraScripts = new Set<OcrScript>();
  const extra: string[] = [];
  const locatedWords = normalize(result.join(" "));
  for (const { candidate, score } of unlocated) {
    if (score < 58 || candidate.text.trim().length < 30 ||
        locatedScripts.has(candidate.script) || extraScripts.has(candidate.script)) continue;
    // Han-only Chinese/Japanese is ambiguous: preserve spatial content, do
    // not invent a second translated-looking paragraph from the same glyphs.
    if ((candidate.script === "chinese" && locatedScripts.has("japanese")) ||
        (candidate.script === "japanese" && locatedScripts.has("chinese"))) continue;
    const ownLetters = (candidate.text.match(MATCH[candidate.script]) ?? []).length;
    const totalLetters = (candidate.text.match(/\p{L}/gu) ?? []).length;
    if (ownLetters < 8 || ownLetters / Math.max(1,totalLetters) < .7) continue;
    if (locatedWords.includes(normalize(candidate.text))) continue;
    extra.push(candidate.text.trim());
    extraScripts.add(candidate.script);
  }
  const spatial = result.join("\n").trim();
  return extra.length ? [spatial, ...extra].join("\n\n") : spatial;
}


/**
 * Han-only Chinese and Japanese results may refer to the SAME physical line
 * but disagree about its glyphs. There is no reliable way to infer language
 * from Han glyphs alone. Never silently persist that disputed reading.
 * If geometry proves texts belong to different places, no warning is needed.
 */
export function hasAmbiguousHanCandidates(candidates: readonly OcrCandidate[]): boolean {
  const comparable = (text: string) => text.normalize("NFC").replace(/\s+/gu, "").trim();
  const hanOnly = (text: string) => {
    const letters = text.match(/\p{L}/gu) ?? [];
    const han = text.match(/\p{Script=Han}/gu) ?? [];
    return han.length >= 2 && han.length / Math.max(1, letters.length) >= .85 &&
      !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
  };
  const japanese = candidates.filter(c => c.script === "japanese" &&
    c.text.trim() && hanOnly(c.text));
  const chinese = candidates.filter(c => c.script === "chinese" &&
    c.text.trim() && hanOnly(c.text));
  for (const ja of japanese) for (const zh of chinese) {
    if (comparable(ja.text) === comparable(zh.text)) continue;
    const jLines = ja.lines.filter(valid);
    const cLines = zh.lines.filter(valid);
    // Text without rectangles cannot prove that readings came from
    // independent physical regions. Ask the user to confirm.
    if (!jLines.length || !cLines.length) return true;
    for (const j of jLines) for (const c of cLines) {
      const overlap = intersection(j, c);
      const minArea = Math.min((j.right-j.left)*(j.bottom-j.top),
        (c.right-c.left)*(c.bottom-c.top));
      if (minArea > 0 && overlap / minArea >= .45 &&
          comparable(j.text) !== comparable(c.text)) return true;
    }
  }
  return false;
}

export function hasStrongText(candidates: OcrCandidate[]): boolean {
  return candidates.some(c =>
    c.text.trim().length >= 30 &&
    lineScore(c.text, c.script, undefined, c.confidence) >= 58 &&
    !/[\ufffd\u25a1]/u.test(c.text));
}


/**
 * Independent scripts without reliable line coordinates cannot establish a
 * physical reading order. Keep the content, but require review before save.
 * A single script, noise and Han-only Chinese/Japanese pairs are excluded.
 */
export function hasUncertainMixedScriptLayout(candidates: readonly OcrCandidate[]): boolean {
  const credible = candidates.filter(candidate => {
    const letters = candidate.text.match(/\p{L}/gu) ?? [];
    if (letters.length < 8 || candidate.text.trim().length < 12) return false;
    const ownLetters = candidate.text.match(MATCH[candidate.script]) ?? [];
    return ownLetters.length >= 5 && ownLetters.length / letters.length >= .65 &&
      lineScore(candidate.text,candidate.script,undefined,candidate.confidence) >= 58;
  });
  const scripts = new Set(credible.map(item =>
    item.script === "japanese" || item.script === "chinese" ? "han" : item.script));
  return scripts.size >= 2 && credible.some(item => !item.lines.some(valid));
}


/** Spatial fusion compares every plausible line against previous candidates.
 * Avoid quadratic work and a locked WebView on huge scanned pages.
 * The fallback keeps native full-text readings from every credible model,
 * visibly separated for human review rather than dropping a language.
 */
export const OCR_SPATIAL_LINE_LIMIT = 350;
export function exceedsOcrSpatialBudget(candidates: readonly OcrCandidate[]): boolean {
  let lines = 0;
  for (const candidate of candidates) {
    lines += candidate.lines.length;
    if (lines > OCR_SPATIAL_LINE_LIMIT) return true;
  }
  return false;
}

export function mergeOversizedOcrForReview(candidates: readonly OcrCandidate[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const candidate of candidates) {
    const text = candidate.text.trim();
    if (!text || lineScore(text,candidate.script,undefined,candidate.confidence) < 20) continue;
    const key = text.normalize("NFC").replace(/\s+/gu," ").trim().toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(text);
  }
  return parts.join("\n\n");
}
