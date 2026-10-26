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
