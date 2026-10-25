/**
 * Audio attachments are stored as binary Blobs in IndexedDB, not as giant
 * data: URLs inside localStorage note bodies. Existing data: recordings stay
 * readable through the legacy audio node path.
 */
const DB_NAME = "sn.audio.v1";
const STORE = "recordings";

let opening: Promise<IDBDatabase> | null = null;

function openAudioDB(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error("Audio database could not be opened"));
    };
  });
  return opening;
}

async function operate<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openAudioDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let value: T;
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => { value = request.result; };
    request.onerror = () => reject(request.error ?? new Error("Audio storage failed"));
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error ?? new Error("Audio transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Audio transaction cancelled"));
  });
}

export async function saveAudioFile(blob: Blob): Promise<string> {
  const id = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `audio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await operate("readwrite", (store) => store.put(blob, id));
  return id;
}

export async function saveAudioFileWithId(id: string, blob: Blob): Promise<void> {
  if (!/^[\w-]{1,128}$/.test(id)) throw new Error("Invalid audio ID");
  await operate("readwrite", (store) => store.put(blob, id));
}

/** Create-only write: never replace the audio associated with another note. */
export async function saveNewAudioFile(id: string, blob: Blob): Promise<void> {
  if (!/^[\w-]{1,128}$/.test(id)) throw new Error("Invalid audio ID");
  await operate("readwrite", (store) => store.add(blob, id));
}

export async function loadAudioFile(id: string): Promise<Blob | null> {
  const value = await operate<Blob | undefined>("readonly", (store) => store.get(id));
  return value ?? null;
}

export async function deleteAudioFile(id: string): Promise<void> {
  await operate("readwrite", (store) => store.delete(id));
}

/** Return local audio IDs referenced by note markup (not legacy data URLs). */
export function audioIdsInHtml(html: string): string[] {
  const matches = html.matchAll(/audiodb:([a-zA-Z0-9_-]+)/g);
  return [...new Set(Array.from(matches, (match) => match[1]))];
}
