/**
 * Prevent six offline recognizers from taking unbounded time on slower phones.
 * Time begins after the native photo preparation step; both are independently
 * limited. An expired scan must not be mistaken for a complete document.
 */
export class OcrTimeBudget {
  private readonly deadline: number;
  constructor(milliseconds: number, start: number = Date.now()) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0 || !Number.isFinite(start)) {
      throw new Error("Invalid OCR budget");
    }
    this.deadline = start + milliseconds;
  }

  remaining(perModelLimit: number, now: number = Date.now()): number {
    if (!Number.isFinite(perModelLimit) || perModelLimit <= 0) throw new Error("Invalid OCR limit");
    const available = Math.floor(this.deadline - now);
    if (available <= 0) throw new Error("OCR timed out");
    return Math.min(perModelLimit, available);
  }
}
