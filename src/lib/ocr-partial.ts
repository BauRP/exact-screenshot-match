import type { OcrScript } from "./ocr-merge";
export class OcrIncompleteScanError extends Error {
  readonly partialText: string;
  readonly missingScripts: readonly OcrScript[];
  constructor(partialText: string, missingScripts: readonly OcrScript[]) {
    super("OCR_INCOMPLETE_WITH_TEXT");
    this.name = "OcrIncompleteScanError";
    this.partialText = partialText;
    this.missingScripts = [...missingScripts];
  }
}
export function markIncompleteOcrText(text: string): string {
  if (!text.trim()) throw new Error("OCR_EMPTY_TEXT");
  return "⚠️ Неполное распознавание. Некоторые языки могли быть пропущены.\n\n" + text;
}
