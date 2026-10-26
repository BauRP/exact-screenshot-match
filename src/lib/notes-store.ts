import { useSyncExternalStore } from "react";

export type NoteKind = "note" | "pdf";

/** A styled slice of an overlay's text; unset fields fall back to the overlay. */
export type PdfTextRun = {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
};

export type PdfTextOverlay = {
  id: string;
  page: number;
  /** Position/size in page-relative units (0..1). */
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  text: string;
  /** True when the box masks existing PDF text that was replaced. */
  cover: boolean;
  /** Inline text formatting (PDF points for the size). */
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  /** Per-character formatting; `text` always mirrors the joined runs. */
  runs?: PdfTextRun[];
};

export type PdfMeta = {
  fileName: string;
  size: number;
  pageCount: number;
  author?: string;
  producer?: string;
  createdAt?: number;
  favorite?: boolean;
  overlays?: PdfTextOverlay[];
};

export type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  folderId?: string;
  kind?: NoteKind;
  pdf?: PdfMeta;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    background?: string;
  };
};


export type ViewMode = "list" | "grid" | "table";
export type SortMode = "created" | "updated" | "alpha";
export type NotesDatabaseStatus = "idle" | "loading" | "ready" | "error";

type DatabaseSnapshot = {
  notes: Note[];
  view: ViewMode;
  sort: SortMode;
  hydrated: boolean;
  status: NotesDatabaseStatus;
  error: string | null;
  revision: number;
};

const NOTES_KEY = "sn.notes.v1";
const VIEW_KEY = "sn.view.v1";
const SORT_KEY = "sn.sort.v1";

const EMPTY_NOTES: Note[] = [];
const DEFAULT_VIEW: ViewMode = "list";
const DEFAULT_SORT: SortMode = "updated";

const listeners = new Set<() => void>();

let state: DatabaseSnapshot = {
  notes: EMPTY_NOTES,
  view: DEFAULT_VIEW,
  sort: DEFAULT_SORT,
  hydrated: false,
  status: "idle",
  error: null,
  revision: 0,
};

let initPromise: Promise<void> | null = null;
let cachedSortedNotes: Note[] = EMPTY_NOTES;
let cachedSortedKey = "";

function isBrowserStorageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNote(input: unknown): Note | null {
  if (!isRecord(input)) return null;

  const now = Date.now();
  const rawId = input.id;
  const rawTitle = input.title;
  const rawBody = input.body;
  const rawCreatedAt = input.createdAt;
  const rawUpdatedAt = input.updatedAt;
  const rawFolderId = input.folderId;
  const rawStyle = input.style;

  const id = typeof rawId === "string" && rawId.trim() ? rawId : createId();
  const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle : "Без названия";
  const body = typeof rawBody === "string" ? rawBody : "";
  const createdAt = typeof rawCreatedAt === "number" && Number.isFinite(rawCreatedAt) ? rawCreatedAt : now;
  const updatedAt = typeof rawUpdatedAt === "number" && Number.isFinite(rawUpdatedAt) ? rawUpdatedAt : createdAt;
  const folderId = typeof rawFolderId === "string" && rawFolderId.trim() ? rawFolderId : "all";

  const style = isRecord(rawStyle)
    ? {
        fontFamily: typeof rawStyle.fontFamily === "string" ? rawStyle.fontFamily : undefined,
        fontSize: typeof rawStyle.fontSize === "number" ? rawStyle.fontSize : undefined,
        color: typeof rawStyle.color === "string" ? rawStyle.color : undefined,
        background: typeof rawStyle.background === "string" ? rawStyle.background : undefined,
      }
    : undefined;

  return {
    id,
    title,
    body,
    createdAt,
    updatedAt,
    pinned: input.pinned === true,
    folderId,
    kind: input.kind === "pdf" ? "pdf" : "note",
    pdf: isRecord(input.pdf)
      ? {
          fileName: typeof input.pdf.fileName === "string" ? input.pdf.fileName : "document.pdf",
          size: typeof input.pdf.size === "number" ? input.pdf.size : 0,
          pageCount: typeof input.pdf.pageCount === "number" ? input.pdf.pageCount : 0,
          author: typeof input.pdf.author === "string" ? input.pdf.author : undefined,
          producer: typeof input.pdf.producer === "string" ? input.pdf.producer : undefined,
          createdAt: typeof input.pdf.createdAt === "number" ? input.pdf.createdAt : undefined,
          favorite: input.pdf.favorite === true,
          overlays: Array.isArray(input.pdf.overlays)
            ? (input.pdf.overlays as PdfTextOverlay[]).filter((item) => isRecord(item))
            : [],
        }
      : undefined,
    style,
  };

}

