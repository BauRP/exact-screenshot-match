import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveAudioFile, deleteAudioFile, audioIdsInHtml } from "@/lib/audio-files";
import { ColorGrid, PALETTE } from "@/components/ColorGrid";
import { noteCaretColor } from "@/lib/note-caret-color";
import { nativeAudioAvailable, startNativeAudio, stopNativeAudio } from "@/lib/native-audio";
import {
  ArrowLeft,
  Check,
  Type,
  Palette,
  CaseUpper,
  Highlighter,
  Star,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Undo2,
  Redo2,
  Mic,
  Square,
} from "lucide-react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color, FontSize } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import FontFamily from "@tiptap/extension-font-family";
import {
  createNote,
  getNote,
  nextDefaultNoteTitle,
  updateNote,
  useHydrated,
  useNotes,
} from "@/lib/notes-store";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AutoLinkExtras } from "@/lib/editor-extensions";
import { AudioNote } from "@/components/editor/AudioNode";
import { useFolders, type Folder } from "@/lib/folders-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";
import { APP_FONTS, fontNameFromCss } from "@/lib/app-fonts";

export const Route = createFileRoute("/editor/$id")({
  head: () => ({ meta: [
    { title: "Note editor — Wave Notes" },
    { name: "description", content: "Write and format a note in Wave Notes." },
    { property: "og:title", content: "Note editor — Wave Notes" },
    { property: "og:description", content: "Write and format a note in Wave Notes." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (search: Record<string, unknown>) => ({
    folder: typeof search.folder === "string" ? search.folder : undefined,
  }),
  component: EditorPage,
});

const FONTS = APP_FONTS.map(font => ({label:font.name,value:font.css}));

const SIZES = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48];


function EditorPage() {
  const { id } = Route.useParams();
  const notes = useNotes(); // subscribe
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const t = useT();
  const folders = useFolders();
  // Recompute when notes list changes (e.g. after title/body edits from elsewhere)
  // "new" is a draft that exists only in memory until the checkmark is tapped.
  const isNew = id === "new";
  const { folder: folderParam } = Route.useSearch();
  const note = useMemo(
    () => (isNew ? undefined : (notes.find((n) => n.id === id) ?? getNote(id))),
    [id, isNew, hydrated, notes],
  );

  const [title, setTitle] = useState(note?.title ?? "");
  const [pinned, setPinnedLocal] = useState(!!note?.pinned);
  const [folderId, setFolderId] = useState<string>(
    note?.folderId ?? folderParam ?? "all",
  );
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const nativeRecordingRef = useRef(false);
  const [startingAudio,setStartingAudio]=useState(false);
  const startingAudioRef=useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Recording is not committed to the note until the binary is safely stored.
  const recordingWriteRef = useRef<Promise<void> | null>(null);
  const settleRecordingRef = useRef<{ resolve: () => void; reject: (reason?: unknown) => void } | null>(null);
  const createdAudioIdsRef=useRef(new Set<string>());
  const committedNoteRef=useRef(false);
  const cleanupNewAudio=async(keep: string[] = [])=>{
    const retained=new Set(keep);
    const removed=[...createdAudioIdsRef.current].filter(id=>!retained.has(id));
    await Promise.allSettled(removed.map(id=>deleteAudioFile(id)));
    createdAudioIdsRef.current=new Set([...createdAudioIdsRef.current].filter(id=>retained.has(id)));
  };
  const savingRef = useRef(false);

  const [currentFontFamily, setCurrentFontFamily] = useState(FONTS[0].value);
  const [currentFontSize, setCurrentFontSize] = useState<number>(18);
  const [currentColor, setCurrentColor] = useState<string>("#FFFFFF");
  const [canvasBg, setCanvasBg] = useState<string>(
    note?.style?.background ?? "#000000",
  );

  // Sync local state once the note hydrates from storage.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current || !note) return;
    syncedRef.current = true;
    setTitle(note.title);
    setPinnedLocal(!!note.pinned);
    setFolderId(note.folderId ?? "all");
    if (note.style?.background) setCanvasBg(note.style.background);
  }, [note]);

  // Latest title ref so onUpdate doesn't need to be recreated per keystroke.
  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  // rAF-throttled re-render to reflect toolbar active state (bold, undo/redo…)
  // without a re-render per ProseMirror transaction (which would thrash the
  // main thread on older Android WebViews and can appear as a freeze).
  const [, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const scheduleTick = () => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setTick((n) => (n + 1) & 0x3fffffff);
    });
  };
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);


  // Last selection inside the editor. On Android WebViews tapping a toolbar
  // button blurs the editor and can collapse/move the selection, so every
  // formatting command restores exactly this range before applying a mark.
  const selectionRef = useRef<{ from: number; to: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      Underline,
      TextStyle,
      Color,
      FontSize,
      FontFamily.configure({ types: ["textStyle"] }),
      Link.configure({
        autolink: true,
        openOnClick: false,
        linkOnPaste: true,
        HTMLAttributes: {
          class: "underline text-primary",
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      AutoLinkExtras,
      AudioNote,
    ],
    content: note?.body || "<p></p>",
    editorProps: {
      attributes: {
        class:
          "sn-tiptap min-h-full w-full whitespace-pre-wrap break-words outline-none",
        style: "color:#FFFFFF;caret-color:var(--wave-note-caret,#FFFFFF);",
      },
    },
    // Draft only: nothing is written to storage until the checkmark is tapped.
    onUpdate: () => scheduleTick(),
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      selectionRef.current = { from, to };
      const attrs = editor.getAttributes("textStyle");
      if (attrs.fontFamily) setCurrentFontFamily(attrs.fontFamily);
      if (attrs.fontSize) {
        const n = parseInt(String(attrs.fontSize), 10);
        if (!isNaN(n)) setCurrentFontSize(n);
      }
      if (attrs.color) setCurrentColor(attrs.color);
      scheduleTick();
    },
    onTransaction: () => scheduleTick(),
  });


  // Load body when the note becomes available after hydration.
  useEffect(() => {
    if (!editor || !note) return;
    const current = editor.getHTML();
    const target = note.body || "<p></p>";
    if (current === "<p></p>" && target !== "<p></p>") {
      editor.commands.setContent(target, { emitUpdate: false });
    }
  }, [editor, note]);

  // Title, folder, star and background live in draft state only (see handleSave).



  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.state === "recording" && recorderRef.current.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
      if (!committedNoteRef.current) {
        // Native Back or page teardown can bypass the editor's Cancel button.
        const pending=recordingWriteRef.current;
        void (pending ? pending.catch(()=>undefined) : Promise.resolve()).then(()=>
          Promise.allSettled([...createdAudioIdsRef.current].map(id=>deleteAudioFile(id))));
      }
    };
  }, []);

  const handlePin = () => setPinnedLocal((p) => !p);

  const handleFolder = (fid: string) => setFolderId(fid);

  const handleCanvasBg = (c: string) => setCanvasBg(c);

  // Keep archive work out of the editor completely, even if a previous
  // committed edit was waiting to be archived. A checkmark navigates away
  // after saving; the backup runs only once the editor is closed.
  useEffect(() => {
    window.dispatchEvent(new Event("wave-notes-editor-opened"));
    return () => { window.dispatchEvent(new Event("wave-notes-editor-closed")); };
  }, []);

  /** Back = discard: nothing typed in this session reaches the notes list. */
  const handleDiscard = async () => {
    if (recorderRef.current?.state === "recording" || nativeRecordingRef.current) stopRecording();
    await recordingWriteRef.current?.catch(()=>undefined);
    await cleanupNewAudio();
    navigate({to:"/"});
  };

  /** Checkmark = the one and only commit point. */
  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
    // Stop MediaRecorder and wait for its final ondataavailable/onstop events.
    // Without this, a fast checkmark saves HTML before the audio node exists.
    if (startingAudioRef.current) throw new Error("Подождите, пока микрофон включится.");
    if (recorderRef.current?.state === "recording" || nativeRecordingRef.current) stopRecording();
    if (recordingWriteRef.current) await recordingWriteRef.current;
    const body = editor?.getHTML() ?? "";
    const plain = (editor?.getText() ?? "").trim();
    const typedTitle = title.trim();

    if (isNew) {
      // A note that was opened and left blank is cancelled entirely.
      if (!typedTitle && !plain) {
        await cleanupNewAudio();
        navigate({ to: "/" });
        return;
      }
      createNote({
        title: typedTitle || nextDefaultNoteTitle(t("new_note")),
        body,
        folderId,
        pinned,
        style: { background: canvasBg },
      });
    } else if (note) {
      updateNote(id, {
        title: typedTitle || note.title,
        body,
        folderId,
        pinned,
        style: { background: canvasBg },
      });
    }

    committedNoteRef.current=true;
    await cleanupNewAudio(audioIdsInHtml(body));
    navigate({ to: "/" });
    } catch (error) {
      console.error("Unable to save note", error);
      alert(error instanceof Error ? error.message : "Не удалось сохранить заметку. Текст остаётся в редакторе.");
    } finally {
      savingRef.current = false;
    }
  };

  /**
   * Chain scoped to the user's real selection: a range formats only that
   * fragment; a collapsed cursor sets a stored mark for the next typed text.
   */
  const scoped = () => {
    if (!editor) return null;
    const saved = selectionRef.current;
    const size = editor.state.doc.content.size;
    const chain = editor.chain().focus(undefined, { scrollIntoView: false });
    if (saved && saved.to <= size) {
      const sel = editor.state.selection;
      // Collapsed cursor already in place: keep the pending (stored) marks so
      // Bold/Italic/Underline/Strike stack as independent toggles.
      if (saved.from === saved.to && sel.from === saved.from && sel.to === saved.to) return chain;
      const stored = editor.state.storedMarks;
      const next = chain.setTextSelection({ from: saved.from, to: saved.to });
      if (saved.from === saved.to && stored) {
        return next.command(({ tr }) => {
          tr.setStoredMarks(stored);
          return true;
        });
      }
      return next;
    }
    return chain;
  };

  const applyFontSize = (s: number) => {
    scoped()?.setFontSize(`${s}px`).run();
    setCurrentFontSize(s);
  };

  const localizedFolderName = (f: Folder) => {
    if (f.id === "all") return t("folder_all");
    if (f.id === "work") return t("folder_work");
    if (f.id === "home") return t("folder_home");
    return f.name;
  };

  const attachAudio = async (blob: Blob) => {
    if (!blob.size) throw new Error("Пустая аудиозапись");
    const audioId=await saveAudioFile(blob);
    createdAudioIdsRef.current.add(audioId);
    if (!editor || editor.isDestroyed || !editor.chain().focus().insertAudioNote(`audiodb:${audioId}`).run()) throw new Error("Не удалось вставить аудио в заметку");
  };
  const startRecording = async () => {
    if (recording || startingAudioRef.current || recordingWriteRef.current) return;
    if (nativeAudioAvailable()) {
      startingAudioRef.current=true;setStartingAudio(true);
      try {
        await startNativeAudio();
        recordingWriteRef.current=new Promise<void>((resolve,reject)=>{settleRecordingRef.current={resolve,reject};});
        void recordingWriteRef.current.catch(()=>undefined);
        nativeRecordingRef.current=true;setRecording(true);
      } catch(err) {
        console.error("Native microphone start",err);
        alert(err instanceof Error?err.message:"Нет доступа к микрофону");
      } finally {startingAudioRef.current=false;setStartingAudio(false);}
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==="undefined") {alert("Микрофон недоступен");return;}
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current=stream;
      const rec=new MediaRecorder(stream);
      recordingWriteRef.current=new Promise<void>((resolve,reject)=>{settleRecordingRef.current={resolve,reject};});
      void recordingWriteRef.current.catch(()=>undefined);
      chunksRef.current=[];
      rec.ondataavailable=ev=>{if(ev.data.size)chunksRef.current.push(ev.data);};
      rec.onstop=async()=>{
        try {await attachAudio(new Blob(chunksRef.current,{type:rec.mimeType||"audio/webm"}));settleRecordingRef.current?.resolve();}
        catch(err){settleRecordingRef.current?.reject(err);alert("Не удалось сохранить аудио");}
        finally{recordingWriteRef.current=null;settleRecordingRef.current=null;stream.getTracks().forEach(t=>t.stop());streamRef.current=null;}
      };
      rec.onerror=()=>{settleRecordingRef.current?.reject(new Error("Ошибка аудиозаписи"));recordingWriteRef.current=null;settleRecordingRef.current=null;stream.getTracks().forEach(t=>t.stop());setRecording(false);};
      rec.start();recorderRef.current=rec;setRecording(true);
    }catch(err){console.error(err);alert("Не удалось получить доступ к микрофону");}
  };
  const stopRecording=()=>{
    if(nativeRecordingRef.current){
      nativeRecordingRef.current=false;setRecording(false);
      void stopNativeAudio().then(attachAudio).then(()=>settleRecordingRef.current?.resolve())
        .catch(err=>{settleRecordingRef.current?.reject(err);alert(err instanceof Error?err.message:"Не удалось сохранить запись");})
        .finally(()=>{recordingWriteRef.current=null;settleRecordingRef.current=null;});
      return;
    }
    try {if(recorderRef.current?.state==="recording")recorderRef.current.stop();}catch(err){settleRecordingRef.current?.reject(err);recordingWriteRef.current=null;}
    recorderRef.current=null;setRecording(false);
  };

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!note && !isNew) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <p className="text-lg font-semibold">{t("not_found")}</p>
          <Button className="mt-4 rounded-full" onClick={() => navigate({ to: "/" })}>
            {t("to_list")}
          </Button>
        </div>
      </div>
    );
  }


  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ROW 1: Header — back, title, folder, save (the app frame already clears the status bar) */}
      <header className="z-30 shrink-0">
        <div className="glass mx-3 mt-2 flex items-center gap-1.5 rounded-xl px-2 py-1.5">
          <button
            onClick={handleDiscard}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-secondary"
            aria-label={t("back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("new_note")}
            className="min-w-0 flex-1 bg-transparent px-2 py-2 font-display text-base font-semibold outline-none placeholder:text-muted-foreground"
          />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-7 max-w-[6.5rem] shrink-0 items-center rounded-full border border-border bg-secondary/50 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-secondary"
                  aria-label={t("folder")}
                >
                  <span className="truncate">{localizedFolderName(folders.find((f) => f.id === folderId) ?? folders[0])}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className="w-48 rounded-2xl">
                {folders.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onClick={() => handleFolder(f.id)}
                    className={`gap-2 py-2 text-xs font-semibold uppercase tracking-wider ${
                      folderId === f.id ? "text-primary" : ""
                    }`}
                  >
                    {localizedFolderName(f)}
                    {folderId === f.id && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          <button
            onClick={handleSave}
            className="ml-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm hover:opacity-90"
            aria-label={t("done")}
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* Sticky toolbar stack — never scrolls away, always above the canvas */}
      <div className="sticky top-0 z-50 shrink-0 bg-background pb-1">
      {/* ROW 2: Action toolbar — undo/redo/mic/star + arrow + folder */}
      <div className="mx-3 mt-3">
        <div className="glass no-scrollbar flex items-center gap-1 overflow-x-auto rounded-xl px-2 py-1">
          <button
            onClick={() => editor?.chain().focus().undo().run()}
            disabled={!editor?.can().undo()}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-secondary disabled:opacity-40"
            aria-label={t("undo")}
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor?.chain().focus().redo().run()}
            disabled={!editor?.can().redo()}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-secondary disabled:opacity-40"
            aria-label={t("redo")}
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={startingAudio}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-secondary ${
              recording ? "bg-destructive text-destructive-foreground animate-pulse" : ""
            }`}
            aria-label={t("audio")}
          >
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            onClick={handlePin}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-secondary ${
              pinned ? "text-primary" : "text-muted-foreground"
            }`}
            aria-label={t("star")}
          >
            <Star className="h-4 w-4" fill={pinned ? "currentColor" : "none"} />
          </button>

          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
          {editor && (
            <>
              <FormatButton active={editor.isActive("bold")} onClick={() => scoped()?.toggleBold().run()} label="Bold">
                <Bold className="h-4 w-4" />
              </FormatButton>
              <FormatButton active={editor.isActive("italic")} onClick={() => scoped()?.toggleItalic().run()} label="Italic">
                <Italic className="h-4 w-4" />
              </FormatButton>
              <FormatButton active={editor.isActive("underline")} onClick={() => scoped()?.toggleUnderline().run()} label="Underline">
                <UnderlineIcon className="h-4 w-4" />
              </FormatButton>
              <FormatButton active={editor.isActive("strike")} onClick={() => scoped()?.toggleStrike().run()} label="Strikethrough">
                <Strikethrough className="h-4 w-4" />
              </FormatButton>
            </>
          )}
        </div>
      </div>

      {/* ROW 3: Style bar — font / size / color / bg (always visible) */}
      {editor && (
        <div className="mt-2">
          <div className="mx-3">
            <div className="glass grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5 rounded-xl p-1.5">
              <ToolbarPopover
                label={
                  (FONTS.find((f) => f.value === currentFontFamily)?.label ?? fontNameFromCss(currentFontFamily)) ??
                  "Шрифт"
                }
                icon={<Type className="h-4 w-4" />}
              >
                <div className="no-scrollbar flex max-h-72 flex-col overflow-y-auto p-1">
                  {FONTS.map((f) => (
                    <button
                      key={f.value}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        scoped()?.setFontFamily(f.value).run();
                        setCurrentFontFamily(f.value);
                      }}
                      style={{ fontFamily: f.value }}
                      className={`rounded-lg px-3 py-2 text-left text-base hover:bg-secondary ${
                        currentFontFamily === f.value ? "text-primary" : ""
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </ToolbarPopover>

              <ToolbarPopover
                label={`${currentFontSize}px`}
                icon={<CaseUpper className="h-4 w-4" />}
              >
                <div className="no-scrollbar flex max-h-72 flex-col overflow-y-auto p-1">
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyFontSize(s)}
                      className={`rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary ${
                        currentFontSize === s ? "bg-secondary text-primary" : ""
                      }`}
                    >
                      {s}px
                    </button>
                  ))}
                </div>
              </ToolbarPopover>

              <ToolbarPopover
                label="Цвет"
                icon={
                  <Palette className="h-4 w-4" style={{ color: currentColor }} />
                }
              >
                <ColorGrid
                  colors={PALETTE}
                  value={currentColor}
                  onChange={(c) => {
                    scoped()?.setColor(c).run();
                    setCurrentColor(c);
                  }}
                />
              </ToolbarPopover>

              <ToolbarPopover
                label="Фон"
                icon={
                  <Highlighter className="h-4 w-4" style={{ color: canvasBg }} />
                }
              >
                <ColorGrid
                  colors={PALETTE}
                  value={canvasBg}
                  onChange={handleCanvasBg}
                />
              </ToolbarPopover>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Editor — flexes to fill remaining height, shrinks when toolbar expands */}
      <main className="mx-auto flex w-full min-h-0 max-w-xl flex-1 flex-col px-3 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
        <div
          className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border p-3 shadow-inner transition-colors [-webkit-overflow-scrolling:touch]"
          style={{ background: canvasBg }}
        >
          <EditorContent editor={editor} style={{ "--wave-note-caret": noteCaretColor(canvasBg) } as React.CSSProperties} />
        </div>
        <p className="mt-2 shrink-0 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {t("save")} · {t("done")}
        </p>
      </main>

    </div>
  );
}

function FormatButton({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary/60 hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarPopover({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          onMouseDown={(e) => e.preventDefault()}
          className="flex h-8 w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-full bg-secondary/60 px-2.5 text-xs font-medium hover:bg-secondary"
        >
          <span className="shrink-0">{icon}</span>
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
            {label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={6}
        collisionPadding={12}
        avoidCollisions
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // A tap on the trigger itself is handled by its own toggle; ignoring
          // it here prevents the close-then-reopen flicker.
          if (triggerRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        className="max-h-[min(24rem,calc(100dvh-6rem))] w-[min(15rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-2"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

// silence unused editor type import if TS strips
export type __Editor = Editor;
