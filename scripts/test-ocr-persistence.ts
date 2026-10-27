import { strict as assert } from "node:assert";
import { buildOcrNoteDraft } from "../src/lib/ocr-note";

/**
 * The OCR route uses the actual local notes store. Simulate browser storage
 * without mocking createNote(), so serialization and failure behavior run.
 */
const stored = new Map<string,string>();
let rejectWrites = false;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem(key: string): string | null { return stored.get(key) ?? null; },
      setItem(key: string, value: string) {
        if (rejectWrites) throw new Error("QuotaExceededError");
        stored.set(key,value);
      },
    },
  },
});

const {createNote, getNote} = await import("../src/lib/notes-store");
const original = "Қазақша & English\n日本語 中文\n한국어 हिन्दी\n\nЦена < 2500";
const draft = buildOcrNoteDraft(original,"Распознанный текст");
const created = createNote(draft);
const saved = stored.get("sn.notes.v1");
assert.ok(saved, "OCR note must be serialized in actual application storage");
const storedNotes = JSON.parse(saved) as Array<{id:string;title:string;body:string}>;
assert.equal(storedNotes.length,1);
assert.equal(storedNotes[0].id,created.id);
assert.equal(storedNotes[0].title,"Қазақша & English");
assert.equal(storedNotes[0].body,draft.body);
assert.equal(getNote(created.id)?.body,draft.body);
assert.ok(storedNotes[0].body.includes("<p><br></p>"),"Blank lines must survive the editor conversion");
assert.ok(storedNotes[0].body.includes("&lt;"),"OCR input must not be interpreted as HTML");

const second = createNote(buildOcrNoteDraft("Привет\nСәлем әлем\nनमस्ते", "OCR"));
assert.equal(getNote(second.id)?.body,"<p>Привет</p><p>Сәлем әлем</p><p>नमस्ते</p>");
assert.equal(JSON.parse(stored.get("sn.notes.v1") ?? "[]").length,2);
const beforeFailure = stored.get("sn.notes.v1");
rejectWrites = true;
assert.throws(() => createNote(buildOcrNoteDraft("Новое распознавание","OCR")), /Unable to save notes/);
assert.equal(stored.get("sn.notes.v1"),beforeFailure,"Storage failure must preserve prior notes");
assert.equal(getNote(second.id)?.body,"<p>Привет</p><p>Сәлем әлем</p><p>नमस्ते</p>");
console.log("OCR -> HTML -> real notes-store -> persistent storage: assertions passed.");
