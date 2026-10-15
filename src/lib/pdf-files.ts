/**
 * Binary storage for imported PDF documents.
 *
 * PDFs are far too large for localStorage, so the raw bytes live in IndexedDB
 * keyed by the owning note id, while the lightweight metadata lives inside the
 * regular notes database (so PDFs show up in the unified list feed).
 */

const DB_NAME = "sn.pdf.v1";
const STORE = "files";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open PDF storage"));
  });

  return dbPromise;
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("PDF storage request failed"));
      }),
  );
}

export async function savePdfFile(id: string, bytes: ArrayBuffer): Promise<void> {
  await withStore("readwrite", (store) => store.put(bytes, id) as IDBRequest<IDBValidKey>);
}

export async function loadPdfFile(id: string): Promise<ArrayBuffer | null> {
  try {
    const value = await withStore<ArrayBuffer | undefined>("readonly", (store) => store.get(id));
    return value ?? null;
  } catch {
    return null;
  }
}

export async function deletePdfFile(id: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(id) as unknown as IDBRequest<undefined>);
  } catch {
    /* ignore */
  }
}

/** Opens the native/system file picker and resolves with the chosen PDF. */
export function pickPdfFile(): Promise<File | null> {
  if (typeof document === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    let settled = false;

    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener("change", () => finish(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();

    // Safety net: some Android webviews never fire "cancel".
    window.setTimeout(() => {
      if (!settled && !input.files?.length) {
        // keep waiting for change; only clean up if the element got detached
      }
    }, 1000);
  });
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
