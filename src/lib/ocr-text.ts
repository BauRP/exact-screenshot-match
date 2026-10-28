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
 * If one text is simply a longer complete version, preserve the existing
 * fallback behaviour; only conflicting textual content requests review.
 */
export function hasConflictingNativeOcrText(result: TextScanResult): boolean {
  const full = (result.text ?? "").normalize("NFC").replace(/\s+/gu,"");
  const blocks = (result.blocks ?? []).flatMap(block => block.lines ?? [])
    .map(line => (line.text ?? "").trim()).filter(Boolean);
  if (!full || !blocks.length) return false;
  const combined = blocks.join("").normalize("NFC").replace(/\s+/gu,"");
  if (!combined || full === combined || full.includes(combined) ||
      combined.includes(full)) return false;
  // One- or two-character mismatches are ambiguous, but a three- to five-
  // character Japanese/Korean/Kazakh name is meaningful and must be reviewable.
  if (Array.from(full).length < 3 || Array.from(combined).length < 3) return false;
  return true;
}
