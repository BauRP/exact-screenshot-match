/**
 * One app-private auto-updated backup. Stored in Android Directory.Data.
 * Only a temporary staging file is used during writes, never an accumulating
 * series of backups. User consent is implicit in first pressing Save.
 * App uninstall/clear-data removes both notes AND this internal backup.
 */
import { createFullBackup, restoreFullBackup } from "./backup";

const BACKUP_FILE = "WaveNotes.backup";
const PENDING_FILE = "WaveNotes.backup.pending";
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

async function plugin() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    throw new Error("Внутреннее резервное копирование доступно в Android-приложении");
  }
  return import("@capacitor/filesystem");
}

async function readBackupOrNull(): Promise<Blob | null> {
  const { Filesystem, Directory } = await plugin();
  // A staged file from an interrupted update is a complete, verified ZIP.
  for (const path of [PENDING_FILE, BACKUP_FILE]) {
    let exists: boolean;
    try {
      await Filesystem.stat({ path, directory: Directory.Data });
      exists = true;
    } catch { exists = false; }
    if (!exists) continue;
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
    if (typeof data !== "string") throw new Error("Неверный формат внутренней резервной копии");
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: "application/zip" });
  }
  return null;
}

async function writeBackup(blob: Blob): Promise<void> {
  const { Filesystem, Directory } = await plugin();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Ошибка чтения резервной копии"));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
  await Filesystem.writeFile({ path: PENDING_FILE, directory: Directory.Data, data: base64 });
  // Validate the length before replacing the active backup; a failed write
  // must leave the old backup untouched.
  const check = await Filesystem.stat({ path: PENDING_FILE, directory: Directory.Data });
  if (check.size !== blob.size) throw new Error("Не удалось проверить сохранённую резервную копию");
  await Filesystem.writeFile({ path: BACKUP_FILE, directory: Directory.Data, data: base64 });
  await Filesystem.deleteFile({ path: PENDING_FILE, directory: Directory.Data });
}

/** First manual save creates the file; later saves update the same location. */
export function saveLocalBackup(): Promise<void> {
  return serialized(async () => {
    const previous = await readBackupOrNull();
    const current = await createFullBackup(previous ?? undefined);
    await writeBackup(current);
  });
}

/** Restore directly from app-private files, without an Android picker. */
export function restoreLocalBackup(): Promise<number> {
  return serialized(async () => {
    const current = await readBackupOrNull();
    if (!current) throw new Error("Резервная копия ещё не создана. Сначала нажмите «Сохранить».");
    return restoreFullBackup(new File([current], BACKUP_FILE, { type: "application/zip" }));
  });
}

export function startLocalBackupAutoSync(): () => void {
  if (typeof window === "undefined") return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const flush = () => {
    if (stopped) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    void serialized(async () => {
      // Do not turn on auto-backup until user has explicitly pressed Save.
      if (!(await readBackupOrNull())) return;
      const previous = await readBackupOrNull();
      const snapshot = await createFullBackup(previous ?? undefined);
      await writeBackup(snapshot);
    }).catch((error) => console.error("[Wave Notes] Automatic backup failed", error));
  };
  const schedule = () => {
    if (stopped) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, 2500);
  };
  const visibility = () => {
    if (document.visibilityState === "hidden") flush();
    else schedule();
  };
  window.addEventListener("wave-notes-data-changed", schedule);
  document.addEventListener("visibilitychange", visibility);
  // Reconcile edits and expire deleted records after app restart.
  timer = setTimeout(flush, 7000);
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    window.removeEventListener("wave-notes-data-changed", schedule);
    document.removeEventListener("visibilitychange", visibility);
  };
}
