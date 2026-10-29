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

/**
 * Word-like wrapping without deleting characters. An optional measurement
 * callback takes account of kerning inside a complete font run, instead of
 * summing individual glyph advances (which is not always equivalent).
 * Reject a glyph that cannot fit even on an empty line before mutating PDF.
 */
export function wrapPdfGlyphs<T extends PdfMeasuredGlyph>(
  glyphs: T[],
  maxWidth: number,
  measure: (items: T[]) => number = items => items.reduce((sum, item) => sum + item.width, 0),
): T[][] {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0)
    throw new Error("Неверная ширина текстового блока PDF.");
  const lines: T[][] = [[]];
  let line = lines[0];
  const nextLine = () => { line = []; lines.push(line); };
  const fits = (items: T[]) => measure(items) <= maxWidth + 0.001;

  for (let i = 0; i < glyphs.length;) {
    if (glyphs[i].text === "\n" || glyphs[i].text === "\r") {
      if (glyphs[i].text === "\r" && glyphs[i + 1]?.text === "\n") i++;
      nextLine();
      i++;
      continue;
    }
    const whitespace = /^[ \t]$/u.test(glyphs[i].text);
    let end = i + 1;
    while (end < glyphs.length && glyphs[end].text !== "\n" &&
      glyphs[end].text !== "\r" && /^[ \t]$/u.test(glyphs[end].text) === whitespace) end++;
    const token = glyphs.slice(i, end);
    if (!fits([...line, ...token]) && line.length && !whitespace) nextLine();
    if (fits([...line, ...token])) {
      line.push(...token);
    } else {
      // Very long tokens and whitespace at boundaries are wrapped character
      // by character, but never silently discarded or replaced with spaces.
      for (const glyph of token) {
        if (!fits([glyph])) throw new Error("Один символ шире установленной текстовой области PDF.");
        if (line.length && !fits([...line, glyph])) nextLine();
        line.push(glyph);
      }
    }
    i = end;
  }
  return lines;
}
