/**
 * OCR engines return plain text, while the note editor stores TipTap HTML.
 * Never pass untrusted OCR text to the editor as markup.
 * Each physical OCR line becomes its own paragraph; empty lines stay empty.
 */
export function ocrTextToEditorHtml(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  return normalized.split("\n").map(line => {
    const escaped = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      // Keep alignment when source text contains repeated spaces.
      .replace(/ {2,}/g, spaces => "&nbsp;".repeat(spaces.length));
    return escaped ? "<p>" + escaped + "</p>" : "<p><br></p>";
  }).join("");
}

/** The OCR route writes plain text as a normal, safely encoded local note. */
export function buildOcrNoteDraft(text: string, fallbackTitle: string): { title: string; body: string } {
  if (!text.trim()) throw new Error("OCR_EMPTY_TEXT");
  const firstLine = text.split(/\r?\n/u).map(line => line.trim()).find(Boolean);
  return {
    // JS .slice() operates on UTF-16 code units and can break a non-BMP
    // character halfway through. Keep the title Unicode-valid on truncation.
    title: firstLine ? Array.from(firstLine).slice(0, 80).join("") : fallbackTitle,
    body: ocrTextToEditorHtml(text),
  };
}
