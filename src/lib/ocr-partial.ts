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
  const normalizeLines = (value: string) => value
    .replace(/\r\n?|\u2028|\u2029/gu, "\n").replace(/^\n+|\n+$/gu, "");
  const first = normalizeLines(partial);
  const second = normalizeLines(recovered);
  if (!first.trim()) return second;
  if (!second.trim()) return first;

  // Compare lines without altering the actual document. NFC keeps Chinese /
  // Japanese compatibility glyphs distinct; whitespace and case differences
  // are tolerated only for duplicate detection.
  const comparable = (line: string) => line.normalize("NFC")
    .replace(/\s+/gu, " ").trim().toLocaleLowerCase();
  const counts = (text: string) => {
    const result = new Map<string, number>();
    for (const line of text.split("\n")) {
      const key = comparable(line);
      if (key) result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  };
  const previouslySeen = counts(first);
  const recoveredSeen = new Map<string, number>();
  const added: string[] = [];
  for (const line of second.split("\n")) {
    const key = comparable(line);
    if (!key) continue;
    const occurrence = (recoveredSeen.get(key) ?? 0) + 1;
    recoveredSeen.set(key, occurrence);
    // Never eliminate legitimate repeated labels, prices or paragraphs.
    // Only suppress as many copies as the earlier OCR pass already contains.
    if (occurrence > (previouslySeen.get(key) ?? 0)) added.push(line);
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
      new Set(attempted).size !== attempted.length ||
      new Set(failed).size !== failed.length ||
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
export function markRecoveredOcrText(
  text: string, reason: "recovery" | "ambiguous-han" = "recovery",
): string {
  if (!text.trim()) throw new Error("OCR_EMPTY_TEXT");
  const warning = reason === "ambiguous-han"
    ? "⚠️ Китайский и японский текст могли быть распознаны неоднозначно. " +
      "Проверьте иероглифы и порядок строк.\n\n"
    : "⚠️ Текст восстановлен несколькими проверками одной фотографии. " +
      "Проверьте порядок строк и исправьте возможные ошибки.\n\n";
  return warning + text;
}

export class OcrAmbiguousHanError extends Error {
  readonly recognizedText: string;
  constructor(recognizedText: string) {
    super("OCR_HAN_LANGUAGE_AMBIGUITY");
    this.name = "OcrAmbiguousHanError";
    this.recognizedText = recognizedText;
  }
}
