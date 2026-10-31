/**
 * Single private, auto-updated backup for Wave Notes on Android.
 * - The Settings switch creates the first copy; confirmed saves update it.
 * - Editor keystrokes do not write the archive; back arrow cancels drafts.
 * - Work is serialized and coalesced; the archive is packed asynchronously.
 * - A staged file protects recovery when an update is interrupted.
 * - Uninstalling/clearing app data also deletes this internal backup.
 */
import { createFullBackup, restoreFullBackup, validateFullBackup } from "./backup";
import { clearBackupDirtyRevision, getBackupDirtyRevision } from "./backup-signals";

const BACKUP_FILE = "WaveNotes.backup";
const STAGING_FILE = "WaveNotes.backup.pending";
const ENABLED_KEY = "sn.backup.auto-enabled.v1";
let queue: Promise<unknown> = Promise.resolve();

export function isAutomaticBackupEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(ENABLED_KEY)==="1"; }
  catch { return false; }
}

/** Create/validate the internal snapshot BEFORE advertising an enabled switch.
 * Turning off preserves the existing copy for manual restoration.
 */
export async function setAutomaticBackupEnabled(enabled:boolean):Promise<void> {
  if(typeof window==="undefined")throw new Error("Настройки резервирования недоступны");
  if(!enabled){
    window.localStorage.setItem(ENABLED_KEY,"0");
    window.dispatchEvent(new Event("wave-notes-backup-mode-changed"));
    return;
  }
  if(!isAutomaticBackupEnabled()) await saveLocalBackup();
  window.localStorage.setItem(ENABLED_KEY,"1");
  window.dispatchEvent(new Event("wave-notes-backup-mode-changed"));
}


function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

async function nativeFilesystem() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    throw new Error("Внутренняя резервная копия доступна в Android-приложении");
  }
  return import("@capacitor/filesystem");
}

