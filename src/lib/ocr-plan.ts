import type { OcrScript } from "./ocr-merge";
export type OcrMode = OcrScript | "auto";
/**
 * Automatic detection must not defer Cyrillic until after every Asian model.
 * Each model still gets its own chance so mixed-language pages are supported.
 */
export function ocrScanPlan(mode: OcrMode): Array<OcrScript> {
  if (mode !== "auto") return [mode];
  return ["latin", "cyrillic", "japanese", "chinese", "korean", "devanagari"];
}
