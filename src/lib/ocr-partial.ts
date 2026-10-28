import type { OcrScript } from "./ocr-merge";

export const OCR_SCRIPT_LABELS: Readonly<Record<OcrScript, string>> = {
  latin: "Латиница",
  cyrillic: "Русский и казахский",
  chinese: "Китайский",
  japanese: "Японский",
  korean: "Корейский",
  devanagari: "Деванагари",
};

export class OcrIncompleteScanError extends Error {
  readonly partialText: string;
  readonly missingScripts: readonly OcrScript[];
  constructor(partialText: string, missingScripts: readonly OcrScript[]) {
    super("OCR_INCOMPLETE_WITH_TEXT");
    this.name = "OcrIncompleteScanError";
    this.partialText = partialText;
    this.missingScripts = [...new Set(missingScripts)];
  }
}
export function markIncompleteOcrText(
  text: string,
  missingScripts: readonly OcrScript[] = [],
): string {
  if (!text.trim()) throw new Error("OCR_EMPTY_TEXT");
  const missing = [...new Set(missingScripts)].map(s => OCR_SCRIPT_LABELS[s]).join(", ");
  const reason = missing ? "Не завершены проверки: " + missing + ".\n\n" : "";
  return "⚠️ Неполное распознавание. Некоторые языки могли быть пропущены.\n\n" +
    reason + text;
}