/** Avoid a single enormous synchronous atob call on older Android WebViews. */
async function decodeArchive(base64: string): Promise<Blob> {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const chunkSize = 64 * 1024; // Must be divisible by four.
  for (let pos = 0; pos < base64.length; pos += chunkSize) {
    const block = atob(base64.slice(pos, pos + chunkSize));
    const bytes = new Uint8Array(block.length);
    for (let index = 0; index < block.length; index++) bytes[index] = block.charCodeAt(index);
    parts.push(bytes);
    if (pos > 0 && pos % (chunkSize * 16) === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return new Blob(parts, { type: "application/zip" });
}

async function readStored(path: string): Promise<Blob> {
  const { Filesystem, Directory } = await nativeFilesystem();
  const stat = await Filesystem.stat({ path, directory: Directory.Data });
  if (stat.size > 100 * 1024 * 1024) throw new Error("Резервная копия превышает 100 МБ");
  const result = await Filesystem.readFile({ path, directory: Directory.Data });
  if (typeof result.data !== "string") throw new Error("Неподдерживаемый формат резервной копии");
  return decodeArchive(result.data);
}

/** Prefer the complete staging file after an interrupted replacement.
 * Ignore incomplete staging data and keep the last good active file.
 */
async function readBackupOrNull(): Promise<Blob | null> {
  const { Filesystem, Directory } = await nativeFilesystem();
  let found = false;
  let failure: unknown = null;
  for (const path of [STAGING_FILE, BACKUP_FILE]) {
    try {
      await Filesystem.stat({ path, directory: Directory.Data });
    } catch {
      continue;
    }
    found = true;
    try {
      const blob = await readStored(path);
      // Validate that the backup is readable before accepting it as a base
      // for the next update. A partial stage must never hide the good copy.
      await validateFullBackup(blob);
      return blob;
    } catch (error) {
      failure = error;
      console.warn("[Wave Notes] Invalid backup at", path, error);
    }
  }
  if (found) throw new Error("Резервная копия повреждена. Последнее сохранение не удалось.");
  if (failure) throw failure;
  return null;
}


async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать резервную копию"));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

async function writeBackup(blob: Blob): Promise<void> {
  const { Filesystem, Directory } = await nativeFilesystem();
  const data = await blobToBase64(blob);
  await Filesystem.writeFile({ path: STAGING_FILE, directory: Directory.Data, data });
  const stage = await Filesystem.stat({ path: STAGING_FILE, directory: Directory.Data });
  if (stage.size !== blob.size) throw new Error("Ошибка проверки размера резервной копии");
  // Pending is known complete and recoverable even if Android closes the app
  // between the write of active and cleanup of staging.
  await Filesystem.writeFile({ path: BACKUP_FILE, directory: Directory.Data, data });
  await Filesystem.deleteFile({ path: STAGING_FILE, directory: Directory.Data });
}

export function saveLocalBackup(): Promise<void> {
  return serialized(async () => {
    const revision = getBackupDirtyRevision();
    const previous = await readBackupOrNull();
    const current = await createFullBackup(previous ?? undefined);
    await writeBackup(current);
    clearBackupDirtyRevision(revision);
  });
}

export function restoreLocalBackup(): Promise<number> {
  return serialized(async () => {
    const copy = await readBackupOrNull();
    if (!copy) throw new Error("Резервная копия ещё не создана. Включите «Автоматическая резервная копия» в настройках.");
    const count=await restoreFullBackup(new File([copy], BACKUP_FILE, { type: "application/zip" }));
    // Restoring from this snapshot is NOT a new user edit. Otherwise the
    // restore event marks it dirty and a subsequent timer can immediately
    // rewrite the recovery source with the just-restored notes.
    clearBackupDirtyRevision(getBackupDirtyRevision());
    return count;
  });
}

/** Synchronize after a confirmed save, never during editing. Coalesce bursts
 * and remember unsuccessful writes until the next app start/focus/change.
 */
export function startLocalBackupAutoSync(): () => void {
  if (typeof window === "undefined") return () => {};
  const cap = (window as Window & {Capacitor?: {getPlatform?: () => string}}).Capacitor;
  if (cap?.getPlatform?.() !== "android") return () => {};

  // Capacitor SPA uses hash routing, not pathname, for editor URLs.
  let editing = /#\/editor(?:\/|$)/.test(window.location.hash);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const flush = () => {
    if (disposed || editing || !isAutomaticBackupEnabled() || !getBackupDirtyRevision()) return;
    void serialized(async () => {
      if (editing || disposed || !isAutomaticBackupEnabled()) return;
      const rev = getBackupDirtyRevision();
      if (!rev) return;
      const old = await readBackupOrNull();
      if (!old) return; // Do not create/reset the archive without opt-in.
      const next = await createFullBackup(old);
      await writeBackup(next);
      clearBackupDirtyRevision(rev);
    }).catch((error) => console.warn("[Wave Notes] Automatic backup postponed", error));
  };

  const schedule = () => {
    if (disposed || editing || !isAutomaticBackupEnabled() || !getBackupDirtyRevision()) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; flush(); }, 1800);
  };
  const onDataChanged = () => schedule();
  const onOpened = () => {
    editing = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const onClosed = () => { editing = false; schedule(); };
  const onVisible = () => {
    // Revisit a pending committed save after return; never rearchive drafts.
    if (document.visibilityState === "visible") schedule();
  };

  const onModeChanged=()=>{if(timer!==null){clearTimeout(timer);timer=null;}schedule();};
  window.addEventListener("wave-notes-data-changed", onDataChanged);
  window.addEventListener("wave-notes-backup-mode-changed",onModeChanged);
  window.addEventListener("wave-notes-editor-opened", onOpened);
  window.addEventListener("wave-notes-editor-closed", onClosed);
  document.addEventListener("visibilitychange", onVisible);
  schedule(); // Only if a prior committed save was interrupted.
  return () => {
    disposed = true;
    if (timer !== null) clearTimeout(timer);
    window.removeEventListener("wave-notes-data-changed", onDataChanged);
    window.removeEventListener("wave-notes-backup-mode-changed",onModeChanged);
    window.removeEventListener("wave-notes-editor-opened", onOpened);
    window.removeEventListener("wave-notes-editor-closed", onClosed);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
