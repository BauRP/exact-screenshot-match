import {validReminderTime} from "./note-reminders";
import { useSyncExternalStore } from "react";
import { markBackupDirty } from "./backup-signals";
import { NEW_NOTE_YELLOW,NEW_NOTE_INK } from "./note-appearance";
import { validPaperMood,validPaperRule } from "./note-paper";
import {validReminderRepeat,nextRecurringReminder,type ReminderRepeat} from "./note-reminders";

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
  /** Exact source text rectangle to erase after a genuine edit. Keep independent of ruler changes. */
  eraseXPct?: number;
  eraseYPct?: number;
  eraseWidthPct?: number;
  eraseHeightPct?: number;
  /** Sampled uniform background behind the source glyphs when available. */
  eraseColor?: string;
  sourceFontId?: string;
  sourceFontName?: string;
  sourceFontCss?: string;
  sourceFontExact?: boolean;
  sourceBaselinePct?: number;
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
  reminderAt?: number;
  reminderRepeat?: ReminderRepeat;
  folderId?: string;
  cardColor?: string;
  manualOrder?: number;
  /** Original note ID in a transferred .wnote copy. */
  originId?: string;
  kind?: NoteKind;
  pdf?: PdfMeta;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    background?: string;
    paperMood?: import("./note-paper").PaperMood;
    paperRule?: import("./note-paper").PaperRule;
  };
};


export type ViewMode = "list" | "grid" | "table";
export type SortMode = "created" | "updated" | "alpha" | "manual";
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
/** Latest notes bytes accepted by this instance. Protect against stale writes from
 * another browser tab or a restore performed while this editor was open. */
let lastStoredNotesRaw: string | null = null;
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
        paperMood: validPaperMood(rawStyle.paperMood) ? rawStyle.paperMood : undefined,
        paperRule: validPaperRule(rawStyle.paperRule) ? rawStyle.paperRule : undefined,
      }
    : undefined;

  return {
    id,
    title,
    body,
    createdAt,
    updatedAt,
    pinned: input.pinned === true,
    reminderAt: validReminderTime(input.reminderAt),
    reminderRepeat: validReminderRepeat(input.reminderRepeat),
    folderId,
    cardColor: typeof input.cardColor === "string" && /^#[0-9a-f]{6}$/i.test(input.cardColor) ? input.cardColor : undefined,
    manualOrder: typeof input.manualOrder === "number" && Number.isSafeInteger(input.manualOrder) && input.manualOrder>=0 ? input.manualOrder : undefined,
    originId: typeof input.originId === "string" && /^[\w-]{1,128}$/.test(input.originId) ? input.originId : undefined,
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

/** Reject records whose identity or body would be fabricated by normalization.
 * Otherwise a subsequent save could overwrite another note or silently erase
 * an existing body. Keep the original localStorage bytes untouched on error. */
export function parseStoredNotes(raw: string | null): Note[] {
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Unexpected notes database format");
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() ||
          typeof item.body !== "string" || (item.title !== undefined && typeof item.title !== "string")) {
        throw new Error("Invalid note identity or text body");
      }
      if (seen.has(item.id)) throw new Error("Duplicate note identity");
      seen.add(item.id);
    }
    return parsed.map(item => normalizeNote(item)!);
  } catch {
    throw new Error("Saved notes could not be parsed. Original data is preserved.");
  }
}

function parseStoredView(raw: string | null): ViewMode {
  return raw === "grid" || raw === "table" || raw === "list" ? raw : DEFAULT_VIEW;
}

