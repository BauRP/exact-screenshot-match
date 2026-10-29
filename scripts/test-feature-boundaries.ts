import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { saveOcrNoteAndOpenEditor } from "../src/lib/ocr-save-flow";

/**
 * Functional boundary regression for Wave Notes.
 *
 * Camera/gallery OCR => normal TipTap text note, never a PDF.
 * PDF import => distinct PDF record; manual edits update only its overlays.
 * No camera device or PDF rendering is simulated by this test.
 */
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem(key: string): string | null { return storage.get(key) ?? null; },
      setItem(key: string, value: string): void { storage.set(key, value); },
    },
  },
});

const { createNote, getNote, updateNote, exportNotes } =
  await import("../src/lib/notes-store");

const opened: string[] = [];
const scans = [
  { source: "camera", text: "Қазақ тілі\\nРусский текст\\nЦена < 3500" },
  { source: "gallery", text: "日本語 中文\\n한국어 हिन्दी\\nA & B" },
];
const ocrIds: string[] = [];

for (const scan of scans) {
  const id = await saveOcrNoteAndOpenEditor(
    scan.text, scan.source, createNote,
    (noteId) => {
      // Must exist on disk before the user is taken to the note editor.
      const current = JSON.parse(storage.get("sn.notes.v1") ?? "[]");
      assert.ok(current.some((note: {id: string}) => note.id === noteId));
      opened.push(noteId);
    },
  );
  ocrIds.push(id);
  const note = getNote(id);
  assert.ok(note, "OCR result missing from local notes database");
  assert.equal(note.kind, "note", "OCR must never create a PDF entry");
  assert.equal(note.pdf, undefined, "OCR must not attach PDF metadata");
  assert.ok(note.body.includes("<p>"), "OCR should create editor paragraphs");
  assert.ok(note.body.includes("&lt;") || note.body.includes("&amp;"));
}
assert.deepEqual(opened, ocrIds);
assert.equal(ocrIds.length, 2);

// PDF is imported as its own record, and text changes are manually written
// by the PDF editor through the existing updateNote/persistOverlays path.
const pdfId = "manual-pdf-contract";
createNote({
  id: pdfId,
  kind: "pdf",
  title: "Договор",
  body: "",
  pdf: { fileName: "dogovor.pdf", size: 4096, pageCount: 2, overlays: [] },
});
const edit = {
  id: "pdf-manual-text-1",
  page: 1,
  xPct: 15, yPct: 22, widthPct: 40, heightPct: 8,
  text: "Текст, введённый вручную",
  cover: false,
  fontSize: 14,
  fontFamily: "Arial",
};
const savedPdf = getNote(pdfId);
assert.ok(savedPdf?.pdf);
updateNote(pdfId, {
  pdf: { ...savedPdf.pdf, overlays: [edit] },
});
assert.equal(getNote(pdfId)?.pdf?.overlays?.[0]?.text, edit.text);
assert.equal(getNote(pdfId)?.kind, "pdf");
for (const id of ocrIds) {
  assert.equal(getNote(id)?.kind, "note");
  assert.equal(getNote(id)?.pdf, undefined);
}
const serialized = JSON.parse(exportNotes()) as {
  notes: Array<{id: string; kind: string; pdf?: {overlays?: Array<{text: string}>}}>;
};
assert.equal(serialized.notes.length, 3);
assert.equal(serialized.notes.find((item) => item.id === pdfId)?.pdf?.overlays?.[0]?.text, edit.text);

// Verify UI routes preserve the separation, not just their storage helpers.
const cameraRoute = await readFile("src/routes/camera.tsx", "utf8");
const pdfRoute = await readFile("src/routes/pdf.$id.tsx", "utf8");
const homeRoute = await readFile("src/routes/index.tsx", "utf8");
assert.match(cameraRoute, /saveOcrNoteAndOpenEditor/);
assert.ok(cameraRoute.includes('to: "/editor/$id"'));
assert.ok(!cameraRoute.includes('to: "/pdf/$id"'),
  "Camera/gallery OCR must not route to the PDF editor");
assert.ok(!pdfRoute.includes("saveOcrNoteAndOpenEditor"));
assert.ok(pdfRoute.includes("persistOverlays"));
assert.ok(homeRoute.includes('kind: "pdf"'));
assert.ok(homeRoute.includes("savePdfFile"));

console.log("Feature boundaries: camera/gallery OCR -> notes; PDF -> manual overlays, isolated persistence: passed.");