function parseStoredNotes(raw: string | null): Note[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Unexpected notes database format");
    if (parsed.some((item) => !isRecord(item))) throw new Error("Invalid note record");
    return parsed.map(normalizeNote).filter((note): note is Note => note !== null);
  } catch {
    throw new Error("Saved notes could not be parsed. Original data is preserved.");
  }
}

function parseStoredView(raw: string | null): ViewMode {
  return raw === "grid" || raw === "table" || raw === "list" ? raw : DEFAULT_VIEW;
}

function parseStoredSort(raw: string | null): SortMode {
  return raw === "created" || raw === "alpha" || raw === "updated" ? raw : DEFAULT_SORT;
}

function commit(patch: Partial<DatabaseSnapshot>) {
  state = {
    ...state,
    ...patch,
    revision: state.revision + 1,
  };
  emit();
}

function emit() {
  listeners.forEach((listener) => listener());
}

/**
 * Persist first and notify React only after the storage write succeeded.
 * A failed write must NEVER make an unsaved edit look successfully stored.
 */
function persistNotes(nextNotes: Note[]) {
  try {
    if (!isBrowserStorageAvailable()) throw new Error("Local notes storage is unavailable");
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(nextNotes));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Storage write failed";
    commit({ status: "error", error: message });
    throw new Error("Unable to save notes: " + message);
  }
}

function persistPreference(key: string, value: string) {
  if (!isBrowserStorageAvailable()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    commit({ status: "error", error: error instanceof Error ? error.message : "Storage write failed" });
  }
}

function readDatabaseFromStorage(): Pick<DatabaseSnapshot, "notes" | "view" | "sort"> {
  if (!isBrowserStorageAvailable()) {
    return { notes: [], view: DEFAULT_VIEW, sort: DEFAULT_SORT };
  }

  const rawNotes = window.localStorage.getItem(NOTES_KEY);
  const rawView = window.localStorage.getItem(VIEW_KEY);
  const rawSort = window.localStorage.getItem(SORT_KEY);

  return {
    notes: parseStoredNotes(rawNotes),
    view: parseStoredView(rawView),
    sort: parseStoredSort(rawSort),
  };
}

function initializeSynchronously() {
  if (state.hydrated || typeof window === "undefined") return;
  try {
    const database = readDatabaseFromStorage();
    state = {
      ...state,
      ...database,
      hydrated: true,
      status: "ready",
      error: null,
      revision: state.revision + 1,
    };
  } catch (error) {
    state = {
      ...state,
      hydrated: true,
      status: "error",
      error: error instanceof Error ? error.message : "Storage initialization failed",
      revision: state.revision + 1,
    };
  }
}

export function initializeNotesDatabase(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (state.hydrated) return Promise.resolve();
  if (initPromise) return initPromise;

  state = {
    ...state,
    status: "loading",
    error: null,
    revision: state.revision + 1,
  };

  initPromise = Promise.resolve()
    .then(() => readDatabaseFromStorage())
    .then((database) => {
      state = {
        ...state,
        ...database,
        hydrated: true,
        status: "ready",
        error: null,
        revision: state.revision + 1,
      };
    })
    .catch((error: unknown) => {
      state = {
        ...state,
        notes: [],
        view: DEFAULT_VIEW,
        sort: DEFAULT_SORT,
        hydrated: true,
        status: "error",
        error: error instanceof Error ? error.message : "Storage initialization failed",
        revision: state.revision + 1,
      };
    })
    .finally(() => {
      emit();
    });

  emit();
  return initPromise;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void initializeNotesDatabase();
  return () => {
    listeners.delete(listener);
  };
}

function getClientSnapshot() {
  return state;
}

function getServerSnapshot(): DatabaseSnapshot {
  return {
    notes: EMPTY_NOTES,
    view: DEFAULT_VIEW,
    sort: DEFAULT_SORT,
    hydrated: false,
    status: "idle",
    error: null,
    revision: 0,
  };
}

function useDatabaseSnapshot() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

function sortNotes(list: Note[], mode: SortMode): Note[] {
  const pinned = list
    .filter((note) => note.pinned)
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, "ru", { sensitivity: "base" }));

  const rest = list.filter((note) => !note.pinned).slice();
  rest.sort((a, b) => {
    if (mode === "alpha") return a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
    if (mode === "created") return b.createdAt - a.createdAt;
    return b.updatedAt - a.updatedAt;
  });

  return [...pinned, ...rest];
}

