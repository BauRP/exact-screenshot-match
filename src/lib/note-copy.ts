import type {PdfMeta} from "./notes-store";

/** Deep-copy all current PDF overlay and per-character run objects.
 * No structuredClone: Android 7–11 WebViews may not implement it.
 * The original PDF metadata is never mutated by editing a copied note. */
export function copyPdfMetadata(meta:PdfMeta|undefined):PdfMeta|undefined{
 if(!meta)return undefined;
 return {...meta,overlays:meta.overlays?.map(overlay=>({
  ...overlay,runs:overlay.runs?.map(run=>({...run}))
 }))};
}
