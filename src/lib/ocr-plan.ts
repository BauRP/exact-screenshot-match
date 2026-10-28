import type { OcrScript } from "./ocr-merge";
export type OcrMode = OcrScript | "auto" | "russian" | "kazakh";
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
  if (request === "russian" || request === "kazakh") return ["cyrillic"];
  if (!AUTO_SCAN_ORDER.includes(request)) throw new Error("Invalid OCR scan plan");
  return [request];
}

/**
 * Prioritize unmistakable Unicode script evidence in already recognized
 * local text, but never drop an OCR model from the scan plan.
 * Han alone cannot reliably distinguish Chinese from Japanese.
 */
export function prioritizeRemainingOcrScripts(
  remaining: readonly OcrScript[], recognized: string,
): OcrScript[] {
  const text = recognized.slice(0, 12000);
  const kana = (text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  const korean = (text.match(/\p{Script=Hangul}/gu) ?? []).length;
  const devanagari = (text.match(/\p{Script=Devanagari}/gu) ?? []).length;
  const evidence: Partial<Record<OcrScript,number>> = {
    japanese: kana, korean, devanagari,
  };
  return remaining.map((script,index) => ({script,index,score:evidence[script] ?? 0}))
    .sort((a,b) => b.score - a.score || a.index - b.index)
    .map(item => item.script);
}

/** Manual native language selection, still exclusively from APK-bundled models.
 * Recovering an automatic failure uses both languages by default.
 */
export function cyrillicLanguageForScan(request: OcrScanRequest): "rus" | "kaz" | typeof CYRILLIC_OCR_LANGUAGES {
  return request === "russian" ? "rus" :
    request === "kazakh" ? "kaz" : CYRILLIC_OCR_LANGUAGES;
}
