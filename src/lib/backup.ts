/**
 * Super Notes: offline, self-contained backup ZIP.
 * Includes note metadata, original PDF bytes, recorded audio, and folders.
 * No network or account is required. Large archives deliberately fail early.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { audioIdsInHtml, loadAudioFile, saveNewAudioFile, deleteAudioFile } from "./audio-files";
import { loadPdfFile, saveNewPdfFile, deletePdfFile } from "./pdf-files";
import { exportNotes, importBackupNotes, type Note } from "./notes-store";
import { exportFolderBackup, restoreFolderBackup, type Folder } from "./folders-store";

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_BYTES = 100 * 1024 * 1024;
const FORMAT = "super-notes-backup";
const VERSION = 1;

type BackupManifest = {
  format: string;
  version: number;
  createdAt: number;
  notes: Note[];
  folders: Folder[];
  hiddenSystem: string[];
  pdfIds: string[];
  audioIds: string[];
  deletedAt?: Record<string, number>;
};

function parseManifest(input: Uint8Array): BackupManifest {
  const payload: unknown = JSON.parse(strFromU8(input));
  if (!payload || typeof payload !== "object") throw new Error("Недопустимый формат резервной копии");
  const manifest = payload as BackupManifest;
  if (manifest.format !== FORMAT || manifest.version !== VERSION ||
      !Array.isArray(manifest.notes) || !Array.isArray(manifest.folders) ||
      !Array.isArray(manifest.pdfIds) || !Array.isArray(manifest.audioIds) ||
      !Array.isArray(manifest.hiddenSystem)) {
    throw new Error("Это не поддерживаемая резервная копия Супер заметок");
  }
  if (manifest.notes.length > 10000 || manifest.pdfIds.length > 10000 ||
      manifest.audioIds.length > 10000 || manifest.folders.length > 1000) {
    throw new Error("Резервная копия содержит слишком много записей");
  }
  return manifest;
}

function uniqueIds(ids: string[]) {
  if (ids.some((id) => typeof id !== "string" || !/^[\w-]{1,128}$/.test(id))) {
    throw new Error("Недопустимый идентификатор вложения в архиве");
  }
  return [...new Set(ids)];
}

/** Build a complete current snapshot, retaining deleted items for 24 hours.
 * Previous ZIP bytes carry the deleted PDFs/audio so deletion of live files is safe.
 * Old archive is validated before it can influence a new snapshot.
 */
export async function createFullBackup(previous?: Blob): Promise<Blob> {
  const liveNotes = (JSON.parse(exportNotes()) as { notes: Note[] }).notes;
  const folders = exportFolderBackup();
  const liveIds = new Set(liveNotes.map((note) => note.id));
  const deletedAt: Record<string, number> = {};
  const retained: Note[] = [];
  let previousEntries: Record<string, Uint8Array> = {};
  if (previous) {
    if (previous.size > MAX_ARCHIVE_BYTES) throw new Error("Предыдущая копия превышает 100 МБ");
    previousEntries = unzipSync(new Uint8Array(await previous.arrayBuffer()), {
      filter: (entry) => {
        if (entry.originalSize > MAX_ENTRY_BYTES) throw new Error("Повреждена старая резервная копия");
        return true;
      },
    });
    if (!previousEntries["manifest.json"]) throw new Error("В прежней копии отсутствуют данные");
    const old = parseManifest(previousEntries["manifest.json"]);
    const oldDeletions = old.deletedAt ?? {};
    const now = Date.now();
    for (const note of old.notes) {
      if (liveIds.has(note.id)) continue;
      const when = Object.prototype.hasOwnProperty.call(oldDeletions, note.id) ? oldDeletions[note.id] : now;
      if (!Number.isFinite(when) || when > now || now - when >= 24 * 60 * 60 * 1000) continue;
      retained.push(note);
      deletedAt[note.id] = when;
    }
  }
  const notes = [...liveNotes, ...retained];
  const pdfIds = uniqueIds(notes.filter((note) => note.kind === "pdf").map((note) => note.id));
  const audioIds = uniqueIds(notes.flatMap((note) => audioIdsInHtml(note.body)));
  const entries: Record<string, Uint8Array> = {};
  let total = 0;
  const add = (name: string, bytes: Uint8Array) => {
    total += bytes.byteLength;
    if (total > MAX_ARCHIVE_BYTES) throw new Error("Резервная копия превышает 100 МБ. Удалите ненужные вложения.");
    entries[name] = bytes;
  };
  const manifest: BackupManifest = {
    format: FORMAT, version: VERSION, createdAt: Date.now(),
    notes, folders: folders.folders, hiddenSystem: folders.hiddenSystem, pdfIds, audioIds, deletedAt,
  };
  add("manifest.json", strToU8(JSON.stringify(manifest)));
  for (const id of pdfIds) {
    const buffer = liveIds.has(id) ? await loadPdfFile(id) : null;
    const raw = buffer ? new Uint8Array(buffer) : previousEntries["pdf/" + id + ".pdf"];
    if (!raw) throw new Error("Не найден PDF. Сохранение копии отменено: " + id);
    add("pdf/" + id + ".pdf", raw);
  }
  for (const id of audioIds) {
    const audio = await loadAudioFile(id);
    const raw = audio ? new Uint8Array(await audio.arrayBuffer()) : previousEntries["audio/" + id + ".blob"];
    if (!raw) throw new Error("Не найдено аудио. Сохранение копии отменено: " + id);
    add("audio/" + id + ".blob", raw);
  }
  return new Blob([zipSync(entries, { level: 0 }).slice().buffer], { type: "application/zip" });
}

