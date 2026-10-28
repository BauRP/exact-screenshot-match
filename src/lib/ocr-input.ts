/**
 * Capacitor Camera supplies local filesystem paths, file:// URIs or
 * content:// URIs for images. Never forward remote URLs to native OCR.
 * A webPath is meant for WebView display and cannot substitute for a
 * local provider URI.
 */
export function isLocalOcrImagePath(path: unknown): path is string {
  if (typeof path !== "string" || !path || path.trim() !== path ||
      /[\u0000-\u001f]/u.test(path)) return false;
  if (path.startsWith("/")) return path.length > 1 && !path.startsWith("//");
  if (/^content:\/\//i.test(path)) return path.length > "content://".length &&
    !/^[^:]+:\/\/\/+/u.test(path);
  if (/^file:\/\//i.test(path)) {
    return /^file:\/\/\/[^/?#][^?#]*$/i.test(path);
  }
  return false;
}

export function chooseLocalOcrImagePath(photo: { path?: string | null; webPath?: string | null }): string {
  if (isLocalOcrImagePath(photo.path)) return photo.path;
  if (isLocalOcrImagePath(photo.webPath)) return photo.webPath;
  throw new Error("Selected image has no readable local path.");
}
