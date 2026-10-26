import type { OcrLine, OcrScript } from "./ocr-merge";

export type MlKitRect = { left: number; top: number; right: number; bottom: number };
export type MlKitLine = { text: string; boundingBox?: MlKitRect; recognizedLanguage?: string };
export type MlKitResult = { blocks?: Array<{ lines?: MlKitLine[] }> };

/**
 * ML Kit 8.2 uses pixel-based boundingBox on each text line.
 * Tesseract supplies 0..1 normalized lines; use a common coordinate space.
 * Malformed rectangles must never corrupt the combined result.
 */
export function linesFromMlKit(
  data: MlKitResult, script: OcrScript, imageWidth: number, imageHeight: number,
): OcrLine[] {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) ||
      imageWidth <= 0 || imageHeight <= 0) return [];
  const lines: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const line of block.lines ?? []) {
      const box = line.boundingBox;
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
      lines.push({ text: line.text, left: x1, top: y1, right: x2, bottom: y2,
        script, language: line.recognizedLanguage });
    }
  }
  return lines;
}
