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


/**
 * Manual retry is another reading of the SAME photograph, not a replacement
 * for text already recognized by a partially successful automatic scan.
 * Preserve the earlier text and append only lines absent from that result.
 * Spatial order between separate OCR passes is unknown: callers must keep
 * the combined result marked incomplete until the user reviews it.
 */
export function combineRecoveredOcrText(partial: string, recovered: string): string {
  const first = partial.replace(/\r\n?|\u2028|\u2029/gu, "\n").trim();
  const second = recovered.replace(/\r\n?|\u2028|\u2029/gu, "\n").trim();
  if (!first) return second;
  if (!second) return first;
  const comparable = (line: string) => line.normalize("NFKC")
    .replace(/\s+/gu, " ").trim().toLocaleLowerCase();
  const known = new Set(first.split("\n").map(comparable).filter(Boolean));
  const added: string[] = [];
  for (const line of second.split("\n")) {
    const key = comparable(line);
    if (!key || known.has(key)) continue;
    known.add(key);
    added.push(line.trimEnd());
  }
  return added.length ? first + "\n\n" + added.join("\n") : first;
}

// Retain recovered text on the same image until the user explicitly saves it.
// Successful retries only clear models which actually completed; failed ones
// remain listed. Never treat a timeout as successful language coverage.
export type OcrRecoveryState = {
  path: string;
  text: string;
  missingScripts: readonly OcrScript[];
};

export function applyRecoveredOcrPass(
  previous: OcrRecoveryState,
  attempted: readonly OcrScript[],
  recognized: string,
  failed: readonly OcrScript[] = [],
): OcrRecoveryState {
  if (!previous.path || !attempted.length ||
      attempted.some(script => !OCR_SCRIPT_LABELS[script]) ||
      failed.some(script => !attempted.includes(script))) {
    throw new Error("Invalid OCR recovery pass");
  }
  return {
    path: previous.path,
    text: combineRecoveredOcrText(previous.text, recognized),
    missingScripts: previous.missingScripts.filter(script =>
      !attempted.includes(script) || failed.includes(script)),
  };
}

/** Even when every retry succeeded, multi-pass text has unknown global order. */
export function markRecoveredOcrText(text: string): string {
  if (!text.trim()) throw new Error("OCR_EMPTY_TEXT");
  return "⚠️ Текст восстановлен несколькими проверками одной фотографии. " +
    "Проверьте порядок строк и исправьте возможные ошибки.\n\n" + text;
}
