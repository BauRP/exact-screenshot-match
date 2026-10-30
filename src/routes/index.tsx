import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  X,
  CalendarClock,
  ChevronDown,
  CalendarPlus,
  FolderPlus,
  LayoutGrid,
  List,
  MoreVertical,
  FileType2,
  Pencil,
  Copy,
  Palette,
  FolderInput,
  Share2,
  Download,
  MoreHorizontal,
  FileInput,
  Plus,
  ListChecks,
  Search,
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
  moveNoteBefore,
  type Note,
  type SortMode,
  type ViewMode,
} from "@/lib/notes-store";
import { useT } from "@/lib/i18n";
import { pickPdfFile, savePdfFile } from "@/lib/pdf-files";
import { toast } from "sonner";
import {inspectWaveFile,receiveWaveNote,shareWaveNote} from "@/lib/note-transfer";
import {findReturnedOriginal,combineReturnedBodies,replacementBackup} from "@/lib/wave-note-conflicts";
import {noteMatchesSearch,type NoteSearchFilter} from "@/lib/note-search";
import {shareNoteExport,type NoteExportFormat} from "@/lib/note-export";

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
  const [colorDialog,setColorDialog]=useState(false);
  const [moveDialog,setMoveDialog]=useState(false);
  const [exportDialog,setExportDialog]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [searchTerm,setSearchTerm]=useState("");
  const [searchAllFolders,setSearchAllFolders]=useState(false);
  const [searchFilter,setSearchFilter]=useState<NoteSearchFilter>("all");
  const [copyBusy,setCopyBusy]=useState(false);
  const [transferBusy,setTransferBusy]=useState(false);
  const [incomingWave,setIncomingWave]=useState<{file:File;title:string;originId:string;kind:"note"|"pdf"}|null>(null);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);
  // The menu floats above the list without moving folders or ads.
  // Google renders native ads above WebView; temporarily hide that overlay
  // while the popup is open so the popup remains readable and clickable.
  useEffect(() => {
    setNativeAdDialogBlocked(menuOpen || renameValue !== null || confirmDelete || Boolean(folderDialog) || exportDialog || Boolean(incomingWave) || colorDialog || moveDialog);
    return () => setNativeAdDialogBlocked(false);
  }, [menuOpen, renameValue, confirmDelete, folderDialog, exportDialog, incomingWave, colorDialog, moveDialog]);

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
  const duplicateSelectedNote = async () => {
    if(copyBusy || selectedNotes.length!==1)return;
    setCopyBusy(true);
    const original=selectedNotes[0];
    let pdfCopyId:string|null=null;
    const addedAudioIds:string[]=[];
    try{
      let body=original.body;
      const { audioIdsInHtml, loadAudioFile, saveAudioFile }=await import("@/lib/audio-files");
      for(const id of audioIdsInHtml(body)){
        const blob=await loadAudioFile(id);
        if(!blob)throw new Error("Не удалось прочитать исходную аудиозапись");
        const copiedId=await saveAudioFile(blob);
        addedAudioIds.push(copiedId);
        body=body.replaceAll(`audiodb:${id}`,`audiodb:${copiedId}`);
      }
      if(original.kind==="pdf"){
        const {loadPdfFile,saveNewPdfFile}=await import("@/lib/pdf-files");
        const file=await loadPdfFile(original.id);
        if(!file)throw new Error("Исходный PDF не найден");
        pdfCopyId=crypto.randomUUID();
        await saveNewPdfFile(pdfCopyId,file);
      }
      createNote({
        ...original,id:pdfCopyId??crypto.randomUUID(),title:original.title+" — копия",
        body,pdf:original.pdf?structuredClone(original.pdf):undefined,
        createdAt:Date.now(),updatedAt:Date.now(),
      });
      setSelected(new Set());
      toast.success("Независимая копия создана");
    }catch(error){
      const {deleteAudioFile}=await import("@/lib/audio-files");
      await Promise.allSettled(addedAudioIds.map(id=>deleteAudioFile(id)));
      if(pdfCopyId){const {deletePdfFile}=await import("@/lib/pdf-files");await deletePdfFile(pdfCopyId).catch(console.error);}
      console.error("Duplicate note failed",error);
      toast.error(error instanceof Error?error.message:"Не удалось создать копию");
    }finally{setCopyBusy(false);}
  };


  const filteredNotes = useMemo(() => notes.filter((note) => {
    const inScope=searchOpen&&searchAllFolders||activeFolder==="all"||(note.folderId??"all")===activeFolder;
    return inScope && (!searchOpen || noteMatchesSearch(note,searchTerm,searchFilter));
  }),[activeFolder,notes,searchOpen,searchAllFolders,searchTerm,searchFilter]);

  // Opens an in-memory draft: nothing is stored until the checkmark is tapped.
  const createNoteInCurrentFolder = () => {
    navigate({
      to: "/editor/$id",
      params: { id: "new" },
      search: { folder: activeFolder === "all" ? "all" : activeFolder },
    });
  };

  const createChecklistInCurrentFolder=()=>{
    navigate({to:"/editor/$id",params:{id:"new"},search:{folder:activeFolder==="all"?"all":activeFolder,template:"checklist"}});
  };
  
  const importWave=()=>{
    const picker=document.createElement("input");picker.type="file";
    picker.accept=".wnote,application/octet-stream";picker.style.display="none";
    picker.addEventListener("change",()=>{
      const file=picker.files?.[0];picker.remove();
      if(!file)return;
      void inspectWaveFile(file).then(info=>setIncomingWave({file,title:info.title,originId:info.originId,kind:info.kind}))
        .catch(error=>toast.error(error instanceof Error?error.message:"Файл Wave Notes повреждён"));
    });
    document.body.appendChild(picker);picker.click();
  };
  const returnedOriginal=incomingWave?findReturnedOriginal(notes,incomingWave.originId,incomingWave.kind):undefined;
  const doImportWave=async(mode:"copy"|"replace"|"combine"="copy")=>{
    if(!incomingWave||transferBusy)return;
    const original=findReturnedOriginal(notes,incomingWave.originId,incomingWave.kind);
    if(mode!=="copy"&&(!original||original.kind==="pdf"||incomingWave.kind==="pdf")){
      toast.error("Для PDF или без исходной заметки можно сохранить отдельную копию");return;
    }
    setTransferBusy(true);
    try{
      // Import to a fresh ID first. Original remains intact if attachment
      // extraction, storage or archive validation fails.
      const incoming=await receiveWaveNote(incomingWave.file,activeFolder==="all"?"all":activeFolder);
      if(mode==="copy"){
        toast.success("Заметка получена как отдельная копия");
      }else if(original){
        if(mode==="replace"){
          // Never replace a user's only copy: the backup is a real note,
          // saved before changing the original.
          createNote(replacementBackup(original,crypto.randomUUID()));
          updateNote(original.id,{body:incoming.body,style:incoming.style,title:incoming.title.replace(/ — получено$/,"")});
          toast.success("Исходная версия сохранена как резервная заметка");
        }else{
          updateNote(original.id,{body:combineReturnedBodies(original,incoming)});
          toast.success("Обе версии объединены. Полученная копия также сохранена");
        }
      }
      setIncomingWave(null);
    }catch(error){toast.error(error instanceof Error?error.message:"Не удалось получить заметку");}
    finally{setTransferBusy(false);}
  };
  const doExportSelected=async(format:NoteExportFormat)=>{
    if(transferBusy||selectedNotes.length!==1)return;
    setTransferBusy(true);
    try{
      await shareNoteExport(selectedNotes[0],format);
      setExportDialog(false);
      toast.success("Файл подготовлен для экспорта");
    }catch(error){toast.error(error instanceof Error?error.message:"Ошибка экспорта");}
    finally{setTransferBusy(false);}
  };
  const doShareSelected=async()=>{
    if(selectedNotes.length!==1||transferBusy)return;
    setTransferBusy(true);
    try{await shareWaveNote(selectedNotes[0]);setSelected(new Set());}
    catch(error){toast.error(error instanceof Error?error.message:"Ошибка передачи файла");}
    finally{setTransferBusy(false);}
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

    try {
      if (folderDialog.mode === "add") {
        addFolder(value,true);
      } else if (folderDialog.id) {
        renameFolder(folderDialog.id, value);
      }
      setFolderDialog(null);
    } catch(error) {
      // Don't close the rename/create dialog if Android storage is full.
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить папку");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <AppHeader
          eyebrow={t("all_notes")}
          title={t("general")}
          right={
            <>
              <button type="button" aria-label="Поиск по заметкам" aria-expanded={searchOpen}
                onClick={()=>setSearchOpen(value=>!value)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-secondary text-foreground hover:bg-secondary/70">
                <Search className="h-4 w-4"/>
              </button>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label="Дополнительные действия с заметкой"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-secondary hover:bg-secondary/70">
                        <MoreHorizontal className="h-4 w-4"/>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={6} className="w-56 rounded-xl">
                      {selected.size===1 && <DropdownMenuItem disabled={copyBusy} onClick={()=>void duplicateSelectedNote()} className="min-h-10 gap-2">
                        <Copy className="h-4 w-4"/>Создать копию
                      </DropdownMenuItem>}
                      {selected.size===1 && <DropdownMenuItem aria-label="Поделиться редактируемой заметкой" disabled={transferBusy}
                        onClick={()=>void doShareSelected()} className="min-h-10 gap-2">
                        <Share2 className="h-4 w-4"/>Поделиться заметкой
                      </DropdownMenuItem>}
                      {selected.size===1 && selectedNotes[0]?.kind!=="pdf"&&
                      <DropdownMenuItem disabled={transferBusy} onClick={()=>setExportDialog(true)} className="min-h-10 gap-2">
                        <Download className="h-4 w-4"/>Экспорт в файл
                      </DropdownMenuItem>}
                      <DropdownMenuItem onClick={()=>setColorDialog(true)} className="min-h-10 gap-2">
                        <Palette className="h-4 w-4"/>Цвет карточки
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={()=>setMoveDialog(true)} className="min-h-10 gap-2">
                        <FolderInput className="h-4 w-4"/>Переместить в папку
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                onCreateChecklist={createChecklistInCurrentFolder}
                onCreateFolder={() => setFolderDialog({ mode: "add", value: "" })}
                onImportPdf={() => void importPdf()}
                onImportWave={importWave}
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
        {searchOpen && <div className="mx-3 mt-2 rounded-xl border border-border bg-secondary/40 p-2" role="search">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground"/>
            <Input aria-label="Поиск по названию и содержимому" autoComplete="off" value={searchTerm}
              onChange={event=>setSearchTerm(event.target.value)} placeholder="Найти заметку или @todo..." className="h-10 min-w-0 flex-1"/>
            <button type="button" aria-label="Очистить поиск" className="h-10 shrink-0 px-2 text-xs text-muted-foreground"
              onClick={()=>{setSearchTerm("");setSearchFilter("all")}}>Сброс</button>
          </div>
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
            {([["all","Все"],["todo","Задачи"],["images","Фото"],["locked","Защищённые"]] as const).map(([value,label])=>
              <button key={value} type="button" aria-pressed={searchFilter===value}
                onClick={()=>setSearchFilter(value)}
                className={`min-h-9 shrink-0 rounded-full border px-3 text-xs ${searchFilter===value?"border-primary bg-primary text-primary-foreground":"border-border bg-background"}`}>{label}</button>
            )}
            {activeFolder!=="all"&&<button type="button" aria-pressed={searchAllFolders}
              onClick={()=>setSearchAllFolders(value=>!value)}
              className={`min-h-9 shrink-0 rounded-full border px-3 text-xs ${searchAllFolders?"border-primary bg-primary text-primary-foreground":"border-border bg-background"}`}>
              {searchAllFolders?"По всем папкам":"Только эта папка"}
            </button>}
          </div>
          {searchFilter==="locked"&&<p className="px-1 text-xs text-muted-foreground">Защита отдельных заметок пока не добавлена.</p>}
        </div>}

      </div>

      {hydrated && status !== "error" && filteredNotes.length === 0 ? (
        <main
          className="mx-auto w-full min-h-0 max-w-xl flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-4 [-webkit-overflow-scrolling:touch]"
          style={{ marginBottom: "var(--wave-bottom-nav-occlusion, 104px)" }}
        >
          {searchOpen ? <p className="py-8 text-center text-sm text-muted-foreground">Совпадений не найдено</p> : <NativeAdCard slotKey="home-first" />}
        </main>
      ) : (
        <main className="mx-auto w-full min-h-0 max-w-xl flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-4 [-webkit-overflow-scrolling:touch]" style={{ marginBottom: "var(--wave-bottom-nav-occlusion, 104px)" }}>
          {!hydrated ? (
            <LoadingState />
          ) : status === "error" ? (
            <DatabaseErrorState message={databaseError} />
          ) : (
            <NotesGrid view={view} notes={filteredNotes} selected={selected} onToggle={toggleSelected} onOpen={openNote}
              onMove={(id,target)=>{try{if(moveNoteBefore(id,target))toast.success("Порядок заметок сохранён");}catch(error){toast.error(error instanceof Error?error.message:"Не удалось переместить");}}} />
          )}
        </main>
      )}

      <Dialog open={Boolean(incomingWave)} onOpenChange={open=>{if(!open&&!transferBusy)setIncomingWave(null)}}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>Получить заметку Wave Notes</DialogTitle></DialogHeader>
          <p className="text-sm">{incomingWave?.title}</p>
          <p className="text-xs text-muted-foreground">
            {returnedOriginal ? "Найдена исходная заметка. Можно сохранить копию, объединить обе версии или заменить исходную с созданием резервной копии." : "Исходная заметка не найдена. Полученный файл будет сохранён отдельно; другие заметки не изменятся."}
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={transferBusy} onClick={()=>setIncomingWave(null)}>Отмена</Button>
            <Button disabled={transferBusy} onClick={()=>void doImportWave("copy")}>Сохранить копию</Button>
            {returnedOriginal?.kind!=="pdf"&&returnedOriginal&&<>
              <Button variant="outline" disabled={transferBusy} onClick={()=>void doImportWave("combine")}>Объединить</Button>
              <Button variant="destructive" disabled={transferBusy} onClick={()=>void doImportWave("replace")}>Заменить с резервной копией</Button>
            </>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={exportDialog} onOpenChange={open=>{if(!transferBusy)setExportDialog(open)}}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>Экспорт заметки</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Выберите формат копии. Галочка в редакторе по-прежнему сохраняет заметку только внутри Wave Notes.</p>
          <div className="grid gap-2">
            <Button disabled={transferBusy} variant="outline" onClick={()=>void doExportSelected("txt")}>TXT — простой текст</Button>
            <Button disabled={transferBusy} variant="outline" onClick={()=>void doExportSelected("html")}>HTML — текст с оформлением</Button>
            <Button disabled={transferBusy} variant="outline" onClick={()=>void doExportSelected("docx")}>Word (.docx) — редактируемый документ</Button>
            <Button disabled={transferBusy} variant="outline" onClick={()=>void doExportSelected("png")}>PNG — изображение заметки</Button>
          </div>
          <p className="text-xs text-muted-foreground">PNG сохраняет читаемый текст, но не интерактивные элементы. Для полного оформления и вложений используйте .wnote.</p>
        </DialogContent>
      </Dialog>
      <Dialog open={colorDialog} onOpenChange={setColorDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>Цвет карточки</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Изменяется только карточка снаружи, цвет листа внутри заметки остаётся прежним.</p>
          <div className="grid grid-cols-5 gap-3">
            {["", "#FDE68A", "#DCE8E1", "#DCE6F3", "#FFE1D7", "#EDE0F7", "#303947", "#293D33", "#3A3046", "#EFE8DF"].map(color=>
              <button type="button" key={color} aria-label={color?"Выбрать цвет "+color:"Вернуть стандартный цвет"}
                onClick={()=>{
                  try{selectedNotes.forEach(note=>updateNote(note.id,{cardColor:color||undefined}));setSelected(new Set());setColorDialog(false);toast.success("Цвет карточки изменён");}
                  catch(error){toast.error(error instanceof Error?error.message:"Не удалось изменить цвет");}
                }}
                className="h-11 rounded-xl border border-border shadow-sm"
                style={{backgroundColor:color||"#1D222B"}}>{!color&&<span className="text-xs text-white">Сброс</span>}</button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={moveDialog} onOpenChange={setMoveDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>Переместить заметку</DialogTitle></DialogHeader>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {folders.map(folder=><button type="button" key={folder.id} onClick={()=>{
              try{selectedNotes.forEach(note=>updateNote(note.id,{folderId:folder.id}));setSelected(new Set());setMoveDialog(false);toast.success("Заметки перемещены");}
              catch(error){toast.error(error instanceof Error?error.message:"Не удалось переместить");}
            }} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-secondary">{localizedFolderName(folder)}</button>)}
          </div>
        </DialogContent>
      </Dialog>
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
  onCreateChecklist,
  onCreateFolder,
  onImportPdf,
  onImportWave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: ViewMode;
  sort: SortMode;
  onCreateNote: () => void;
  onCreateChecklist: () => void;
  onCreateFolder: () => void;
  onImportPdf: () => void;
  onImportWave: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<"view" | "sort" | null>(null);
  useEffect(() => { if (!open) setExpanded(null); }, [open]);
  
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
        <DropdownMenuItem onClick={onCreateChecklist} className="gap-2 py-2.5">
          <ListChecks className="h-4 w-4 text-primary"/>
          Создать список дел
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCreateFolder} className="gap-2 py-2.5">
          <FolderPlus className="h-4 w-4 text-primary" />
          {t("add_folder")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onImportPdf} className="gap-2 py-2.5">
          <FileType2 className="h-4 w-4 text-destructive" />
          {t("add_pdf")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onImportWave} className="gap-2 py-2.5">
          <FileInput className="h-4 w-4 text-primary"/>
          Получить заметку Wave Notes
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <button type="button" aria-expanded={expanded === "view"} aria-controls="wave-view-options"
          onClick={() => setExpanded(v => v === "view" ? null : "view")}
          className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-secondary/60">
          {t("view")} <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-150 ${expanded === "view" ? "rotate-180" : ""}`}/>
        </button>
        {expanded === "view" && (
          <div id="wave-view-options" className="pl-2">
            <ViewItem current={view} value="list" label={t("list")} icon={<List className="h-4 w-4" />} />
            <ViewItem current={view} value="grid" label={t("grid")} icon={<LayoutGrid className="h-4 w-4" />} />
            <ViewItem current={view} value="table" label={t("table")} icon={<Table2 className="h-4 w-4" />} />
          </div>
        )}
        <button type="button" aria-expanded={expanded === "sort"} aria-controls="wave-sort-options"
          onClick={() => setExpanded(v => v === "sort" ? null : "sort")}
          className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-secondary/60">
          {t("sort")} <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-150 ${expanded === "sort" ? "rotate-180" : ""}`}/>
        </button>
        {expanded === "sort" && (
          <div id="wave-sort-options" className="pl-2">
            <SortItem current={sort} value="created" label={t("by_created")} icon={<CalendarPlus className="h-4 w-4" />} />
            <SortItem current={sort} value="updated" label={t("by_updated")} icon={<CalendarClock className="h-4 w-4" />} />
            <SortItem current={sort} value="alpha" label={t("alpha")} icon={<ArrowDownAZ className="h-4 w-4" />} />
            <SortItem current={sort} value="manual" label="Мой порядок" icon={<List className="h-4 w-4" />} />
          </div>
        )}
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
  onMove,
}: {
  view: ViewMode;
  notes: Note[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (note: Note) => void;
  onMove: (sourceId:string,targetId:string) => void;
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
            onMove={targetId=>onMove(note.id,targetId)}
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
