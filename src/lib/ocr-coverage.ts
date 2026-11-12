import type { OcrScript } from "./ocr-merge";

/**
 * A multilingual OCR result is COMPLETE only if every selected recognizer
 * finished without throwing. An empty OCR response is allowed: a photo may
 * contain no characters in that script. A thrown exception is different.
 *
 * Prevents automatically saving partial pages without telling the user.
 */
export class OcrScanCoverage {
  private readonly planned: Set<OcrScript>;
  private readonly completed = new Set<OcrScript>();
  private readonly failed = new Set<OcrScript>();
  constructor(plan: readonly OcrScript[]) {
    if (plan.length === 0 || new Set(plan).size !== plan.length) {
      throw new Error("Invalid OCR scan plan");
    }
    this.planned = new Set(plan);
  }
  markCompleted(script: OcrScript): void {
    if (!this.planned.has(script)) throw new Error("Unexpected OCR script");
    this.completed.add(script);
    this.failed.delete(script);
  }
  markFailed(script: OcrScript): void {
    if (!this.planned.has(script)) throw new Error("Unexpected OCR script");
    this.failed.add(script);
    this.completed.delete(script);
  }
  missingScripts(): OcrScript[] {
    return [...this.planned].filter(s => !this.completed.has(s) || this.failed.has(s));
  }
  isComplete(): boolean { return this.missingScripts().length === 0; }
  ensureComplete(): void {
    if (!this.isComplete()) {
      throw new Error("OCR_MODELS_INCOMPLETE");
    }
  }
}