function parseStoredSort(raw: string | null): SortMode {
  return raw === "created" || raw === "alpha" || raw === "updated" || raw === "manual" ? raw : DEFAULT_SORT;
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
    // Optimistic concurrency: another tab or restore may have changed the
    // database since this instance loaded it. Never silently overwrite it.
    const current=window.localStorage.getItem(NOTES_KEY);
    if(current!==lastStoredNotesRaw)throw new Error(
      "Notes changed in another window or after a restore. Reopen the app before saving.");
    const serialized=JSON.stringify(nextNotes);
    window.localStorage.setItem(NOTES_KEY,serialized);
    lastStoredNotesRaw=serialized;
    // This occurs only after a committed save, never on editor onUpdate.
    markBackupDirty();
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

  const notes=parseStoredNotes(rawNotes);
  // Only a fully validated database becomes our write baseline.
  lastStoredNotesRaw=rawNotes;
  return {
    notes,
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

/** Pinned notes stay first, while the selected sort mode applies equally
 * inside pinned and unpinned groups. Manual order never crosses pin groups. */
export function sortNotes(list: Note[], mode: SortMode): Note[] {
 const compare=(a:Note,b:Note):number=>{
  if(mode==="manual")return (a.manualOrder??Number.MAX_SAFE_INTEGER)-(b.manualOrder??Number.MAX_SAFE_INTEGER)||b.updatedAt-a.updatedAt;
  if(mode==="alpha")return a.title.localeCompare(b.title,"ru",{sensitivity:"base"});
  if(mode==="created")return b.createdAt-a.createdAt;
  return b.updatedAt-a.updatedAt;
 };
 return [
  ...list.filter(note=>note.pinned).sort(compare),
  ...list.filter(note=>!note.pinned).sort(compare),
 ];
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

/** Move one saved note without affecting native ad slots or binary files. */
export function moveNoteBefore(sourceId:string,targetId:string):boolean{
 ensureReadyForMutation();
 if(sourceId===targetId)return false;
 const ordered=sortNotes(state.notes,state.sort);
 const from=ordered.findIndex(x=>x.id===sourceId),to=ordered.findIndex(x=>x.id===targetId);
 if(from<0||to<0)return false;
 if(ordered[from].pinned!==ordered[to].pinned||ordered[from].folderId!==ordered[to].folderId)return false;
 const [moving]=ordered.splice(from,1);
 ordered.splice(ordered.findIndex(x=>x.id===targetId),0,moving);
 const ranks=new Map(ordered.map((note,k)=>[note.id,k]));
 const next=state.notes.map(note=>({...note,manualOrder:ranks.get(note.id)}));
 persistNotes(next);commit({notes:next,sort:"manual",status:"ready"});persistPreference(SORT_KEY,"manual");
 return true;
}
/** Move a multi-selection to the start or end of its OWN folder and pin
 * group. One write, no modifications to note content or attachment references.
 * This also works when the user was previously sorting by date or alphabet. */
export function moveSelectedNotesToEdge(noteIds:readonly string[],edge:"top"|"bottom"):number{
 ensureReadyForMutation();
 if(edge!=="top"&&edge!=="bottom")return 0;
 const ids=new Set(noteIds);
 if(!ids.size)return 0;
 const sorted=sortNotes(state.notes,state.sort);
 const groups=new Map<string,Note[]>();
 for(const note of sorted){
  const key=JSON.stringify([note.folderId??"all",Boolean(note.pinned)]);
  const group=groups.get(key)||[];
  group.push(note);
  groups.set(key,group);
 }
 const ranks=new Map<string,number>();
 let changed=0,rank=0;
 for(const group of groups.values()){
  const selected=group.filter(note=>ids.has(note.id));
  const rest=group.filter(note=>!ids.has(note.id));
  const ordered=edge==="top"?[...selected,...rest]:[...rest,...selected];
  for(let i=0;i<ordered.length;i++)if(ordered[i]!==group[i])changed++;
  for(const note of ordered)ranks.set(note.id,rank++);
 }
 if(!changed)return 0;
 const next=state.notes.map(note=>({...note,manualOrder:ranks.get(note.id)}));
 persistNotes(next);
 commit({notes:next,sort:"manual",hydrated:true,status:"ready",error:null});
 persistPreference(SORT_KEY,"manual");
 return changed;
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
    reminderAt: validReminderTime(partial?.reminderAt),
    reminderRepeat: validReminderRepeat(partial?.reminderRepeat),
    folderId: partial?.folderId ?? "all",
    cardColor: partial?.cardColor,
    manualOrder: partial?.manualOrder,
    originId: partial?.originId,
    kind: partial?.kind ?? "note",
    pdf: partial?.pdf,
    // Only brand-new text notes inherit yellow paper. Imported/older saved
    // notes are normalized without this default and keep their own backgrounds.
    style: partial?.style ?? (partial?.kind === "pdf" ? undefined : {
      background: NEW_NOTE_YELLOW, color: NEW_NOTE_INK,
    }),

  };
  if(state.notes.some(existing=>existing.id===note.id)){
    throw new Error("Duplicate note ID: existing saved note will not be replaced.");
  }
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
const CONTENT_FIELDS = ["title", "body", "pdf", "style", "reminderAt", "reminderRepeat"] as const;

function touchesContent(note: Note, patch: Partial<Note>): boolean {
  return CONTENT_FIELDS.some((field) => {
    if (!(field in patch)) return false;
    const next = patch[field];
    // Clearing a saved reminder is a real edit, not a no-op.
    if (field === "reminderAt" || field === "reminderRepeat") return next !== note[field];
    if (next === undefined) return false;
    if (field === "style" || field === "pdf") {
      return JSON.stringify({ ...(note[field] as object), ...(next as object) }) !== JSON.stringify(note[field] ?? {});
    }
    return next !== note[field];
  });
}

/**
 * Reclaim binary files only after the new note body has been durably stored.
 * A second live-reference check protects files still shared by copied notes.
 * Cleanup failures are logged, never converted into false "Save failed" UI.
 */
async function reclaimDetachedAttachments(previousBody:string):Promise<void>{
  if(!previousBody)return;
  try{
    const [{audioIdsInHtml,deleteAudioFile},{imageIdsInHtml,deleteImageFile}]=await Promise.all([
      import("./audio-files"),import("./image-files"),
    ]);
    const usedAudio=new Set(state.notes.flatMap(note=>audioIdsInHtml(note.body)));
    const usedImages=new Set(state.notes.flatMap(note=>imageIdsInHtml(note.body)));
    const staleAudio=[...new Set(audioIdsInHtml(previousBody))].filter(id=>!usedAudio.has(id));
    const staleImages=[...new Set(imageIdsInHtml(previousBody))].filter(id=>!usedImages.has(id));
    // Recheck once against the latest state; it may have changed while
    // IndexedDB was opening (e.g. a copied note restored a reference).
    const latestAudio=new Set(state.notes.flatMap(note=>audioIdsInHtml(note.body)));
    const latestImages=new Set(state.notes.flatMap(note=>imageIdsInHtml(note.body)));
    const results=await Promise.allSettled([
      ...staleAudio.filter(id=>!latestAudio.has(id)).map(id=>deleteAudioFile(id)),
      ...staleImages.filter(id=>!latestImages.has(id)).map(id=>deleteImageFile(id)),
    ]);
    for(const result of results)if(result.status==="rejected")
      console.error("Unable to reclaim unused note attachment",result.reason);
  }catch(error){console.error("Unused attachment cleanup failed",error);}
}

export function updateNote(id: string, patch: Partial<Note>) {
  ensureReadyForMutation();
  const oldBody=state.notes.find(note=>note.id===id)?.body;
  let changed = false;
  const nextNotes = state.notes.map((note) => {
    if (note.id !== id) return note;
    changed = true;
    // The modification timestamp only moves when real content changed.
    const contentChanged = touchesContent(note, patch);
    const candidate:Note={
      ...note,
      ...patch,
      id: note.id,
      createdAt: note.createdAt,
      style: patch.style ? { ...note.style, ...patch.style } : note.style,
      updatedAt: contentChanged ? Date.now() : note.updatedAt,
    };
    // Saving an unchanged editor draft must not rewrite storage, trigger a
    // backup, or falsely move the note's modification timestamp.
    if(!contentChanged && JSON.stringify(candidate)===JSON.stringify(note))return note;
    return candidate;
  });

  if (!changed) return;
  if(nextNotes.every((note,index)=>note===state.notes[index]))return;
  persistNotes(nextNotes);
  commit({ notes: nextNotes, hydrated: true, status: "ready", error: null });
  if(typeof patch.body==="string"&&oldBody!==undefined&&patch.body!==oldBody){
    void reclaimDetachedAttachments(oldBody);
  }
}

/** Reschedule every overdue reminder in the active folder atomically.
 * No other note content or attachment is touched. A failed localStorage write
 * leaves the entire original group intact. */
/** Complete a reminder; recurring dates advance to the next future local
 * appointment. Single reminder dates are cleared. */
export function completeNoteReminder(id:string,now=Date.now()):boolean{
 ensureReadyForMutation();
 const note=state.notes.find(n=>n.id===id);
 if(!note||note.reminderAt===undefined||note.reminderAt>now)return false;
 const nextAt=note.reminderRepeat?nextRecurringReminder(note.reminderAt,note.reminderRepeat,now):undefined;
 const next=state.notes.map(n=>n.id===id?{...n,reminderAt:nextAt,updatedAt:now}:n);
 persistNotes(next);
 commit({notes:next,hydrated:true,status:"ready",error:null});
 return true;
}

/** Complete due reminders in the selected folder in ONE durable transaction.
 * A recurring reminder advances to its next local calendar occurrence.
 * No other note bodies or attachments are touched on success or failure. */
export function completeOverdueReminders(folderId:string,now=Date.now()):number{
 ensureReadyForMutation();
 if(!Number.isFinite(now))return 0;
 let changed=0;
 const next=state.notes.map(note=>{
  if((folderId!=="all"&&(note.folderId??"all")!==folderId)||
    note.reminderAt===undefined||note.reminderAt>now)return note;
  const nextAt=note.reminderRepeat?nextRecurringReminder(note.reminderAt,note.reminderRepeat,now):undefined;
  changed++;
  return {...note,reminderAt:nextAt,updatedAt:now};
 });
 if(!changed)return 0;
 persistNotes(next);
 commit({notes:next,hydrated:true,status:"ready",error:null});
 return changed;
}

export function snoozeOverdueReminders(folderId:string,newTime:number,now=Date.now()):number{
 ensureReadyForMutation();
 const reminder=validReminderTime(newTime);
 if(reminder===undefined||!Number.isFinite(now)||reminder<=now)return 0;
 let changed=0;
 const next=state.notes.map(note=>{
  if((folderId!=="all"&&(note.folderId??"all")!==folderId)||
     note.reminderAt===undefined||note.reminderAt>now)return note;
  changed++;
  return {...note,reminderAt:reminder,updatedAt:now};
 });
 if(!changed)return 0;
 persistNotes(next);
 commit({notes:next,hydrated:true,status:"ready",error:null});
 return changed;
}

/** Pin or unpin the current selection in a single durable write. The
 * note text, original timestamps and all binary attachments remain intact. */
export function setSelectedNotesPinned(noteIds:readonly string[],pinned:boolean):number{
 ensureReadyForMutation();
 const ids=new Set(noteIds);
 if(!ids.size)return 0;
 let changed=0;
 const next=state.notes.map(note=>{
  if(!ids.has(note.id)||Boolean(note.pinned)===pinned)return note;
  changed++;
  return {...note,pinned};
 });
 if(!changed)return 0;
 persistNotes(next);
 commit({notes:next,hydrated:true,status:"ready",error:null});
 return changed;
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
  // Binary cleanup never affects still-referenced files in another note.
  if (target?.kind === "pdf") {
    void import("./pdf-files").then(module=>module.deletePdfFile(id))
      .catch(error=>console.error("Unable to remove PDF",error));
  }
  if(target?.body)void reclaimDetachedAttachments(target.body);
}


/** Delete a selected group in ONE durable storage write. Binary attachments
 * are reclaimed only after the new note list is safely persisted. */
export function deleteSelectedNotes(noteIds:readonly string[]):number{
 ensureReadyForMutation();
 const ids=new Set(noteIds);
 if(!ids.size)return 0;
 const removed=state.notes.filter(note=>ids.has(note.id));
 if(!removed.length)return 0;
 const next=state.notes.filter(note=>!ids.has(note.id));
 persistNotes(next);
 commit({notes:next,hydrated:true,status:"ready",error:null});
 for(const note of removed){
  if(note.kind==="pdf"){
   void import("./pdf-files").then(module=>module.deletePdfFile(note.id))
    .catch(error=>console.error("Unable to remove PDF",error));
  }
  if(note.body)void reclaimDetachedAttachments(note.body);
 }
 return removed.length;
}

/** Single durable write for a multi-selection. If storage rejects the
 * change, none of the selected notes is modified in memory or on screen. */
export function moveSelectedNotesToFolder(noteIds:readonly string[],destinationId:string):number {
 ensureReadyForMutation();
 if(!destinationId||destinationId.length>128)return 0;
 const ids=new Set(noteIds);
 if(!ids.size)return 0;
 let changed=0;
 const next=state.notes.map(note=>{
  if(!ids.has(note.id)||note.folderId===destinationId)return note;
  changed++;
  return {...note,folderId:destinationId};
 });
 if(!changed)return 0;
 persistNotes(next);
 commit({notes:next,hydrated:true,status:"ready",error:null});
 return changed;
}
/** Persist card colours for the entire selection atomically. The inner paper,
 * timestamps and binary attachments are never modified. */
export function setSelectedNotesCardColor(noteIds:readonly string[],color:string|undefined):number {
 ensureReadyForMutation();
 if(color!==undefined&&!/^#[0-9a-f]{6}$/i.test(color))return 0;
 const ids=new Set(noteIds);
 if(!ids.size)return 0;
 let changed=0;
 const next=state.notes.map(note=>{
  if(!ids.has(note.id)||note.cardColor===color)return note;
  changed++;
  return {...note,cardColor:color};
 });
 if(!changed)return 0;
 persistNotes(next);
 commit({notes:next,hydrated:true,status:"ready",error:null});
 return changed;
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
  const [{ deletePdfFile }, { audioIdsInHtml, deleteAudioFile }, { imageIdsInHtml,deleteImageFile }] = await Promise.all([
    import("./pdf-files"), import("./audio-files"), import("./image-files"),
  ]);
  // Save the empty list before removing binary attachments: failed writes leave
  // existing notes and their files intact. Await cleanup before reporting success.
  persistNotes([]);
  commit({ notes: [], hydrated: true, status: "ready", error: null });
  const audioIds = [...new Set(before.flatMap((note) => audioIdsInHtml(note.body)))];
  const imageIds = [...new Set(before.flatMap(note=>imageIdsInHtml(note.body)))];
  const results = await Promise.allSettled([
    ...pdfIds.map((id) => deletePdfFile(id)),
    ...audioIds.map((id) => deleteAudioFile(id)),
    ...imageIds.map(id=>deleteImageFile(id)),
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
