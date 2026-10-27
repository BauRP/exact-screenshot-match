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

/** Limits the UI wait; it does NOT cancel an already running native operation.
 * Callers must keep their native session locked until the underlying task settles.
 */
export async function withOcrDeadline<T>(task: Promise<T>, milliseconds: number): Promise<T> {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new Error("Invalid OCR limit");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("OCR timed out")), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}


/**
 * Check the total remaining scan budget BEFORE starting a native recognizer.
 * A rejected deadline must not spawn invisible work or hold the camera session.
 * Native work already started is tracked until its real promise settles.
 */
export function startOcrWithinBudget<T>(
  budget: OcrTimeBudget,
  perModelLimit: number,
  start: () => Promise<T>,
  track: (task: Promise<unknown>) => void,
): Promise<T> {
  const remaining = budget.remaining(perModelLimit);
  const task = start();
  track(task);
  return withOcrDeadline(task, remaining);
}
