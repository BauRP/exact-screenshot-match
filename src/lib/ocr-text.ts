import type { OcrScript } from "./ocr-merge";
/**
 * Converts native ML Kit output into lossless-enough human-readable text.
 * Some recognizers return a valid full text when geometry/blocks are empty.
 * Never replace that full text with an empty string.
 */
export interface TextScanResult {
  text: string;
  blocks?: Array<{ lines?: Array<{ text: string }> }>;
}
export function composeRecognizedText(result: TextScanResult): string {
  const fallback = (result.text ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "");
  const blocks = result.blocks ?? [];
  if (blocks.length === 0) return fallback;
  const paragraphs = blocks.map(block => (block.lines ?? [])
    .map(line => (line.text ?? "").replace(/[ \t]+$/g, ""))
    .filter(line => line.trim().length > 0)
    .join("\n")
  ).filter(paragraph => paragraph.length > 0);
  // The native API may include only partially populated blocks. Prefer the
  // full text instead of saving nothing or dropping large parts of the page.
  if (!paragraphs.length) return fallback;
  const structured = paragraphs.join("\n\n");
  // A recognizer may return only some lines in blocks while "text" contains
  // the complete page. Compare actual characters instead of raw lengths:
  // a missing short word in a mixed-language photo is still important.
  const compact = (value: string) => value.replace(/\s+/gu, "");
  const full = compact(fallback);
  const partial = compact(structured);
  if (full.length > partial.length) {
    // The difference could be one Kazakh letter, a price digit or a single
    // punctuation mark. There is no safe percentage threshold for data loss.
    // Trust the complete result only when EVERY line from native blocks
    // appears within it IN ORDER. Otherwise keep structured geometry text.
    let offset = 0;
    const ordered = paragraphs.flatMap(p => p.split("\n")).map(compact).filter(Boolean)
      .every(piece => {
        const index = full.indexOf(piece, offset);
        if (index < 0) return false;
        offset = index + piece.length;
        return true;
      });
    if (ordered) return fallback;
  }
  return structured;
}


/**
 * ML Kit can report a different full-text string from the text represented
 * by its block/line iterator. A silent choice would risk changing glyphs or
 * losing paragraphs. Differences in whitespace/normalization alone are OK.
 * A longer full-text result is used by the native composer, but the later
 * geometric merger can still discard the unlocated remainder. Request review
 * for substantial missing content as well as conflicting glyph readings.
 */
export function hasConflictingNativeOcrText(result: TextScanResult): boolean {
  const full = (result.text ?? "").normalize("NFC").replace(/\s+/gu,"");
  const blocks = (result.blocks ?? []).flatMap(block => block.lines ?? [])
    .map(line => (line.text ?? "").trim()).filter(Boolean);
  if (!full || !blocks.length) return false;
  const combined = blocks.join("").normalize("NFC").replace(/\s+/gu,"");
  if (!combined || full === combined || combined.includes(full)) return false;
  // The complete native text may contain whole paragraphs missing from its
  // line iterator. Geometric fusion then discards those paragraphs even though
  // the recognizer did read them. The 3-codepoint floor excludes a punctuation
  // mark or isolated price digit; preserve substantial additions for review.
  if (full.includes(combined)) {
    return Array.from(full).length - Array.from(combined).length >= 3 &&
      Array.from(combined).length >= 3;
  }
  // Genuine glyph disagreements need manual review too. Tiny 1-2 character
  // fragments cannot be confidently cross-checked against page geometry.
  if (Array.from(full).length < 3 || Array.from(combined).length < 3) return false;
  return true;
}


/** Display-only excerpts of both native interpretations, kept offline for
 * manual review. Never replace an entire multilingual page with a single
 * recognizer's alternative automatically.
 */
export type OcrNativeTextAlternative = {
  script: OcrScript;
  complete: string;
  lines: string;
};
export function extractNativeTextAlternative(
  script: OcrScript, result: TextScanResult,
): OcrNativeTextAlternative | null {
  if (!hasConflictingNativeOcrText(result)) return null;
  const lines = (result.blocks ?? []).flatMap(block => block.lines ?? [])
    .map(line => line.text?.trim() ?? "").filter(Boolean).join("\n");
  const preview = (value: string) => Array.from(value).slice(0,2000).join("");
  return {script,complete:preview(result.text ?? ""),lines:preview(lines)};
}


/** A native OCR engine can produce the whole page even when its returned
 * bounding boxes only cover some lines. The main geometric merger may then
 * drop unlocated sentences. Keep those complete original lines in the EDITABLE
 * result, marked for human review by OcrNativeTextReviewError.
 *
 * This is not a second OCR pass, automatic translation, or a claim that every
 * extra character is correct. Keep at most one copy of each added line and
 * preserve the already merged languages in their original order.
 */
export function recoverNativeFullTextForReview(
  merged: string,
  readings: readonly {script: OcrScript; text: string}[],
  alternativeScripts: readonly OcrScript[],
): string {
  if (!merged.trim() || !alternativeScripts.length) return merged;
  const normalize = (value: string) => value.normalize("NFC")
    .replace(/\s+/gu,"").toLocaleLowerCase();
  const seen = new Set<string>();
  const additions: string[] = [];
  let searchable = normalize(merged);
  for (const reading of readings) {
    if (!alternativeScripts.includes(reading.script) || reading.text.length > 100000) continue;
    for (const line of reading.text.replace(/\r\n?/gu,"\n").split("\n")) {
      const original = line.trim();
      const key=normalize(original);
      // Single letters, short receipt numbers and punctuation in this path
      // have insufficient independent evidence. They remain in the visible
      // native comparison but are not appended to the editable main body.
      if (Array.from(key).length < 3 || !/[\p{L}\p{N}]/u.test(key) ||
          searchable.includes(key) || seen.has(key)) continue;
      seen.add(key);
      additions.push(original);
      searchable += "\n" + key;
    }
  }
  return additions.length ? merged.trimEnd() + "\n\n" + additions.join("\n") : merged;
}
