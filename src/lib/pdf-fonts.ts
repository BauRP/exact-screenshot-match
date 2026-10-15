/**
 * The strict font list available in the PDF inline text editor.
 *
 * `css` is what the on-canvas editable element uses, `base` selects the closest
 * PDF standard font family when the edited text is baked into the document.
 */
export type PdfFontOption = {
  /** Display name shown in the dropdown and stored on the overlay. */
  name: string;
  /** CSS font-family stack. */
  css: string;
  /** Standard PDF font family used on export. */
  base: "Helvetica" | "TimesRoman" | "Courier";
};

export const PDF_FONTS: PdfFontOption[] = [
  { name: "Amatic SC", css: "'Amatic SC', cursive", base: "Helvetica" },
  { name: "Arial", css: "Arial, Helvetica, sans-serif", base: "Helvetica" },
  { name: "Caveat", css: "'Caveat', cursive", base: "Helvetica" },
  { name: "Comfortaa", css: "'Comfortaa', cursive", base: "Helvetica" },
  { name: "Comic Sans MS", css: "'Comic Sans MS', 'Comic Sans', cursive", base: "Helvetica" },
  { name: "Courier New", css: "'Courier New', Courier, monospace", base: "Courier" },
  { name: "EB Garamond", css: "'EB Garamond', Garamond, serif", base: "TimesRoman" },
  { name: "Georgia", css: "Georgia, 'Times New Roman', serif", base: "TimesRoman" },
  { name: "Impact", css: "Impact, Haettenschweiler, sans-serif", base: "Helvetica" },
  { name: "Lexend", css: "'Lexend', sans-serif", base: "Helvetica" },
  { name: "Lobster", css: "'Lobster', cursive", base: "Helvetica" },
  { name: "Lora", css: "'Lora', serif", base: "TimesRoman" },
  { name: "Merriweather", css: "'Merriweather', serif", base: "TimesRoman" },
  { name: "Montserrat", css: "'Montserrat', sans-serif", base: "Helvetica" },
  { name: "Nunito", css: "'Nunito', sans-serif", base: "Helvetica" },
  { name: "Oswald", css: "'Oswald', sans-serif", base: "Helvetica" },
  { name: "Pacifico", css: "'Pacifico', cursive", base: "Helvetica" },
  { name: "Playfair Display", css: "'Playfair Display', serif", base: "TimesRoman" },
  { name: "Roboto", css: "'Roboto', sans-serif", base: "Helvetica" },
  { name: "Roboto Mono", css: "'Roboto Mono', monospace", base: "Courier" },
  { name: "Roboto Serif", css: "'Roboto Serif', serif", base: "TimesRoman" },
  { name: "Spectral", css: "'Spectral', serif", base: "TimesRoman" },
  { name: "Times New Roman", css: "'Times New Roman', Times, serif", base: "TimesRoman" },
  { name: "Trebuchet MS", css: "'Trebuchet MS', Tahoma, sans-serif", base: "Helvetica" },
  { name: "Verdana", css: "Verdana, Geneva, sans-serif", base: "Helvetica" },
];

export const DEFAULT_PDF_FONT = "Arial";
export const DEFAULT_PDF_FONT_SIZE = 11;
export const DEFAULT_PDF_TEXT_COLOR = "#000000";

export function fontCss(name: string | undefined): string {
  return PDF_FONTS.find((font) => font.name === name)?.css ?? PDF_FONTS[1].css;
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
