/** Values always refer to the original PDF page, not the viewport. */
export function normalizePdfMargins(left: number, right: number) {
  const l = Math.max(0, Math.min(96, Number.isFinite(left) ? left : 8));
  const r = Math.max(l + 4, Math.min(100, Number.isFinite(right) ? right : 92));
  return { left: Number(l.toFixed(3)), right: Number(r.toFixed(3)) };
}

/** Exact PDF baseline in page coordinates, adjusted for browser font metrics. */
export function pdfBaselineTopPx(baselinePct: number, pageHeightPx: number, fontSizePx: number, cssFamily: string): number {
  if (typeof document === "undefined") return baselinePct / 100 * pageHeightPx - fontSizePx;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return baselinePct / 100 * pageHeightPx - fontSizePx;
  ctx.font = `${fontSizePx}px ${cssFamily}`;
  const m = ctx.measureText("Hgj");
  const asc = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || fontSizePx * .8;
  const desc = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || fontSizePx * .2;
  return baselinePct / 100 * pageHeightPx - (fontSizePx * 1.2 - asc - desc) / 2 - asc;
}
export type PdfMeasuredGlyph = { text: string; width: number };
/** Wraps at whitespace first, then safely breaks long words. No text is discarded. */
export function wrapPdfGlyphs<T extends PdfMeasuredGlyph>(glyphs: T[], maxWidth: number): T[][] {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) throw new Error("Invalid PDF text block width");
  const lines: T[][] = [[]];
  let width = 0;
  const newline = () => { lines.push([]); width = 0; };
  let index = 0;
  while (index < glyphs.length) {
    const current = glyphs[index];
    if (current.text === "\n" || current.text === "\r") {
      if (current.text === "\r" && glyphs[index + 1]?.text === "\n") index++;
      newline(); index++; continue;
    }
    const isSpace = /[ \t]/u.test(current.text);
    let end = index + 1;
    while (end < glyphs.length && glyphs[end].text !== "\n" &&
      glyphs[end].text !== "\r" && /[ \t]/u.test(glyphs[end].text) === isSpace) end++;
    const token = glyphs.slice(index, end);
    const tokenWidth = token.reduce((sum, ch) => sum + ch.width, 0);
    if (width > 0 && width + tokenWidth > maxWidth && !isSpace) newline();
    for (const glyph of token) {
      if (width + glyph.width > maxWidth && lines[lines.length - 1].length > 0) {
        newline();
        if (isSpace) continue;
      }
      // Keep spaces for faithful text round-tripping, including line breaks.
      lines[lines.length - 1].push(glyph);
      width += glyph.width;
    }
    index = end;
  }
  return lines;
}
