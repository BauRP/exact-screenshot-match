import type { OcrScript } from "./ocr-merge";
export type OcrMode = OcrScript | "auto";
export type OcrScanRequest = OcrMode | readonly OcrScript[];

// Every bundled recognizer remains available. A recovery pass can target only
// models that failed without discarding completed results from the first pass.
const AUTO_SCAN_ORDER: readonly OcrScript[] = ["latin", "cyrillic", "japanese", "chinese", "korean", "devanagari"];
// Keep the validated, pinned Russian/Kazakh ordering.
export const CYRILLIC_OCR_LANGUAGES = "kaz+rus" as const;

/** Never silently scan an unknown model or accept an empty recovery plan. */
export function ocrScanPlan(request: OcrScanRequest): OcrScript[] {
  if (typeof request !== "string") {
    const scripts = [...request];
    if (!scripts.length || new Set(scripts).size !== scripts.length ||
        scripts.some(script => !AUTO_SCAN_ORDER.includes(script))) {
      throw new Error("Invalid OCR scan plan");
    }
    return scripts;
  }
  if (request === "auto") return [...AUTO_SCAN_ORDER];
  if (!AUTO_SCAN_ORDER.includes(request)) throw new Error("Invalid OCR scan plan");
  return [request];
}
