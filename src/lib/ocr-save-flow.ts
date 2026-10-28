import { buildOcrNoteDraft, type OcrNoteDraft } from "./ocr-note";

/** A successful storage write must never be reported as an OCR failure.
 * If the editor route fails AFTER saving, tell the user the note is safe.
 */
export class OcrEditorNavigationError extends Error {
  readonly savedNoteId: string;
  constructor(savedNoteId: string) {
    super("OCR_NOTE_SAVED_EDITOR_NOT_OPENED");
    this.name = "OcrEditorNavigationError";
    this.savedNoteId = savedNoteId;
  }
}

/** Called only after recognition has finished and the user has not cancelled.
 * In production the real notes-store persists before returning from createNote.
 * openEditor can be sync or async (TanStack router returns a promise).
 */
export async function saveOcrNoteAndOpenEditor(
  recognizedText: string,
  fallbackTitle: string,
  create: (draft: OcrNoteDraft) => { id: string },
  openEditor: (noteId: string) => void | Promise<unknown>,
): Promise<string> {
  const draft = buildOcrNoteDraft(recognizedText, fallbackTitle);
  const saved = create(draft);
  if (!saved?.id) throw new Error("OCR_NOTE_SAVE_FAILED");
  try {
    await openEditor(saved.id);
  } catch {
    // No rollback: this exact note was already saved. Re-running OCR would
    // duplicate it. Show the existing list instead of inventing a data loss.
    throw new OcrEditorNavigationError(saved.id);
  }
  return saved.id;
}
