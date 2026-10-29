import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  X,
  CalendarClock,
  CalendarPlus,
  FolderPlus,
  LayoutGrid,
  List,
  MoreVertical,
  FileType2,
  Pencil,
  Plus,
  Table2,
  Trash2,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useLongPress } from "@/hooks/use-long-press";
import { BottomNav } from "@/components/BottomNav";
import { NoteCard } from "@/components/NoteCard";
import { NativeAdCard } from "@/components/NativeAdCard";
import { setNativeAdDialogBlocked } from "@/lib/native-ad-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  addFolder,
  deleteFolder,
  isSystemFolder,
  renameFolder,
  setActiveFolder,
  useActiveFolder,
  useFolders,
  type Folder,
} from "@/lib/folders-store";
import {
  createNote,
  moveNotesToFolder,
  deleteNote,
  updateNote,
  setSort,
  setView,
  useHydrated,
  useNotes,
  useNotesDatabaseError,
  useNotesDatabaseStatus,
  useSort,
  useView,
  type Note,
  type SortMode,
  type ViewMode,
} from "@/lib/notes-store";
import { useT } from "@/lib/i18n";
import { pickPdfFile, savePdfFile } from "@/lib/pdf-files";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wave Notes — Notes and PDFs" },
      { name: "description", content: "Organize notes and PDFs in Wave Notes, your offline notebook." },
      { property: "og:title", content: "Wave Notes — Notes and PDFs" },
      { property: "og:description", content: "Organize notes and PDFs in Wave Notes, your offline notebook." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type FolderDialogState = {
  mode: "add" | "rename";
  id?: string;
  value: string;
} | null;

function Index() {
  const notes = useNotes();
  const hydrated = useHydrated();
  const status = useNotesDatabaseStatus();
  const databaseError = useNotesDatabaseError();
  const view = useView();
  const sort = useSort();
  const folders = useFolders();
  const activeFolder = useActiveFolder();
  const navigate = useNavigate();
  const t = useT();

  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);
  // The menu floats above the list without moving folders or ads.
  // Google renders native ads above WebView; temporarily hide that overlay
  // while the popup is open so the popup remains readable and clickable.
  useEffect(() => {
    setNativeAdDialogBlocked(menuOpen || renameValue !== null || confirmDelete || Boolean(folderDialog));
    return () => setNativeAdDialogBlocked(false);
  }, [menuOpen, renameValue, confirmDelete, folderDialog]);

  // Selection is scoped to the folder being viewed and to notes that still exist.
  useEffect(() => setSelected(new Set()), [activeFolder]);
  useEffect(() => {
    setSelected((cur) => {
      const ids = new Set(notes.map((n) => n.id));
      const next = new Set([...cur].filter((id) => ids.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [notes]);

  const toggleSelected = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openNote = (note: Note) =>
    note.kind === "pdf"
      ? navigate({ to: "/pdf/$id", params: { id: note.id } })
      : navigate({ to: "/editor/$id", params: { id: note.id }, search: { folder: undefined } });

  const selectedNotes = notes.filter((n) => selected.has(n.id));


  const filteredNotes = useMemo(() => {
    if (activeFolder === "all") return notes;
    return notes.filter((note) => (note.folderId ?? "all") === activeFolder);
  }, [activeFolder, notes]);

  // Opens an in-memory draft: nothing is stored until the checkmark is tapped.
  const createNoteInCurrentFolder = () => {
    navigate({
      to: "/editor/$id",
      params: { id: "new" },
      search: { folder: activeFolder === "all" ? "all" : activeFolder },
    });
  };

  const importPdf = async () => {
    const file = await pickPdfFile();
    if (!file) return;

    let importedPdfId: string | null = null;
    try {
      const buffer = await file.arrayBuffer();
      const { PDFDocument } = await import("pdf-lib");
      const document = await PDFDocument.load(buffer, { ignoreEncryption: true });

      const pdfId = crypto.randomUUID();
      await savePdfFile(pdfId, buffer);
      importedPdfId = pdfId;
      const note = createNote({
        id: pdfId,
        kind: "pdf",
        title: file.name.replace(/\.pdf$/i, "") || "PDF",
        folderId: activeFolder === "all" ? "all" : activeFolder,
        pdf: {
          fileName: file.name,
          size: file.size,
          pageCount: document.getPageCount(),
          author: document.getAuthor() || undefined,
          producer: document.getProducer() || undefined,
          createdAt: document.getCreationDate()?.getTime() ?? file.lastModified,
          favorite: false,
          overlays: [],
        },
      });

      importedPdfId = null;
      navigate({ to: "/pdf/$id", params: { id: note.id } });
    } catch (error) {
      if (importedPdfId) {
        const { deletePdfFile } = await import("@/lib/pdf-files");
        await deletePdfFile(importedPdfId).catch(console.error);
      }
      console.error(error);
      toast.error("Не удалось открыть PDF-файл");
    }
  };

  const localizedFolderName = (folder: Folder) => {
    if (folder.id === "all") return t("folder_all");
    if (folder.id === "work") return t("folder_work");
    if (folder.id === "home") return t("folder_home");
    return folder.name;
  };

  const saveFolderDialog = () => {
    if (!folderDialog) return;
    const value = folderDialog.value.trim();
    if (!value) return;

    if (folderDialog.mode === "add") {
      const folder = addFolder(value);
      setActiveFolder(folder.id);
    } else if (folderDialog.id) {
      renameFolder(folderDialog.id, value);
    }

    setFolderDialog(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <AppHeader
          eyebrow={t("all_notes")}
          title={t("general")}
          right={
            <>
              {selected.size > 0 && (
                <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                  {selected.size === 1 && (
                    <button
                      type="button"
                      aria-label={t("rename")}
                      onClick={() => setRenameValue(selectedNotes[0]?.title ?? "")}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-secondary text-foreground transition-colors hover:bg-secondary/70"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={t("delete")}
                    onClick={() => setConfirmDelete(true)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-destructive/40 bg-destructive/15 text-destructive transition-colors hover:bg-destructive/25"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
              <TopContextMenu
                open={menuOpen}
                onOpenChange={setMenuOpen}
                view={view}
                sort={sort}
                onCreateNote={createNoteInCurrentFolder}
                onCreateFolder={() => setFolderDialog({ mode: "add", value: "" })}
                onImportPdf={() => void importPdf()}
              />
            </>
          }
        />

        <TopFolderTabs
          folders={folders}
          activeFolder={activeFolder}
          getLabel={localizedFolderName}
          onSelect={setActiveFolder}
          onRename={(folder) => setFolderDialog({ mode: "rename", id: folder.id, value: folder.name })}
          onDelete={(folder) => {
            try {
              moveNotesToFolder(folder.id);
              deleteFolder(folder.id);
              toast.success("Заметки перемещены в общую папку");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Не удалось удалить папку");
            }
          }}
        />

      </div>

      {hydrated && status !== "error" && filteredNotes.length === 0 ? (
        <main className="mx-auto w-full min-h-0 max-w-xl flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-4" style={{ marginBottom: "var(--wave-bottom-nav-occlusion, 104px)" }}><NativeAdCard slotKey="home-first" /></main>
      ) : (
        <main className="mx-auto w-full min-h-0 max-w-xl flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-4 [-webkit-overflow-scrolling:touch]" style={{ marginBottom: "var(--wave-bottom-nav-occlusion, 104px)" }}>
          {!hydrated ? (
            <LoadingState />
          ) : status === "error" ? (
            <DatabaseErrorState message={databaseError} />
          ) : (
            <NotesGrid view={view} notes={filteredNotes} selected={selected} onToggle={toggleSelected} onOpen={openNote} />
          )}
        </main>
      )}

      <Dialog open={!!folderDialog} onOpenChange={(open) => !open && setFolderDialog(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{folderDialog?.mode === "rename" ? t("rename") : t("new_folder")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={t("folder_name")}
            value={folderDialog?.value ?? ""}
            onChange={(event) => setFolderDialog((current) => (current ? { ...current, value: event.target.value } : current))}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveFolderDialog();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFolderDialog(null)}>
              {t("cancel")}
            </Button>
            <Button onClick={saveFolderDialog} disabled={!folderDialog?.value.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameValue !== null} onOpenChange={(open) => !open && setRenameValue(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("rename")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue ?? ""}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && renameValue?.trim() && document.getElementById("rename-save")?.click()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameValue(null)}>{t("cancel")}</Button>
            <Button
              id="rename-save"
              disabled={!renameValue?.trim()}
              onClick={() => {
                const target = selectedNotes[0];
                if (target && renameValue?.trim()) updateNote(target.id, { title: renameValue.trim() });
                setRenameValue(null);
                setSelected(new Set());
              }}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center">{t("delete")} ({selected.size})?</DialogTitle>
          </DialogHeader>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="rounded-full" onClick={() => setConfirmDelete(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              className="rounded-full"
              onClick={() => {
                try {
                  selected.forEach((id) => deleteNote(id));
                  setSelected(new Set());
                  setConfirmDelete(false);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Ошибка удаления");
                }
              }}
            >
              {t("delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}

function TopContextMenu({
  open,
  onOpenChange,
  view,
  sort,
  onCreateNote,
  onCreateFolder,
  onImportPdf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: ViewMode;
  sort: SortMode;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onImportPdf: () => void;
}) {
  const t = useT();

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("menu")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary/60 text-foreground transition-colors hover:bg-secondary active:scale-95"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} collisionPadding={12} className="w-56 origin-top-right rounded-2xl">
        <DropdownMenuItem onClick={onCreateNote} className="gap-2 py-2.5">
          <Plus className="h-4 w-4 text-primary" />
          {t("add_note")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCreateFolder} className="gap-2 py-2.5">
          <FolderPlus className="h-4 w-4 text-primary" />
          {t("add_folder")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onImportPdf} className="gap-2 py-2.5">
          <FileType2 className="h-4 w-4 text-destructive" />
          {t("add_pdf")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{t("view")}</DropdownMenuLabel>
        <ViewItem current={view} value="list" label={t("list")} icon={<List className="h-4 w-4" />} />
        <ViewItem current={view} value="grid" label={t("grid")} icon={<LayoutGrid className="h-4 w-4" />} />
        <ViewItem current={view} value="table" label={t("table")} icon={<Table2 className="h-4 w-4" />} />
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{t("sort")}</DropdownMenuLabel>
        <SortItem current={sort} value="created" label={t("by_created")} icon={<CalendarPlus className="h-4 w-4" />} />
        <SortItem current={sort} value="updated" label={t("by_updated")} icon={<CalendarClock className="h-4 w-4" />} />
        <SortItem current={sort} value="alpha" label={t("alpha")} icon={<ArrowDownAZ className="h-4 w-4" />} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopFolderTabs({
  folders,
  activeFolder,
  getLabel,
  onSelect,
  onRename,
  onDelete,
}: {
  folders: Folder[];
  activeFolder: string;
  getLabel: (folder: Folder) => string;
  onSelect: (folderId: string) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}) {
  const allFolder = folders.find((folder) => folder.id === "all");
  const primaryFolders = folders.filter((folder) => folder.id === "work" || folder.id === "home");
  const customFolders = folders.filter((folder) => folder.id !== "all" && folder.id !== "work" && folder.id !== "home");

  return (
    <div className="mt-3 mb-1 flex items-center gap-2 pl-3 pr-0">
      {/* "ALL" is pinned to the left edge; sibling tabs slide underneath it. */}
      {allFolder && (
        <FolderTab
          key={allFolder.id}
          folder={allFolder}
          label={getLabel(allFolder)}
          active={activeFolder === allFolder.id}
          onSelect={() => onSelect(allFolder.id)}
          onRename={() => onRename(allFolder)}
          onDelete={() => onDelete(allFolder)}
          className="sticky left-0 z-10 bg-background"
        />
      )}
      <div
        className="no-scrollbar relative flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain pr-3 [touch-action:pan-x]"
        role="tablist"
        aria-label="Notes folders"
      >
        {primaryFolders.map((folder) => (
          <FolderTab
            key={folder.id}
            folder={folder}
            label={getLabel(folder)}
            active={activeFolder === folder.id}
            onSelect={() => onSelect(folder.id)}
            onRename={() => onRename(folder)}
            onDelete={() => onDelete(folder)}
          />
        ))}
        {customFolders.map((folder) => (
          <FolderTab
            key={folder.id}
            folder={folder}
            label={getLabel(folder)}
            active={activeFolder === folder.id}
            onSelect={() => onSelect(folder.id)}
            onRename={() => onRename(folder)}
            onDelete={() => onDelete(folder)}
          />
        ))}
      </div>
    </div>
  );
}

function FolderTab({
  folder,
  label,
  active,
  onSelect,
  onRename,
  onDelete,
  className,
}: {
  folder: Folder;
  label: string;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  className?: string;
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);

  // The "ALL" tab is immune to long-press / delete actions.
  const canModify = folder.id !== "all";
  const canRename = !isSystemFolder(folder.id);

  const longPress = useLongPress({
    delay: 450,
    onLongPress: () => {
      if (!canModify) return;
      if (navigator.vibrate) navigator.vibrate(15);
      setMenuOpen(true);
    },
    onClick: () => onSelect(),
  });

  return (
    <div className={`relative flex h-9 shrink-0 items-center ${className ?? ""}`}>
      <button
        type="button"
        role="tab"
        aria-selected={active}
        {...longPress}
        onContextMenu={(event) => {
          if (!canModify) return;
          event.preventDefault();
          setMenuOpen(true);
        }}
        className={`box-border m-0 inline-flex h-9 items-center justify-center border-solid leading-none select-none rounded-full border px-4 text-xs font-semibold uppercase tracking-wider transition-colors active:scale-95 ${
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
        }`}
      >
        {label}
      </button>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="w-[min(19rem,calc(100vw-2.5rem))] max-w-[19rem] rounded-2xl p-5">
          <div className="text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-destructive/15">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <h2 className="mt-3 font-display text-base font-semibold">{t("delete")}?</h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              className="h-10 rounded-xl text-sm"
              onClick={() => setMenuOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              className="h-10 rounded-xl text-sm"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              {t("delete")}
            </Button>
          </div>

          {canRename && (
            <button
              type="button"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:bg-secondary"
              onClick={() => {
                setMenuOpen(false);
                onRename();
              }}
            >
              <Pencil className="h-3.5 w-3.5 text-primary" />
              {t("rename")}
            </button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


function ViewItem({ current, value, label, icon }: { current: ViewMode; value: ViewMode; label: string; icon: React.ReactNode }) {
  const active = current === value;
  return (
    <DropdownMenuItem onClick={() => setView(value)} className={`gap-2 py-2.5 ${active ? "text-primary" : ""}`}>
      {icon}
      {label}
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
    </DropdownMenuItem>
  );
}

function SortItem({ current, value, label, icon }: { current: SortMode; value: SortMode; label: string; icon: React.ReactNode }) {
  const active = current === value;
  return (
    <DropdownMenuItem onClick={() => setSort(value)} className={`gap-2 py-2.5 ${active ? "text-primary" : ""}`}>
      {icon}
      {label}
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
    </DropdownMenuItem>
  );
}

function NotesGrid({
  view,
  notes,
  selected,
  onToggle,
  onOpen,
}: {
  view: ViewMode;
  notes: Note[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (note: Note) => void;
}) {
  return (
    <div className={view === "grid"
      ? "grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
      : view === "table"
        ? "flex flex-col gap-2"
        : "flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3"}>
      <div className="col-span-full min-w-0"><NativeAdCard slotKey="home-first" /></div>
      {notes.map((note, index) => (
        <Fragment key={note.id}>
          <NoteCard
            note={note}
            view={view}
            selected={selected.has(note.id)}
            selectionMode={selected.size > 0}
            onToggle={() => onToggle(note.id)}
            onOpen={() => onOpen(note)}
          />
          {(index + 1) % 5 === 0 && (
            <div className="col-span-full min-w-0">
              <NativeAdCard slotKey={`home-after-${Math.floor((index + 1) / 5) * 5}`} />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto mt-16 flex max-w-sm flex-col items-center text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  );
}

function DatabaseErrorState({ message }: { message: string | null }) {
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-center">
      <h2 className="font-display text-lg font-semibold text-destructive">Storage error</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message ?? "Local notes storage could not be opened."}</p>
    </div>
  );
}
