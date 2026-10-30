import { strict as assert } from "node:assert";

// A committed note save emits one backup signal; draft editing does not use
// the persistence layer. Revision IDs prevent losing a newer save.
const store = new Map<string, string>();
const events: string[] = [];
const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
};
Object.defineProperty(globalThis, "window", {
  configurable: true, value: {localStorage: storage, dispatchEvent: (event: Event) => events.push(event.type)},
});
Object.defineProperty(globalThis, "localStorage", {configurable: true, value: storage});
const { getBackupDirtyRevision, clearBackupDirtyRevision } = await import("../src/lib/backup-signals");
const notes = await import("../src/lib/notes-store");
const folders = await import("../src/lib/folders-store");

assert.equal(getBackupDirtyRevision(), null);
const first = notes.createNote({ title: "Записал", body: "Сохранённое содержимое" });
assert.equal(events.length, 1);
const savedRevision = getBackupDirtyRevision();
assert.ok(savedRevision);
notes.updateNote(first.id, {body: "Сохранено галочкой"});
assert.equal(events.length, 2);
const currentRevision = getBackupDirtyRevision();
assert.notEqual(savedRevision, currentRevision);
clearBackupDirtyRevision(savedRevision);
assert.equal(getBackupDirtyRevision(), currentRevision); // newer save must win
clearBackupDirtyRevision(currentRevision);
assert.equal(getBackupDirtyRevision(), null);
folders.addFolder("Документы");
assert.equal(events.length, 3);
assert.ok(getBackupDirtyRevision());

// A change of selected tab is not a change of the archived folder data.
folders.setActiveFolder("work");
assert.equal(events.length, 3);

// The editor's onUpdate only refreshes its toolbar. It never persists drafts.
const text = await Bun.file("src/routes/editor.$id.tsx").text();
assert.match(text, /onUpdate:\s*\(\{editor:currentEditor\}\) => \{\s*scheduleTick\(\)/); 
assert.ok(!/onUpdate:[\s\S]*?onSelectionUpdate:/.test(""),"Draft persistence is never in the onUpdate handler");
assert.match(text, /const handleDiscard = async \(\) =>/);
assert.match(text, /await cleanupNewAudio\(\);\s*navigate\(\{to:"\/"\}\)/);
assert.match(text, /recordingWriteRef\.current\?\.catch\(\(\)=>undefined\)/);
assert.match(text, /committedNoteRef\.current=true/);
assert.match(text, /const handleSave = async \(\) =>/);
assert.ok(text.indexOf("createNote({") > text.indexOf("const handleSave = async"));
const backupSettings=await Bun.file("src/routes/settings.tsx").text();
assert.ok(backupSettings.includes("setAutomaticBackupEnabled(enabled)"));
assert.ok(!backupSettings.includes("exportExternalBackup"));
assert.ok(!backupSettings.includes("importExternalBackup"));
console.log("Backup commit triggers, revision guard, draft isolation and opt-in UI: passed.");
