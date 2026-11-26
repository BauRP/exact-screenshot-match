/** One offline font catalog shared by Wave Notes note editor and PDF editor.
 * Never pretend that proprietary Windows fonts can be bundled legally:
 * the named entries use explicitly compatible open-license alternatives.
 * The web fonts are packaged in the Android APK by src/styles.css.
 */
export type AppFont = {
  name: string;
  slug: string;
  actual: string;
  category: "sans" | "serif" | "mono" | "hand";
  css: string;
  base: "Helvetica" | "TimesRoman" | "Courier";
};
export const APP_FONTS: AppFont[] = [
  {name:"Roboto", slug:"roboto", actual:"Roboto", category:"sans", css:"'Roboto', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Inter", slug:"inter", actual:"Inter", category:"sans", css:"'Inter', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Montserrat", slug:"montserrat", actual:"Montserrat", category:"sans", css:"'Montserrat', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Open Sans", slug:"open-sans", actual:"Open Sans", category:"sans", css:"'Open Sans', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Ubuntu", slug:"ubuntu", actual:"Ubuntu", category:"sans", css:"'Ubuntu', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"PT Sans", slug:"pt-sans", actual:"PT Sans", category:"sans", css:"'PT Sans', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Playfair Display", slug:"playfair-display", actual:"Playfair Display", category:"serif", css:"'Playfair Display', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"Merriweather", slug:"merriweather", actual:"Merriweather", category:"serif", css:"'Merriweather', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"Lora", slug:"lora", actual:"Lora", category:"serif", css:"'Lora', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"Nunito", slug:"nunito", actual:"Nunito", category:"sans", css:"'Nunito', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Raleway", slug:"raleway", actual:"Raleway", category:"sans", css:"'Raleway', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Fira Sans", slug:"fira-sans", actual:"Fira Sans", category:"sans", css:"'Fira Sans', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Rubik", slug:"rubik", actual:"Rubik", category:"sans", css:"'Rubik', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Work Sans", slug:"work-sans", actual:"Work Sans", category:"sans", css:"'Work Sans', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Manrope", slug:"manrope", actual:"Manrope", category:"sans", css:"'Manrope', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Caveat", slug:"caveat", actual:"Caveat", category:"hand", css:"'Caveat', 'Noto Sans', cursive", base:"Helvetica"},
  {name:"Comfortaa", slug:"comfortaa", actual:"Comfortaa", category:"sans", css:"'Comfortaa', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Oswald", slug:"oswald", actual:"Oswald", category:"sans", css:"'Oswald', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Source Sans 3", slug:"source-sans-3", actual:"Source Sans 3", category:"sans", css:"'Source Sans 3', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Noto Sans", slug:"noto-sans", actual:"Noto Sans", category:"sans", css:"'Noto Sans', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Amatic SC", slug:"amatic-sc", actual:"Amatic SC", category:"hand", css:"'Amatic SC', 'Noto Sans', cursive", base:"Helvetica"},
  {name:"Arial", slug:"arimo", actual:"Arimo", category:"sans", css:"'Arimo', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Comic Sans MS", slug:"comic-neue", actual:"Comic Neue", category:"hand", css:"'Comic Neue', 'Noto Sans', cursive", base:"Helvetica"},
  {name:"Courier New", slug:"cousine", actual:"Cousine", category:"mono", css:"'Cousine', 'Noto Sans Mono', monospace", base:"Courier"},
  {name:"EB Garamond", slug:"eb-garamond", actual:"EB Garamond", category:"serif", css:"'EB Garamond', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"Georgia", slug:"noto-serif", actual:"Noto Serif", category:"serif", css:"'Noto Serif', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"Impact", slug:"oswald", actual:"Oswald", category:"sans", css:"'Oswald', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Lexend", slug:"lexend", actual:"Lexend", category:"sans", css:"'Lexend', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Lobster", slug:"lobster", actual:"Lobster", category:"hand", css:"'Lobster', 'Noto Sans', cursive", base:"Helvetica"},
  {name:"Pacifico", slug:"pacifico", actual:"Pacifico", category:"hand", css:"'Pacifico', 'Noto Sans', cursive", base:"Helvetica"},
  {name:"Roboto Mono", slug:"roboto-mono", actual:"Roboto Mono", category:"mono", css:"'Roboto Mono', 'Noto Sans Mono', monospace", base:"Courier"},
  {name:"Roboto Serif", slug:"roboto-serif", actual:"Roboto Serif", category:"serif", css:"'Roboto Serif', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"Spectral", slug:"spectral", actual:"Spectral", category:"serif", css:"'Spectral', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"Times New Roman", slug:"tinos", actual:"Tinos", category:"serif", css:"'Tinos', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"Trebuchet MS", slug:"rubik", actual:"Rubik", category:"sans", css:"'Rubik', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Verdana", slug:"noto-sans", actual:"Noto Sans", category:"sans", css:"'Noto Sans', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"PT Serif", slug:"pt-serif", actual:"PT Serif", category:"serif", css:"'PT Serif', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"IBM Plex Sans", slug:"ibm-plex-sans", actual:"IBM Plex Sans", category:"sans", css:"'IBM Plex Sans', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"IBM Plex Serif", slug:"ibm-plex-serif", actual:"IBM Plex Serif", category:"serif", css:"'IBM Plex Serif', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"Ubuntu Mono", slug:"ubuntu-mono", actual:"Ubuntu Mono", category:"mono", css:"'Ubuntu Mono', 'Noto Sans Mono', monospace", base:"Courier"},
  {name:"Roboto Slab", slug:"roboto-slab", actual:"Roboto Slab", category:"serif", css:"'Roboto Slab', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"Noto Serif", slug:"noto-serif", actual:"Noto Serif", category:"serif", css:"'Noto Serif', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"Arimo", slug:"arimo", actual:"Arimo", category:"sans", css:"'Arimo', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Tinos", slug:"tinos", actual:"Tinos", category:"serif", css:"'Tinos', 'Noto Serif', Georgia, serif", base:"TimesRoman"},
  {name:"Cousine", slug:"cousine", actual:"Cousine", category:"mono", css:"'Cousine', 'Noto Sans Mono', monospace", base:"Courier"},
  {name:"Mulish", slug:"mulish", actual:"Mulish", category:"sans", css:"'Mulish', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Exo 2", slug:"exo-2", actual:"Exo 2", category:"sans", css:"'Exo 2', 'Noto Sans', sans-serif", base:"Helvetica"},
  {name:"Fira Mono", slug:"fira-mono", actual:"Fira Mono", category:"mono", css:"'Fira Mono', 'Noto Sans Mono', monospace", base:"Courier"},
];
export const FONT_BY_NAME = new Map(APP_FONTS.map(font => [font.name, font]));
export function sharedFontCss(name?: string) {
  return FONT_BY_NAME.get(name ?? "")?.css ?? FONT_BY_NAME.get("Roboto")!.css;
}
export function actualFontFamily(name?: string) {
  return FONT_BY_NAME.get(name ?? "")?.actual ?? "Roboto";
}
export const SYSTEM_FONT_SUBSTITUTIONS: Record<string, string> = {
  "Arial": "Arimo",
  "Comic Sans MS": "Comic Neue",
  "Courier New": "Cousine",
  "Georgia": "Noto Serif",
  "Impact": "Oswald",
  "Times New Roman": "Tinos",
  "Trebuchet MS": "Rubik",
  "Verdana": "Noto Sans"
};
export function fontNameFromCss(css: string): string | undefined {
  return APP_FONTS.find(f => f.css === css || css.startsWith(`"${f.name}"`) ||
    css.startsWith(`'${f.name}'`) || css.startsWith(`"${f.actual}"`))?.name;
}
