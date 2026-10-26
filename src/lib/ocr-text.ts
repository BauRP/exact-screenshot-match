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
  // If structure contains a tiny subset of the native text, keep the full
  // native result; geometry merging still uses available lines independently.
  if (fallback.trim().length > structured.trim().length * 1.7 &&
      fallback.trim().length - structured.trim().length > 20) return fallback;
  return structured;
}
