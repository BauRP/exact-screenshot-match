/**
 * The strict font list available in the PDF inline text editor.
 *
 * `css` is what the on-canvas editable element uses, `base` selects the closest
 * PDF standard font family when the edited text is baked into the document.
 */
import { APP_FONTS, sharedFontCss } from "@/lib/app-fonts";

export type PdfFontOption = (typeof APP_FONTS)[number];
/** Same names, same order, and same local font files as the note editor. */
export const PDF_FONTS: PdfFontOption[] = APP_FONTS;

export const DEFAULT_PDF_FONT = "Arial";
export const DEFAULT_PDF_FONT_SIZE = 11;
export const DEFAULT_PDF_TEXT_COLOR = "#000000";

export function fontCss(name: string | undefined): string {
  return sharedFontCss(name);
}

export function fontBase(name: string | undefined): PdfFontOption["base"] {
  return PDF_FONTS.find((font) => font.name === name)?.base ?? "Helvetica";
}

/** Maps a font option + weight/style flags onto a pdf-lib StandardFonts key. */
export function standardFontKey(
  name: string | undefined,
  bold: boolean,
  italic: boolean,
): string {
  const base = fontBase(name);
  if (base === "Courier") {
    if (bold && italic) return "CourierBoldOblique";
    if (bold) return "CourierBold";
    if (italic) return "CourierOblique";
    return "Courier";
  }
  if (base === "TimesRoman") {
    if (bold && italic) return "TimesRomanBoldItalic";
    if (bold) return "TimesRomanBold";
    if (italic) return "TimesRomanItalic";
    return "TimesRoman";
  }
  if (bold && italic) return "HelveticaBoldOblique";
  if (bold) return "HelveticaBold";
  if (italic) return "HelveticaOblique";
  return "Helvetica";
}

export function hexToRgb(hex: string | undefined): { r: number; g: number; b: number } {
  const value = (hex ?? DEFAULT_PDF_TEXT_COLOR).replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value.padEnd(6, "0");
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}
