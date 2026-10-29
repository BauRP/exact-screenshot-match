/** Lightweight durable marker written only after committed note/folder changes.
 * This is NOT called for editor keystrokes or draft state.
 */
const PENDING_KEY = "sn.backup.pending-revision.v1";
let serial = 0;

export function markBackupDirty(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_KEY, Date.now().toString(36) + ":" + (++serial).toString(36));
  } catch {
    // Never turn a successfully saved note into a failure because of the backup hint.
  }
  if (typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event("wave-notes-data-changed"));
  }
}

export function getBackupDirtyRevision(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(PENDING_KEY); } catch { return null; }
}

export function clearBackupDirtyRevision(expected: string | null): void {
  if (!expected || typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(PENDING_KEY) === expected) {
      window.localStorage.removeItem(PENDING_KEY);
    }
  } catch {
    // Next app open will try again; safe if storage is unavailable.
  }
}
