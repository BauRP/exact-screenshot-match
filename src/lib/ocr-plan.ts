import type { OcrScript } from "./ocr-merge";
export type OcrMode = OcrScript | "auto";
// Pinned Russian/Kazakh models behave better on mixed Cyrillic when Kazakh is first.
// This changes recognition priority, not which models are packaged in the APK.
export const CYRILLIC_OCR_LANGUAGES = "kaz+rus" as const;
/**
 * Automatic detection must not defer Cyrillic until after every Asian model.
 * Each model still gets its own chance so mixed-language pages are supported.
 */
export function ocrScanPlan(mode: OcrMode): Array<OcrScript> {
  if (mode !== "auto") return [mode];
  return ["latin", "cyrillic", "japanese", "chinese", "korean", "devanagari"];
}
