import type { OcrScript } from "./ocr-merge";
import { OCR_SCRIPT_LABELS, type OcrReviewReason } from "./ocr-partial";

/** Local, bounded and optional safety copy of UNSAVED OCR text. No image
 * content, file path, remote address or app permissions are stored.
 */
const KEY = "wave.ocr.pending-draft.v1";
const VERSION = 1;
const MAX_CHARS = 100_000;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const REASONS: readonly OcrReviewReason[] = ["recovery","ambiguous-han","mixed-layout"];
type Store = Pick<Storage,"getItem"|"setItem"|"removeItem">;
export type OcrLocalDraft = {
  text: string;
  reviewedText: string;
  edited: boolean;
  missingScripts: OcrScript[];
  reason: OcrReviewReason;
  savedAt: number;
};
function storage(): Store | null {
  try { return typeof window === "undefined" ? null : window.localStorage; }
  catch { return null; }
}
function known(value: unknown): value is OcrScript {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(OCR_SCRIPT_LABELS,value);
}

/** Storage being unavailable/full must never interrupt the running scanner. */
export function savePendingOcrDraft(
  data: Omit<OcrLocalDraft,"savedAt">,
  now = Date.now(), store: Store | null = storage(),
): boolean {
  if (!store || !Number.isFinite(now) || typeof data.text !== "string" ||
      !data.text.trim() || data.text.length > MAX_CHARS ||
      typeof data.reviewedText !== "string" || data.reviewedText.length > MAX_CHARS ||
      typeof data.edited !== "boolean" ||
      !REASONS.includes(data.reason) ||
      !Array.isArray(data.missingScripts) ||
      data.missingScripts.some(value => !known(value))) return false;
  try {
    store.setItem(KEY,JSON.stringify({version:VERSION,...data,
      missingScripts:[...new Set(data.missingScripts)],savedAt:now}));
    return true;
  } catch { return false; }
}
export function readPendingOcrDraft(
  now = Date.now(), store: Store | null = storage(),
): OcrLocalDraft | null {
  if (!store || !Number.isFinite(now)) return null;
  try {
    const raw=store.getItem(KEY);
    if (!raw || raw.length > MAX_CHARS * 2 + 4000) return null;
    const value: unknown=JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const v=value as Record<string,unknown>;
    if (v.version !== VERSION || typeof v.text !== "string" ||
        !v.text.trim() || v.text.length > MAX_CHARS ||
        typeof v.reviewedText !== "string" || v.reviewedText.length > MAX_CHARS ||
        typeof v.edited !== "boolean" ||
        typeof v.reason !== "string" || !REASONS.includes(v.reason as OcrReviewReason) ||
        !Array.isArray(v.missingScripts) || v.missingScripts.some(s => !known(s)) ||
        typeof v.savedAt !== "number" || !Number.isFinite(v.savedAt) ||
        v.savedAt > now + 60_000 || now-v.savedAt > MAX_AGE) return null;
    return {text:v.text,reviewedText:v.reviewedText,edited:v.edited,
      missingScripts:[...new Set(v.missingScripts as OcrScript[])],
      reason:v.reason as OcrReviewReason,savedAt:v.savedAt};
  } catch { return null; }
}
export function clearPendingOcrDraft(store: Store | null = storage()): void {
  try { store?.removeItem(KEY); } catch { /* Best-effort cleanup. */ }
}
