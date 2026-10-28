import type { OcrNativeTextAlternative } from "./ocr-text";
import type { OcrScript } from "./ocr-merge";
import { OCR_SCRIPT_LABELS, type OcrReviewReason } from "./ocr-partial";

/** Local, bounded and optional safety copy of UNSAVED OCR text. No image
 * content, file path, remote address or app permissions are stored.
 */
const KEY = "wave.ocr.pending-draft.v1";
const VERSION = 1;
const MAX_CHARS = 100_000;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
// Both 100k-character text fields plus up to six pairs of 2k-char
// native alternatives. JSON escaping can expand strings significantly.
const MAX_SERIALIZED_DRAFT_CHARS = 6 * MAX_CHARS + 32_000;
const REASONS: readonly OcrReviewReason[] = ["recovery","ambiguous-han","mixed-layout","limited-selection","native-text","large-layout"];
type Store = Pick<Storage,"getItem"|"setItem"|"removeItem">;
export type OcrLocalDraft = {
  text: string;
  reviewedText: string;
  edited: boolean;
  missingScripts: OcrScript[];
  reason: OcrReviewReason;
  savedAt: number;
  nativeAlternatives?: OcrNativeTextAlternative[];
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
  if (data.nativeAlternatives !== undefined && (
      !Array.isArray(data.nativeAlternatives) || data.nativeAlternatives.length > 6 ||
      data.nativeAlternatives.some(item => !item || !known(item.script) ||
        typeof item.complete !== "string" || typeof item.lines !== "string" ||
        Array.from(item.complete).length > 2000 || Array.from(item.lines).length > 2000)
  )) return false;
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
    if (!raw || raw.length > MAX_SERIALIZED_DRAFT_CHARS) return null;
    const value: unknown=JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const v=value as Record<string,unknown>;
    if (v.nativeAlternatives !== undefined && (
      !Array.isArray(v.nativeAlternatives) || v.nativeAlternatives.length > 6 ||
      v.nativeAlternatives.some((item: unknown) => {
        if (!item || typeof item !== "object") return true;
        const alt = item as Record<string, unknown>;
        return !known(alt.script) || typeof alt.complete !== "string" ||
          typeof alt.lines !== "string" ||
          Array.from(alt.complete).length > 2000 ||
          Array.from(alt.lines).length > 2000;
      })
    )) return null;
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
      reason:v.reason as OcrReviewReason,savedAt:v.savedAt,
      nativeAlternatives:v.nativeAlternatives as OcrNativeTextAlternative[] | undefined};
  } catch { return null; }
}
export function clearPendingOcrDraft(store: Store | null = storage()): void {
  try { store?.removeItem(KEY); } catch { /* Best-effort cleanup. */ }
}


/** A picker cancellation or failed scan must not erase unsaved text. */
export function shouldClearPendingDraft(action:
  "picker-open" | "picker-cancel" | "scan-failed" | "note-saved" | "discard"): boolean {
  return action === "note-saved" || action === "discard";
}


/** Delayed WebView draft writes cannot resurrect an already saved or
 * explicitly discarded draft. A new result must explicitly arm the gate.
 */
export class OcrDraftWriteGate {
  private active = false;
  private generation = 0;
  arm(): number {
    // Every new OCR result is a new logical draft. Even if an old timer
    // runs after disarm()+arm(), its original generation is obsolete.
    this.active = true;
    return ++this.generation;
  }
  disarm(): void { this.active = false; ++this.generation; }
  get canWrite(): boolean { return this.active; }
  get token(): number { return this.generation; }
  canWriteToken(token: number): boolean {
    return this.active && this.generation === token;
  }
}
