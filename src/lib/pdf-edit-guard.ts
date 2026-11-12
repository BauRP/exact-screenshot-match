import type { PdfTextOverlay } from "@/lib/notes-store";
import { getRuns } from "@/lib/pdf-runs";
/** A tap can never persist a white PDF mask: only user edits can do so. */
export function hasPdfDraftChanges(original:PdfTextOverlay,updated:PdfTextOverlay):boolean {
  if(!original.cover && !updated.text.trim()) return false;
  if(original.text!==updated.text) return true;
  if(original.xPct!==updated.xPct||original.yPct!==updated.yPct) return true;
  if(original.widthPct!==updated.widthPct||original.heightPct!==updated.heightPct) return true;
  return JSON.stringify(getRuns(original))!==JSON.stringify(getRuns(updated));
}
export function hasSaveablePdfContent(overlay:PdfTextOverlay):boolean {
  return overlay.cover || Boolean(overlay.text.trim());
}