function getSortedSnapshot(): Note[] {
  const key = `${state.sort}|${state.revision}|${state.notes.length}`;
  if (key !== cachedSortedKey) {
    cachedSortedNotes = sortNotes(state.notes, state.sort);
    cachedSortedKey = key;
  }
  return cachedSortedNotes;
}

function createId() {
  const cryptoObject = typeof crypto !== "undefined" ? crypto : null;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureReadyForMutation() {
  if (!state.hydrated) initializeSynchronously();
  if (state.status === "error") {
    throw new Error("Notes storage has an error. Writes are blocked to protect existing data.");
  }
}

export function useNotes(): Note[] {
  const snapshot = useDatabaseSnapshot();
  if (!snapshot.hydrated) return EMPTY_NOTES;
  return getSortedSnapshot();
}

export function useView(): ViewMode {
  return useDatabaseSnapshot().view;
}

export function useHydrated(): boolean {
  const snapshot = useDatabaseSnapshot();
  return snapshot.hydrated && snapshot.status !== "loading";
}

export function useNotesDatabaseStatus(): NotesDatabaseStatus {
  return useDatabaseSnapshot().status;
}

export function useNotesDatabaseError(): string | null {
  return useDatabaseSnapshot().error;
}

export function useSort(): SortMode {
  return useDatabaseSnapshot().sort;
}

export function setView(nextView: ViewMode) {
  ensureReadyForMutation();
  commit({ view: nextView, status: state.status === "idle" ? "ready" : state.status });
  persistPreference(VIEW_KEY, nextView);
}

export function setSort(nextSort: SortMode) {
  ensureReadyForMutation();
  commit({ sort: nextSort, status: state.status === "idle" ? "ready" : state.status });
  persistPreference(SORT_KEY, nextSort);
}

export function getNote(id: string): Note | undefined {
  ensureReadyForMutation();
  return state.notes.find((note) => note.id === id);
}

export function createNote(partial?: Partial<Note>): Note {
  ensureReadyForMutation();
  const now = Date.now();
  const note: Note = {
    id: partial?.id ?? createId(),
    title: partial?.title ?? "Новая заметка",
    body: partial?.body ?? "",
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
    pinned: partial?.pinned ?? false,
    folderId: partial?.folderId ?? "all",
    kind: partial?.kind ?? "note",
    pdf: partial?.pdf,
    style: partial?.style,

  };
  const nextNotes = [note, ...state.notes];
  persistNotes(nextNotes);
  commit({ notes: nextNotes, hydrated: true, status: "ready", error: null });
  return note;
}

/**
 * Builds the next default note title: "New note", "New note 2", "New note 3"…
 * Missing numbers are reused, so deleting "New note 3" frees that slot again.
 * Manually renamed notes simply don't participate in the sequence.
 */
export function nextDefaultNoteTitle(base: string): string {
  ensureReadyForMutation();
  const baseName = base.trim() || "New note";
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}(?:\\s+(\\d+))?$`, "i");

  const used = new Set<number>();
  for (const note of state.notes) {
    const match = pattern.exec(note.title.trim());
    if (!match) continue;
    const num = match[1] ? Number.parseInt(match[1], 10) : 1;
    if (Number.isFinite(num) && num >= 1) used.add(num);
  }

  let next = 1;
  while (used.has(next)) next += 1;
  return next === 1 ? baseName : `${baseName} ${next}`;
}

/** Fields whose change means the note content was actually modified. */
const CONTENT_FIELDS = ["title", "body", "pdf", "style"] as const;

function touchesContent(note: Note, patch: Partial<Note>): boolean {
  return CONTENT_FIELDS.some((field) => {
    if (!(field in patch)) return false;
    const next = patch[field];
    if (next === undefined) return false;
    if (field === "style" || field === "pdf") {
      return JSON.stringify({ ...(note[field] as object), ...(next as object) }) !== JSON.stringify(note[field] ?? {});
    }
    return next !== note[field];
  });
}

export function updateNote(id: string, patch: Partial<Note>) {
  ensureReadyForMutation();
  let changed = false;
  const nextNotes = state.notes.map((note) => {
    if (note.id !== id) return note;
    changed = true;
    // The modification timestamp only moves when real content changed.
    const contentChanged = touchesContent(note, patch);
    return {
      ...note,
      ...patch,
      id: note.id,
      createdAt: note.createdAt,
      style: patch.style ? { ...note.style, ...patch.style } : note.style,
      updatedAt: contentChanged ? Date.now() : note.updatedAt,
    };
  });

  if (!changed) return;
  persistNotes(nextNotes);
  commit({ notes: nextNotes, hydrated: true, status: "ready", error: null });
}

export function togglePin(id: string) {
  ensureReadyForMutation();
  let changed = false;
  const nextNotes = state.notes.map((note) => {
    if (note.id !== id) return note;
    changed = true;
    return { ...note, pinned: !note.pinned };
  });

  if (!changed) return;
  persistNotes(nextNotes);
  commit({ notes: nextNotes, hydrated: true, status: "ready", error: null });
}

export function deleteNote(id: string) {
  ensureReadyForMutation();
  const target = state.notes.find((note) => note.id === id);
  const nextNotes = state.notes.filter((note) => note.id !== id);
  if (nextNotes.length === state.notes.length) return;
  persistNotes(nextNotes);
  commit({ notes: nextNotes, hydrated: true, status: "ready", error: null });
  // Binary attachments are removed only after the note change was persisted.
  if (target?.kind === "pdf") {
    void import("./pdf-files").then((module) => module.deletePdfFile(id)).catch((error) => console.error("Unable to remove PDF", error));
  }
  if (target?.body) {
    void import("./audio-files").then(async ({ audioIdsInHtml, deleteAudioFile }) => {
      const stillUsed = new Set(nextNotes.flatMap((item) => audioIdsInHtml(item.body)));
      const ids = audioIdsInHtml(target.body).filter((audioId) => !stillUsed.has(audioId));
      await Promise.all(ids.map((audioId) => deleteAudioFile(audioId)));
    }).catch((error) => console.error("Unable to delete audio files", error));
  }
}


/** Move the notes out of a folder BEFORE its tab is removed. */
export function moveNotesToFolder(sourceId: string, destinationId = "all") {
  ensureReadyForMutation();
  if (sourceId === destinationId) return;
  const nextNotes = state.notes.map((note) =>
    note.folderId === sourceId ? { ...note, folderId: destinationId } : note,
  );
  if (nextNotes.every((note, index) => note === state.notes[index])) return;
  persistNotes(nextNotes);
  commit({ notes: nextNotes, hydrated: true, status: "ready", error: null });
}

export async function clearAll(): Promise<void> {
  ensureReadyForMutation();
  const before = state.notes;
  const pdfIds = before.filter((note) => note.kind === "pdf").map((note) => note.id);
  const [{ deletePdfFile }, { audioIdsInHtml, deleteAudioFile }] = await Promise.all([
    import("./pdf-files"), import("./audio-files"),
  ]);
  // Save the empty list before removing binary attachments: failed writes leave
  // existing notes and their files intact. Await cleanup before reporting success.
  persistNotes([]);
  commit({ notes: [], hydrated: true, status: "ready", error: null });
  const audioIds = [...new Set(before.flatMap((note) => audioIdsInHtml(note.body)))];
  const results = await Promise.allSettled([
    ...pdfIds.map((id) => deletePdfFile(id)),
    ...audioIds.map((id) => deleteAudioFile(id)),
  ]);
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length > 0) {
    console.error("Some local attachments could not be deleted", failed);
    throw new Error("Заметки удалены, но некоторые вложения удалить не удалось. Очистите данные приложения в настройках Android, чтобы удалить оставшиеся файлы.");
  }
}

export function exportNotes(): string {
  ensureReadyForMutation();
  return JSON.stringify(
    {
      version: 1,
      exportedAt: Date.now(),
      notes: state.notes,
    },
    null,
    2,
  );
}

/** Non-destructive restore: existing notes always win on ID collisions. */
export function importBackupNotes(imported: Note[]): number {
  ensureReadyForMutation();
  if (!Array.isArray(imported) || imported.length > 10000) throw new Error("Invalid notes archive");
  const ids = new Set(state.notes.map((note) => note.id));
  const additions: Note[] = [];
  for (const item of imported) {
    if (!isRecord(item) || typeof item.id !== "string" ||
        !/^[\w-]{1,128}$/.test(item.id) ||
        typeof item.body !== "string" || typeof item.title !== "string") {
      throw new Error("Corrupted note in backup");
    }
    const normalized = normalizeNote(item);
    if (!normalized) throw new Error("Corrupted note in backup");
    if (!ids.has(normalized.id)) {
      additions.push(normalized);
      ids.add(normalized.id);
    }
  }
  if (!additions.length) return 0;
  const next = [...additions, ...state.notes];
  persistNotes(next);
  commit({ notes: next, hydrated: true, status: "ready", error: null });
  return additions.length;
}
