import { strict as assert } from "node:assert";

/** Ensure ZIP restore accepts real UUID-based custom folder IDs.
 * Importing the actual folders-store exercises the production validator.
 */
const entries = new Map<string, string>();
const storage = {
  getItem(key: string): string | null { return entries.get(key) ?? null; },
  setItem(key: string, value: string): void { entries.set(key, value); },
  removeItem(key: string): void { entries.delete(key); },
};
Object.defineProperty(globalThis, "window", {
  configurable: true, value: { localStorage: storage },
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true, value: storage,
});
const { restoreFolderBackup, exportFolderBackup } = await import("../src/lib/folders-store");

const folder = { id: "9ae2838b-8e43-4e1d-a7f0-8c76f4139146", name: "Мои документы" };
restoreFolderBackup([folder], ["work"]);
assert.deepEqual(exportFolderBackup().folders, [folder]);
assert.deepEqual(exportFolderBackup().hiddenSystem, ["work"]);
assert.equal(JSON.parse(storage.getItem("sn.folders.v1") ?? "[]")[0].id, folder.id);
assert.deepEqual(JSON.parse(storage.getItem("sn.hidden-system-folders.v1") ?? "[]"), ["work"]);

// Importing the same ZIP twice must not duplicate a folder or erase preferences.
restoreFolderBackup([folder], ["work"]);
assert.equal(exportFolderBackup().folders.length, 1);

// Existing folders must survive importing another archive.
const second = { id: "f7e541af-845c-457a-bf0b-7d86fc2d3625", name: "Работа" };
restoreFolderBackup([second], ["home"]);
assert.deepEqual(exportFolderBackup().folders.map((f) => f.id), [folder.id, second.id]);
assert.deepEqual(exportFolderBackup().hiddenSystem, ["work", "home"]);

// Corrupt/malicious IDs must fail without changing existing local folders.
const before = JSON.stringify(exportFolderBackup());
assert.throws(() => restoreFolderBackup([{id:"../invalid",name:"Bad"}], []), /Invalid folder/);
assert.throws(() => restoreFolderBackup([], ["all"]), /Invalid folder/);
assert.equal(JSON.stringify(exportFolderBackup()), before);
console.log("ZIP backup folder restore: UUID IDs, hidden preferences, repeated import and invalid data: passed.");
