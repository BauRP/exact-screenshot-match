import { strict as assert } from "node:assert";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";

// Exercise the real backup ZIP builder without Android filesystem or IndexedDB.
const memory = new Map<string, string>();
const store = {
  getItem(k: string) { return memory.get(k) ?? null; },
  setItem(k: string, v: string) { memory.set(k, v); },
  removeItem(k: string) { memory.delete(k); },
};
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: store, dispatchEvent() {} } });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: store });
const notes = await import("../src/lib/notes-store");
const { createFullBackup, restoreFullBackup } = await import("../src/lib/backup");

const first = notes.createNote({ title: "Моя заметка", body: "Оригинальный текст" });
const copy1 = await createFullBackup();
const read = async (blob: Blob) => {
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  return { entries, manifest: JSON.parse(strFromU8(entries["manifest.json"])) as {notes: Array<{id:string;title:string;body:string}>;deletedAt:Record<string,number>} };
};
assert.equal((await read(copy1)).manifest.notes.length, 1);
notes.updateNote(first.id, { body: "Изменение" });
const copy2 = await createFullBackup(copy1);
assert.equal((await read(copy2)).manifest.notes[0].body, "Изменение");
notes.deleteNote(first.id);
const copy3 = await createFullBackup(copy2);
const snapshot3 = await read(copy3);
assert.equal(snapshot3.manifest.notes[0].body, "Изменение");
assert.ok(snapshot3.manifest.deletedAt[first.id] > 0);

const second = notes.createNote({ title: "Новая", body: "Другой текст" });
const copy4 = await createFullBackup(copy3);
assert.equal((await read(copy4)).manifest.notes.length, 2);
assert.ok((await read(copy4)).manifest.deletedAt[first.id] > 0);
const restored = await restoreFullBackup(new File([copy4], "WaveNotes.backup"));
assert.equal(restored, 1);
assert.equal(notes.getNote(first.id)?.body, "Изменение");
assert.equal(notes.getNote(second.id)?.body, "Другой текст");

// A note deleted more than 24h ago expires from the next updated backup.
notes.deleteNote(first.id);
const { entries, manifest } = await read(copy4);
manifest.deletedAt[first.id] = Date.now() - 25 * 3600_000;
entries["manifest.json"] = strToU8(JSON.stringify(manifest));
const aged = new Blob([zipSync(entries, { level: 0 })]);
const pruned = await createFullBackup(aged);
assert.equal((await read(pruned)).manifest.notes.some((n) => n.id === first.id), false);
console.log("Local backup: updates, deletion grace, restore, expiration passed.");
