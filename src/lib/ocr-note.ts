/**
 * OCR engines return plain text, while the note editor stores TipTap HTML.
 * Never pass untrusted OCR text to the editor as markup.
 * Each physical OCR line becomes its own paragraph; empty lines stay empty.
 */
/** Keep titles intact across emoji ZWJ sequences, flags and combining marks.
 * Modern Android WebView supports Intl.Segmenter; fallback still prevents
 * dangling UTF-16 surrogate halves on older engines.
 */
export function truncateOcrTitle(value: string, maxGraphemes = 80): string {
  if (!Number.isSafeInteger(maxGraphemes) || maxGraphemes < 0) {
    throw new Error("Invalid OCR title limit");
  }
  type IntlSegmenter = new (locale: string, options: { granularity: "grapheme" }) =>
    { segment: (input: string) => Iterable<{ segment: string }> };
  const Segmenter = (Intl as unknown as { Segmenter?: IntlSegmenter }).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter("und", { granularity: "grapheme" })
      .segment(value), item => item.segment).slice(0, maxGraphemes).join("");
  }
  // Fallback to valid Unicode code points rather than slicing UTF-16 units.
  return Array.from(value).slice(0, maxGraphemes).join("");
}

export function ocrTextToEditorHtml(value: string): string {
  // OCR libraries may return CR, CRLF, Unicode line and paragraph separators.
  // Treat all of them as real editor paragraphs, without deleting any text.
  const normalized = value.replace(/\r\n?|\u2028|\u2029/g, "\n");
  return normalized.split("\n").map(line => {
    const escaped = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      // HTML collapses leading/trailing spaces and tabs. Preserve document
      // indentation, multi-space columns and tab-separated receipt data.
      .replace(/(^ +| +$| {2,}|\t+)/g, whitespace =>
        Array.from(whitespace, ch => ch === "\t" ? "&nbsp;".repeat(4) : "&nbsp;").join(""));
    return escaped ? "<p>" + escaped + "</p>" : "<p><br></p>";
  }).join("");
}

export type OcrNoteDraft = { title: string; body: string };

/** The OCR route writes plain text as a normal, safely encoded local note. */
export function buildOcrNoteDraft(text: string, fallbackTitle: string): OcrNoteDraft {
  if (!text.trim()) throw new Error("OCR_EMPTY_TEXT");
  const firstLine = text.split(/\r\n?|\n|\u2028|\u2029/u).map(line => line.trim()).find(Boolean);
  return {
    title: firstLine ? truncateOcrTitle(firstLine) : fallbackTitle,
    body: ocrTextToEditorHtml(text),
  };
}