export async function shareFullBackup(blob: Blob): Promise<void> {
  const name = "SuperNotes-backup-" + new Date().toISOString().slice(0, 10) + ".zip";
  const capacitor = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  if (capacitor?.isNativePlatform?.()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"), import("@capacitor/share"),
    ]);
    // Capacitor Filesystem currently accepts base64 content.
    const encoded = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
      reader.onload = () => {
        const data = String(reader.result ?? "");
        resolve(data.slice(data.indexOf(",") + 1));
      };
      reader.readAsDataURL(blob);
    });
    const result = await Filesystem.writeFile({ directory: Directory.Cache, path: name, data: encoded });
    await Share.share({ title: "Резервная копия Супер заметок", url: result.uri });
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function restoreFullBackup(file: File): Promise<number> {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("Архив превышает безопасный лимит 100 МБ");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let declaredBytes = 0;
  const entries = unzipSync(bytes, {
    filter: (entry) => {
      if (entry.originalSize > MAX_ENTRY_BYTES) {
        throw new Error("Один из файлов архива превышает ограничение");
      }
      declaredBytes += entry.originalSize;
      if (declaredBytes > MAX_ARCHIVE_BYTES) {
        throw new Error("Распакованный архив превышает 100 МБ");
      }
      return true;
    },
  });
  const metadata = entries["manifest.json"];
  if (!metadata) throw new Error("В архиве отсутствует manifest.json");
  const manifest = parseManifest(metadata);
  const pdfIds = uniqueIds(manifest.pdfIds);
  const audioIds = uniqueIds(manifest.audioIds);
  // Reject backups that omit referenced binary attachments.
  for (const record of manifest.notes) {
    if (!record || typeof record !== "object" || typeof record.id !== "string" ||
        typeof record.title !== "string" || typeof record.body !== "string") {
      throw new Error("В архиве найдена повреждённая заметка");
    }
    if (record.kind === "pdf" && !pdfIds.includes(record.id)) {
      throw new Error("В архиве не указан PDF для заметки: " + record.id);
    }
    for (const id of audioIdsInHtml(record.body)) {
      if (!audioIds.includes(id)) throw new Error("В архиве отсутствует аудиозапись: " + id);
    }
  }

  // Validate ALL referenced files before making any changes to local storage.
  let total = metadata.byteLength;
  for (const id of pdfIds) {
    const value = entries["pdf/" + id + ".pdf"];
    if (!value || !value.byteLength) throw new Error("Не найден файл PDF в резервной копии: " + id);
    total += value.byteLength;
  }
  for (const id of audioIds) {
    const value = entries["audio/" + id + ".blob"];
    if (!value || !value.byteLength) throw new Error("Не найдено аудио в резервной копии: " + id);
    total += value.byteLength;
  }
  if (total > MAX_ARCHIVE_BYTES) throw new Error("Размер распакованных файлов превышает 100 МБ");

  // Restore only truly new notes. Never replace existing notes or binary data.
  const existingNotes = (JSON.parse(exportNotes()) as { notes: Note[] }).notes;
  const existingIds = new Set(existingNotes.map((note) => note.id));
  const incoming = manifest.notes.filter((note) => !existingIds.has(note.id));
  const newPdfIds: string[] = [];
  const newAudioIds: string[] = [];
  const rewritten = new Map<string, string>();

  // Audio may be referenced by existing notes or orphan files. Always use
  // new attachment IDs and rewrite only the imported notes' references.
  const newNotes = incoming.map((note) => {
    let body = note.body;
    for (const id of audioIdsInHtml(body)) {
      let replacement = rewritten.get(id);
      if (!replacement) {
        replacement = crypto.randomUUID();
        rewritten.set(id, replacement);
      }
      body = body.split("audiodb:" + id).join("audiodb:" + replacement);
    }
    return { ...note, body };
  });
  try {
    for (const note of newNotes) {
      if (note.kind !== "pdf") continue;
      const raw = entries["pdf/" + note.id + ".pdf"];
      if (!raw) throw new Error("Отсутствует PDF: " + note.id);
      // add() rejects duplicate keys, including orphan files not in notes.
      await saveNewPdfFile(note.id, raw.slice().buffer);
      newPdfIds.push(note.id);
    }
    for (const [sourceId, destinationId] of rewritten) {
      const raw = entries["audio/" + sourceId + ".blob"];
      if (!raw) throw new Error("Отсутствует аудио: " + sourceId);
      await saveNewAudioFile(destinationId, new Blob([raw.slice().buffer]));
      newAudioIds.push(destinationId);
    }
    // Note metadata is published only after ALL of its attachments exist.
    // Restore folder IDs ahead of note metadata to preserve their grouping.
    restoreFolderBackup(manifest.folders, manifest.hiddenSystem);
    return importBackupNotes(newNotes);
  } catch (error) {
    // Clean up only newly created binary data, never pre-existing files.
    await Promise.allSettled([
      ...newPdfIds.map((id) => deletePdfFile(id)),
      ...newAudioIds.map((id) => deleteAudioFile(id)),
    ]);
    throw error;
  }
}
