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
function sameRegion(a: OcrLine, b: OcrLine): boolean {
  const overlap = intersection(a, b);
  if (overlap <= 0) return false;
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
  if (!lines.length || (lines.length < 2 && unlocated.length)) {
    return plausible[0]?.candidate.text.trim() ?? "";
  }

  // Prefer spatial fusion of located lines over a lower-quality unlocated result.
  // Strongest local line wins, not whichever model won the entire page.
  lines.sort((a, b) =>
    lineScore(b.text, b.script, b.language, b.confidence) -
    lineScore(a.text, a.script, a.language, a.confidence));
  const selected: OcrLine[] = [];
  for (const line of lines) {
    if (lineScore(line.text, line.script, line.language, line.confidence) < 20) continue;
    if (selected.some(existing => sameRegion(existing, line))) continue;
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

  selected.sort((a, b) => {
    const centerA = (a.top + a.bottom) / 2;
    const centerB = (b.top + b.bottom) / 2;
    const maxHeight = Math.max(a.bottom - a.top, b.bottom - b.top);
    return Math.abs(centerA - centerB) < maxHeight * .48 ? a.left - b.left : centerA - centerB;
  });
  const result: string[] = [];
  for (let i = 0; i < selected.length; i++) {
    const current = selected[i];
    if (i > 0) {
      const previous = selected[i - 1];
      const verticalGap = current.top - previous.bottom;
      const typical = Math.max(.005, previous.bottom - previous.top);
      if (verticalGap > typical * 1.5) result.push("");
    }
    result.push(current.text.trimEnd());
  }
  return result.join("\n").trim();
}

export function hasStrongText(candidates: OcrCandidate[]): boolean {
  return candidates.some(c =>
    c.text.trim().length >= 30 &&
    lineScore(c.text, c.script, undefined, c.confidence) >= 58 &&
    !/[\ufffd\u25a1]/u.test(c.text));
}
