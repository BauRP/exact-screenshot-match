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
  if (full.length > partial.length &&
      full.length >= partial.length * 1.12 &&
      (full.includes(partial) || paragraphs.every(p => full.includes(compact(p))))) {
    return fallback;
  }
  return structured;
}
