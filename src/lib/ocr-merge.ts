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
  latin: /[A-Za-zÀ-ɏ]/gu,
  cyrillic: /[\u0400-\u052f]/gu,
  chinese: /[\u3400-\u9fff]/gu,
  japanese: /[\u3040-\u30ff\u3400-\u9fff]/gu,
  korean: /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/gu,
  devanagari: /[\u0900-\u097f]/gu,
};
const KANA = /[\u3040-\u30ff]/u;
const HAN = /[\u3400-\u9fff]/u;

export function lineScore(text: string, script: OcrScript, language?: string, confidence?: number): number {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const digits = (text.match(/\p{N}/gu) ?? []).length;
  if (letters < 2 && digits < 4) return -100;
  const matches = (text.match(MATCH[script]) ?? []).length;
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
  const aArea = (a.right - a.left) * (a.bottom - a.top);
  const bArea = (b.right - b.left) * (b.bottom - b.top);
  // Compare against smaller line: OCR engines often disagree on word extent.
  return overlap > 0 && overlap / Math.min(aArea, bArea) > .45;
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

  const unlocated = candidates.filter(c => c.text.trim() && c.lines.length === 0 && lineScore(c.text, c.script, undefined, c.confidence) >= 30);
  if (!lines.length || (unlocated.length && lines.length < 2)) {
    return candidates
      .filter(c => c.text.trim())
      .sort((a, b) => lineScore(b.text, b.script, undefined, b.confidence) -
        lineScore(a.text, a.script, undefined, a.confidence))[0]?.text.trim() ?? "";
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
