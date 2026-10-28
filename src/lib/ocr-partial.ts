import type { OcrNativeTextAlternative } from "./ocr-text";
import type { OcrScript } from "./ocr-merge";

export type OcrReviewReason = "recovery" | "ambiguous-han" | "mixed-layout" | "limited-selection" | "native-text" | "large-layout";

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
  text: string, reason: OcrReviewReason = "recovery",
): string {
  if (!text.trim()) throw new Error("OCR_EMPTY_TEXT");
  const warning = reason === "ambiguous-han"
    ? "⚠️ Китайский и японский текст могли быть распознаны неоднозначно. " +
      "Проверьте иероглифы и порядок строк.\n\n"
    : reason === "mixed-layout"
      ? "⚠️ Языки распознаны, но расположение строк на фотографии подтверждено не полностью. " +
        "Проверьте порядок абзацев и столбцов.\n\n"
      : reason === "limited-selection"
        ? "⚠️ Проверены только выбранные языки. Остальные языковые модели не запускались. " +
          "Проверьте текст и сохраните его только после подтверждения.\n\n"
        : reason === "native-text"
          ? "⚠️ Полный текст и отдельные строки распознавания содержат расхождения. " +
            "Проверьте символы и абзацы перед сохранением.\n\n"
          : reason === "large-layout"
            ? "⚠️ На фотографии слишком много распознанных строк для надёжного объединения. " +
              "Сохранены варианты текста из найденных языков. Проверьте повторы и порядок строк.\n\n"
      : "⚠️ Текст восстановлен несколькими проверками одной фотографии. " +
        "Проверьте порядок строк и исправьте возможные ошибки.\n\n";
  return warning + text;
}

export class OcrAmbiguousHanError extends Error {
  readonly recognizedText: string;
  readonly alternatives: OcrHanAlternatives | null;
  constructor(recognizedText: string, alternatives: OcrHanAlternatives | null = null) {
    super("OCR_HAN_LANGUAGE_AMBIGUITY");
    this.name = "OcrAmbiguousHanError";
    this.recognizedText = recognizedText;
    this.alternatives = alternatives;
  }
}

// Keep OCR warnings out of the user's editable text field, while ensuring
// that a review never silently promotes an incomplete scan to complete.
export function buildReviewedOcrText(
  editedText: string,
  missingScripts: readonly OcrScript[],
  reason: OcrReviewReason = "recovery",
): string {
  if (!editedText.trim()) throw new Error("OCR_EMPTY_TEXT");
  if (missingScripts.length) return markIncompleteOcrText(editedText, missingScripts);
  return markRecoveredOcrText(editedText, reason);
}


/** Preserve both conflicting readings for user review, not auto replacement. */
export type OcrHanAlternatives = { japanese: string; chinese: string };
export function hanAlternativesFromCandidates(
  candidates: readonly {script: OcrScript; text: string}[],
): OcrHanAlternatives | null {
  const japanese = candidates.filter(item => item.script === "japanese" && item.text.trim())
    .sort((a,b) => b.text.length - a.text.length)[0]?.text.trim();
  const chinese = candidates.filter(item => item.script === "chinese" && item.text.trim())
    .sort((a,b) => b.text.length - a.text.length)[0]?.text.trim();
  return japanese && chinese && japanese !== chinese ? {japanese,chinese} : null;
}

/** Tesseract sometimes supplies native line iteration but no total text. */
export function cyrillicTextWithLineFallback(
  data: {text?: string | null; lines?: readonly {text: string}[] | null},
): string {
  if (data.text?.trim()) return data.text;
  return (data.lines ?? []).map(line => line.text).filter(line => line.trim()).join("\n");
}


export class OcrMixedLayoutReviewError extends Error {
  readonly recognizedText: string;
  constructor(recognizedText: string) {
    super("OCR_MIXED_LAYOUT_REVIEW");
    this.name = "OcrMixedLayoutReviewError";
    this.recognizedText = recognizedText;
  }
}

/** Reopening a review must never discard the user's unsaved corrections. */
export function resumeOcrReviewDraft(
  scannedText: string, editedText: string, hasEdits: boolean,
): string {
  return hasEdits ? editedText : scannedText;
}


/** A custom scan of a subset is not verified against all installed languages.
 * Do not mislabel deliberately unselected languages as broken models.
 */
export class OcrLimitedSelectionReviewError extends Error {
  readonly recognizedText: string;
  constructor(text: string) {
    super("OCR_LIMITED_LANGUAGE_SELECTION");
    this.name = "OcrLimitedSelectionReviewError";
    this.recognizedText = text;
  }
}

/** The native recognizer returned conflicting glyphs in its two text views. */
export class OcrNativeTextReviewError extends Error {
  readonly recognizedText: string;
  readonly alternatives: readonly OcrNativeTextAlternative[];
  constructor(text: string, alternatives: readonly OcrNativeTextAlternative[] = []) {
    super("OCR_NATIVE_TEXT_CONFLICT");
    this.name = "OcrNativeTextReviewError";
    this.recognizedText = text;
    this.alternatives = alternatives;
  }
}


/** User edits take precedence over earlier raw OCR when recovering the same
 * photograph. Never mutate the input, its image URI, or missing-script state.
 * A blank edit is not valid as a recovery base.
 */
export function recoverFromReviewedText(
  previous: OcrRecoveryState,
  reviewedText: string,
  hasEdits: boolean,
): OcrRecoveryState {
  if (!hasEdits) return previous;
  if (!reviewedText.trim()) throw new Error("OCR_EMPTY_TEXT");
  return {...previous,text:reviewedText};
}


/** The full text is retained, but expensive geometry fusion was skipped.
 * The user can inspect and correct the separate original OCR readings.
 */
export class OcrLargeLayoutReviewError extends Error {
  readonly recognizedText: string;
  constructor(text: string) {
    super("OCR_LARGE_LAYOUT_REVIEW");
    this.name = "OcrLargeLayoutReviewError";
    this.recognizedText = text;
  }
}
