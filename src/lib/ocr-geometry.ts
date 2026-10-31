import { OCR_SPATIAL_LINE_LIMIT, type OcrLine, type OcrScript } from "./ocr-merge";

export type MlKitRect = { left: number; top: number; right: number; bottom: number };
export type MlKitPoint = { x: number; y: number };
export type MlKitLine = { text: string; boundingBox?: MlKitRect; cornerPoints?: MlKitPoint[]; recognizedLanguage?: string };
export type MlKitResult = { blocks?: Array<{ lines?: MlKitLine[] }> };

/**
 * ML Kit 8.2 uses pixel-based boundingBox on each text line.
 * Tesseract supplies 0..1 normalized lines; use a common coordinate space.
 * Malformed rectangles must never corrupt the combined result.
 */
export type BoundedOcrGeometry = { lines: OcrLine[]; truncated: boolean };
/** Bound geometry BEFORE it reaches the cross-model quadratic overlap matcher.
 * Preserve complete recognized text in the OCR result separately. Only valid
 * rectangles consume the shared 350-line budget; the next valid line marks
 * a review-required truncated layout.
 */
export function linesFromMlKitBounded(
  data: MlKitResult, script: OcrScript, imageWidth: number, imageHeight: number,
): BoundedOcrGeometry {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) ||
      imageWidth <= 0 || imageHeight <= 0) return {lines:[],truncated:false};
  const lines: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const line of block.lines ?? []) {
      // ML Kit may supply only corner points for rotated lines; use their
      // measured envelope, not fabricated geometry or a blank line.
      const points = line.cornerPoints;
      const validPoints = points?.length === 4 &&
        points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y));
      const box = line.boundingBox ?? (validPoints ? {
        left: Math.min(...points!.map(point => point.x)),
        top: Math.min(...points!.map(point => point.y)),
        right: Math.max(...points!.map(point => point.x)),
        bottom: Math.max(...points!.map(point => point.y)),
      } : undefined);
      if (!box || !line.text?.trim()) continue;
      const { left, top, right, bottom } = box;
      if (![left, top, right, bottom].every(Number.isFinite) ||
          right <= left || bottom <= top) continue;
      const x1 = Math.max(0, Math.min(1, left / imageWidth));
      const x2 = Math.max(0, Math.min(1, right / imageWidth));
      const y1 = Math.max(0, Math.min(1, top / imageHeight));
      const y2 = Math.max(0, Math.min(1, bottom / imageHeight));
      if (x2 <= x1 || y2 <= y1) continue;
      // Some camera/gallery providers yield boxes far outside the actual
      // decoded image. Do not clamp those to misleading edge labels.
      if (right <= 0 || bottom <= 0 || left >= imageWidth || top >= imageHeight) continue;
      if (lines.length >= OCR_SPATIAL_LINE_LIMIT) return {lines,truncated:true};
      lines.push({ text: line.text, left: x1, top: y1, right: x2, bottom: y2,
        script, language: line.recognizedLanguage });
    }
  }
  return {lines,truncated:false};
}

/** Existing callers that only need located lines use the same bounded path. */
export function linesFromMlKit(
  data: MlKitResult, script: OcrScript, imageWidth: number, imageHeight: number,
): OcrLine[] {
  return linesFromMlKitBounded(data,script,imageWidth,imageHeight).lines;
}


/** Native line language tags can still help schedule the remaining offline
 * models even if coordinates are missing/invalid. Limit inspected metadata
 * so a malformed huge document cannot create an unbounded extra loop.
 */
export function mlKitReportedLanguages(data: MlKitResult): string[] {
  const reported = new Set<string>();
  for (const block of (data.blocks ?? []).slice(0,64)) {
    for (const line of (block.lines ?? []).slice(0,128)) {
      const value=line.recognizedLanguage;
      if (typeof value !== "string" || value.length > 32) continue;
      const tag=value.trim().toLowerCase();
      if (tag && tag !== "und" && tag !== "unknown") reported.add(tag);
      if (reported.size >= 16) return [...reported];
    }
  }
  return [...reported];
}
