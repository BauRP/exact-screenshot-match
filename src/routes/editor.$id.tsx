import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { saveAudioFile, deleteAudioFile, audioIdsInHtml } from "@/lib/audio-files";
import { ColorGrid, PALETTE } from "@/components/ColorGrid";
import {NEW_NOTE_INK,editorBackground,editorInk} from "@/lib/note-appearance";
import { noteCaretColor } from "@/lib/note-caret-color";
import {parseReminderInput,toReminderInput,reminderPresetTime} from "@/lib/note-reminders";
import { nativeAudioAvailable, startNativeAudio, stopNativeAudio } from "@/lib/native-audio";
import {
  ArrowLeft,
  LoaderCircle,
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
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ListChecks,
  WandSparkles,
  Grid3X3,
  Blocks,
  Quote,
  BookOpen,
  EyeOff,
  CalendarDays,
  ImagePlus,
  Camera,
  PenTool,
  ListTree,
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
import { WaveImage } from "@/components/editor/WaveImage";
import { WaveDrawing } from "@/components/editor/WaveDrawing";
import {WavePageBreak} from "@/lib/wave-page-break";
import {collectNoteOutline} from "@/lib/note-outline";
import { saveImageFile,deleteImageFile,imageIdsInHtml } from "@/lib/image-files";
import {verifiedNoteImage,takeNotePhoto,clipboardImage,droppedImage} from "@/lib/note-image-import";
import { useFolders, type Folder } from "@/lib/folders-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";
import { APP_FONTS, fontNameFromCss } from "@/lib/app-fonts";
import { InNoteSearch, noteSearchKey, findWords } from "@/lib/in-note-search";
import { readEditorPreferences,type EditorTool } from "@/lib/editor-preferences";
import { WaveChecklistItem, type CheckShape } from "@/lib/wave-checklist";
import { PAPER_MOODS,PAPER_RULES,paperAppearance,type PaperMood,type PaperRule } from "@/lib/note-paper";
import { WaveCallout, WaveFold, WaveTape, type CalloutKind } from "@/lib/wave-blocks";
import {openExternalUrl,isSafeExternalUrl} from "@/lib/external-links";

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
    ...(search.template === "checklist" ? {template:"checklist" as const} : {}),
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
  const { folder: folderParam, template } = Route.useSearch();
  const appliedTemplate=useRef(false);
  const note = useMemo(
    () => (isNew ? undefined : (notes.find((n) => n.id === id) ?? getNote(id))),
    [id, isNew, hydrated, notes],
  );

  const [title, setTitle] = useState(note?.title ?? "");
  const [pinned, setPinnedLocal] = useState(!!note?.pinned);
  const [reminderAt,setReminderAt]=useState<string>(()=>toReminderInput(note?.reminderAt));
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
  const createdImageIdsRef=useRef(new Set<string>());
  const pendingImagesRef=useRef(new Set<Promise<void>>());
  const enqueueImageRef=useRef<((load:()=>Promise<Blob>)=>void)|null>(null);
  const imageSessionRef=useRef(true);
  const committedNoteRef=useRef(false);
  const cleanupNewAudio=async(keep: string[] = [])=>{
    const retained=new Set(keep);
    const removed=[...createdAudioIdsRef.current].filter(id=>!retained.has(id));
    await Promise.allSettled(removed.map(id=>deleteAudioFile(id)));
    createdAudioIdsRef.current=new Set([...createdAudioIdsRef.current].filter(id=>retained.has(id)));
  };
  const savingRef = useRef(false);
  const [saving,setSaving] = useState(false);
  const [findOpen,setFindOpen]=useState(false);
  const [outlineOpen,setOutlineOpen]=useState(false);
  const [findQuery,setFindQuery]=useState("");
  const [findActive,setFindActive]=useState(0);
  const [checkShape,setCheckShape]=useState<CheckShape>("square");
  const [prefs]=useState(()=>readEditorPreferences());
  const toolVisible=(tool:EditorTool)=>!prefs.hiddenToolbar.includes(tool);
  const [slashText,setSlashText]=useState<string|null>(null);

  const [currentFontFamily, setCurrentFontFamily] = useState(FONTS[0].value);
  const [currentFontSize, setCurrentFontSize] = useState<number>(18);
  const [currentColor, setCurrentColor] = useState<string>(editorInk(isNew,note?.style?.color));
  const [canvasBg, setCanvasBg] = useState<string>(editorBackground(isNew,note?.style?.background));
  const [paperMood,setPaperMood]=useState<PaperMood>(note?.style?.paperMood??"solid");
  const [paperRule,setPaperRule]=useState<PaperRule>(note?.style?.paperRule??"plain");

  // Sync local state once the note hydrates from storage.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current || !note) return;
    syncedRef.current = true;
    setTitle(note.title);
    setPinnedLocal(!!note.pinned);
    setReminderAt(toReminderInput(note.reminderAt));
    setFolderId(note.folderId ?? "all");
    if (note.style?.background) setCanvasBg(note.style.background);
    if (note.style?.paperMood) setPaperMood(note.style.paperMood);
    if (note.style?.paperRule) setPaperRule(note.style.paperRule);
    if (note.style?.color) setCurrentColor(note.style.color);
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
      WaveImage,
      WaveDrawing,
      WavePageBreak,
      InNoteSearch,
      WaveChecklistItem,
      WaveCallout,
      WaveFold,
      WaveTape,
    ],
    content: note?.body || "<p></p>",
    editorProps: {
      handleClick(_view,_pos,event){
        const element=event.target instanceof Element?event.target:null;
        const anchor=element?.closest("a[href]");
        if(!anchor)return false;
        const href=anchor.getAttribute("href");
        if(!href || !isSafeExternalUrl(href))return false;
        event.preventDefault();
        void openExternalUrl(href).catch(error=>{
          console.error("External browser failed",error);
          toast.error("Не удалось открыть ссылку в браузере телефона");
        });
        return true;
      },
      handlePaste(_view,event){
        const file=clipboardImage(event);
        if(!file)return false;
        event.preventDefault();enqueueImageRef.current?.(()=>Promise.resolve(file));return true;
      },
      handleDrop(_view,event){
        const file=droppedImage(event);
        if(!file)return false;
        event.preventDefault();enqueueImageRef.current?.(()=>Promise.resolve(file));return true;
      },
      attributes: {
        class:
          "sn-tiptap min-h-full w-full whitespace-pre-wrap break-words outline-none",
        style: "color:var(--wave-note-ink,#FFFFFF);caret-color:var(--wave-note-caret,#FFFFFF);",
        spellcheck: prefs.spellcheck ? "true" : "false",
      },
    },
    // Draft only: nothing is written to storage until the checkmark is tapped.
    onUpdate: ({editor:currentEditor}) => {
      scheduleTick();
      const {$from}=currentEditor.state.selection;
      const before=$from.parent.textBetween(0,$from.parentOffset);
      setSlashText(/^\/[\p{L}\p{N} -]{0,22}$/u.test(before) ? before.slice(1) : null);
    },
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


  useEffect(()=>{
    if(!editor||!isNew||template!=="checklist"||appliedTemplate.current)return;
    appliedTemplate.current=true;
    editor.commands.setContent({type:"doc",content:[{type:"waveChecklistItem",
      attrs:{shape:"square",done:false},content:[{type:"text",text:" "}]}]});
  },[editor,isNew,template]);

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
      imageSessionRef.current=false;
      if (!committedNoteRef.current) {
        void Promise.allSettled([...pendingImagesRef.current]).then(()=>
          Promise.allSettled([...createdImageIdsRef.current].map(id=>deleteImageFile(id))));
        // Native Back or page teardown can bypass the editor's Cancel button.
        const pending=recordingWriteRef.current;
        void (pending ? pending.catch(()=>undefined) : Promise.resolve()).then(()=>
          Promise.allSettled([...createdAudioIdsRef.current].map(id=>deleteAudioFile(id))));
      }
    };
  }, []);

  const handlePin = () => setPinnedLocal((p) => !p);

  const handleFolder = (fid: string) => setFolderId(fid);

  const handleCanvasBg = (c: string) => {setCanvasBg(c);setPaperMood("solid");};
  const hits=findOpen&&editor?findWords(editor.state.doc,findQuery,prefs.caseSensitive):[];
  const outline=outlineOpen&&editor?collectNoteOutline(editor.state.doc):[];
  const setSearchDecoration=(query:string,active:number)=>{
    if(editor)editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey,{query,active,caseSensitive:prefs.caseSensitive}));
  };
  const dismissFind=()=>{setFindOpen(false);setFindQuery("");setFindActive(0);setSearchDecoration("",0);};
  const stepFind=(step:number)=>{
    if(!editor||!hits.length)return;
    const at=(findActive+step+hits.length)%hits.length;
    setFindActive(at);setSearchDecoration(findQuery,at);
    requestAnimationFrame(()=>editor.view.dom.querySelector(".wave-find-current")?.scrollIntoView({block:"nearest"}));
  };

  const insertWaveBlock=(kind:"quote"|"callout"|"fold"|"tape"|"date"|"separator"|"bullets"|"numbered"|"heading"|"checklist"|"page",callout:CalloutKind="important")=>{
    if(!editor)return;
    const {$from}=editor.state.selection;
    const textBefore=$from.parent.textBetween(0,$from.parentOffset);
    const slashLength=/^\/[\p{L}\p{N} -]{0,22}$/u.test(textBefore)?textBefore.length:0;
    let chain=editor.chain().focus();
    if(slashLength)chain=chain.deleteRange({from:$from.pos-slashLength,to:$from.pos});
    setSlashText(null);
    if(kind==="quote"){chain.toggleBlockquote().run();return;}
    if(kind==="bullets"){chain.toggleBulletList().run();return;}
    if(kind==="numbered"){chain.toggleOrderedList().run();return;}
    if(kind==="heading"){chain.toggleHeading({level:2}).run();return;}
    if(kind==="checklist"){chain.insertContent({type:"waveChecklistItem",attrs:{shape:checkShape,done:false},content:[{type:"text",text:" "}]}).run();return;}
    if(kind==="tape"){
      if(editor.state.selection.empty){toast("Сначала выделите слова, которые нужно скрыть");return;}
      chain.setMark("waveTape").run();return;
    }
    if(kind==="date"){chain.insertContent(new Date().toLocaleDateString("ru-RU")).run();return;}
    if(kind==="separator"){chain.setHorizontalRule().run();return;}
    if(kind==="page"){chain.insertWavePageBreak().run();return;}
    const node=kind==="fold"
      ? {type:"waveFold",attrs:{title:"Новый раздел",collapsed:false},content:[{type:"paragraph"}]}
      : {type:"waveCallout",attrs:{kind:callout},content:[{type:"paragraph"}]};
    chain.insertContent(node).run();
  };
  const blockChoices=[
    {id:"checklist",label:"Список дел",icon:"☐"},
    {id:"bullets",label:"Маркированный список",icon:"•"},
    {id:"numbered",label:"Нумерованный список",icon:"1."},
    {id:"heading",label:"Заголовок",icon:"H"},
    {id:"callout",label:"Важно",icon:"!"},
    {id:"tip",label:"Совет",icon:"✦"},
    {id:"warning",label:"Предупреждение",icon:"⚠"},
    {id:"info",label:"Информация",icon:"i"},
    {id:"quote",label:"Цитата",icon:"❝"},
    {id:"fold",label:"Сворачиваемый раздел",icon:"▸"},
    {id:"tape",label:"Скрыть выбранный ответ",icon:"▰"},
    {id:"date",label:"Вставить дату",icon:"◷"},
    {id:"separator",label:"Разделитель",icon:"—"},
    {id:"page",label:"Новая страница",icon:"▤"},
  ] as const;
  const chooseBlock=(id:typeof blockChoices[number]["id"])=>{
    if(id==="callout")insertWaveBlock("callout","important");
    else if(id==="tip"||id==="warning"||id==="info")insertWaveBlock("callout",id);
    else insertWaveBlock(id);
  };
  const visibleSlashChoices=slashText===null?[]:blockChoices.filter(item=>item.label.toLocaleLowerCase().includes(slashText.toLocaleLowerCase()));
  
  // Keep archive work out of the editor completely, even if a previous
  // committed edit was waiting to be archived. A checkmark navigates away
  // after saving; the backup runs only once the editor is closed.
  useEffect(() => {
    window.dispatchEvent(new Event("wave-notes-editor-opened"));
    return () => { window.dispatchEvent(new Event("wave-notes-editor-closed")); };
  }, []);

  /** Back = discard: nothing typed in this session reaches the notes list. */
  const handleDiscard = async () => {
    if(savingRef.current)return;
    imageSessionRef.current=false;
    if (recorderRef.current?.state === "recording" || nativeRecordingRef.current) stopRecording();
    await recordingWriteRef.current?.catch(()=>undefined);
    await Promise.allSettled([...pendingImagesRef.current]);
    await cleanupNewAudio();
    await Promise.allSettled([...createdImageIdsRef.current].map(id=>deleteImageFile(id)));
    createdImageIdsRef.current.clear();
    navigate({to:"/"});
  };

  /** Save icon commits the draft to local storage; back still discards. */
  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
    // Stop MediaRecorder and wait for its final ondataavailable/onstop events.
    // Without this, a fast checkmark saves HTML before the audio node exists.
    if (startingAudioRef.current) throw new Error("Подождите, пока микрофон включится.");
    if (recorderRef.current?.state === "recording" || nativeRecordingRef.current) stopRecording();
    if (recordingWriteRef.current) await recordingWriteRef.current;
    // Never commit note markup before pending camera/gallery/clipboard writes settle.
    await Promise.allSettled([...pendingImagesRef.current]);
    const body = editor?.getHTML() ?? "";
    const plain = (editor?.getText() ?? "").trim();
    const hasImages=imageIdsInHtml(body).length>0;
    const hasDrawing=body.includes("data-wave-drawing");
    const typedTitle = title.trim();
    const reminderValue=reminderAt?parseReminderInput(reminderAt):undefined;
    if(reminderAt&&reminderValue===undefined)throw new Error("Укажите правильную дату и время напоминания");

    if (isNew) {
      // A note that was opened and left blank is cancelled entirely.
      if (!typedTitle && !plain && !hasImages && !hasDrawing) {
        await cleanupNewAudio();
        await Promise.allSettled([...createdImageIdsRef.current].map(id=>deleteImageFile(id)));
        createdImageIdsRef.current.clear();
        navigate({ to: "/" });
        return;
      }
      createNote({
        title: typedTitle || nextDefaultNoteTitle(t("new_note")),
        body,
        folderId,
        pinned,
        reminderAt:reminderValue,
        // Preserve dark default ink when the new yellow note is reopened.
        style: { background: canvasBg, color: NEW_NOTE_INK, paperMood, paperRule },
      });
    } else if (note) {
      updateNote(id, {
        title: typedTitle || note.title,
        body,
        folderId,
        pinned,
        reminderAt:reminderValue,
        style: { background: canvasBg, paperMood, paperRule },
      });
    }

    committedNoteRef.current=true;
    await cleanupNewAudio(audioIdsInHtml(body));
    const keepImages=new Set(imageIdsInHtml(body));
    await Promise.allSettled([...createdImageIdsRef.current].filter(id=>!keepImages.has(id)).map(id=>deleteImageFile(id)));
    createdImageIdsRef.current.clear();
    toast.success(t("saved"),{duration:1600});
    navigate({ to: "/" });
    } catch (error) {
      console.error("Unable to save note", error);
      alert(error instanceof Error ? error.message : "Не удалось сохранить заметку. Текст остаётся в редакторе.");
    } finally {
      savingRef.current = false;
      setSaving(false);
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

  const enqueueImage=(load:()=>Promise<Blob>)=>{
    if(!editor||savingRef.current||!imageSessionRef.current)return;
    const job=(async()=>{
      let imageId:string|null=null;
      try{
        const valid=await verifiedNoteImage(await load());
        if(!imageSessionRef.current||editor.isDestroyed)return;
        imageId=await saveImageFile(valid);
        createdImageIdsRef.current.add(imageId);
        if(!imageSessionRef.current||editor.isDestroyed||!editor.chain().focus().insertWaveImage(imageId).run()){
          throw Error("Не удалось вставить фотографию");
        }
      }catch(error){
        if(imageId){await deleteImageFile(imageId).catch(console.error);createdImageIdsRef.current.delete(imageId);}
        if(imageSessionRef.current)toast.error(error instanceof Error?error.message:"Не удалось добавить изображение");
      }
    })();
    pendingImagesRef.current.add(job);
    void job.finally(()=>pendingImagesRef.current.delete(job));
  };
  const addImage=()=>{
    if(!editor||savingRef.current)return;
    const picker=document.createElement("input");
    picker.type="file";picker.accept="image/jpeg,image/png,image/webp";picker.style.display="none";
    picker.addEventListener("change",()=>{
      const file=picker.files?.[0];picker.remove();
      if(file)enqueueImage(()=>Promise.resolve(file));
    },{once:true});
    document.body.append(picker);picker.click();
  };
  enqueueImageRef.current=enqueueImage;
  const addCameraImage=()=>enqueueImage(takeNotePhoto);
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
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Напоминание" className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-secondary">
                <CalendarDays className="h-4 w-4"/>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-64 rounded-xl p-3">
              <p className="mb-2 text-sm font-semibold">Напоминание к заметке</p>
              <input type="datetime-local" aria-label="Дата и время напоминания" value={reminderAt}
                onChange={event=>setReminderAt(event.target.value)}
                className="w-full rounded-lg border border-border bg-background p-2 text-sm"/>
              <div className="mt-2 flex gap-1">
                {([["hour","Через час"],["tomorrow","Завтра"],["week","Через неделю"]] as const).map(([preset,label])=>
                  <button type="button" key={preset} onClick={()=>setReminderAt(toReminderInput(reminderPresetTime(preset)))}
                    className="min-h-9 rounded-md border border-border px-2 text-[11px]">{label}</button>)}
              </div>
              <button type="button" onClick={()=>setReminderAt("")}
                className="mt-2 rounded-lg border border-border px-3 py-2 text-xs">Убрать напоминание</button>
              <p className="mt-2 text-xs text-muted-foreground">Дата сохраняется без интернета. Системные уведомления пока не включены.</p>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            aria-label={t("save")}
            title={t("save")}
            aria-busy={saving}
            className="group ml-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait"
          >
            <span className="grid h-[38px] w-[38px] place-items-center rounded-full border border-border bg-secondary/50 text-white shadow-sm transition-colors duration-150 group-hover:bg-secondary group-active:bg-secondary/80 group-disabled:opacity-70 motion-reduce:transition-none">
              {saving ? (
                <LoaderCircle aria-hidden="true" className="h-[22px] w-[22px] animate-spin" strokeWidth={2.1} />
              ) : (
                // Balanced white outline: no stretched filled pictogram.
                <svg
                  aria-hidden="true"
                  className="block h-[22px] w-[22px] shrink-0 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.95}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <path d="M5.5 3.5H16L20.5 8v11c0 1-.8 1.8-1.8 1.8H5.3c-1 0-1.8-.8-1.8-1.8V5.5c0-1.1.9-2 2-2Z" />
                  <path d="M7.2 3.5v6.4h9.2V4" />
                  <path d="M7.3 20.8v-7.2h9.4v7.2" />
                  <path d="M9.4 16.7h5.2" strokeWidth={1.6} />
                </svg>
              )}
            </span>
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
                    {toolVisible("audio")&&<button
            onClick={recording ? stopRecording : startRecording}
            disabled={startingAudio}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-secondary ${
              recording ? "bg-destructive text-destructive-foreground animate-pulse" : ""
            }`}
            aria-label={t("audio")}
          >
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>}
          {toolVisible("drawing")&&<button type="button" onClick={()=>editor?.chain().focus().insertWaveDrawing().run()}
            aria-label="Добавить рисунок" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-secondary">
            <PenTool className="h-4 w-4"/>
          </button>}
          {toolVisible("camera")&&<button type="button" onClick={addCameraImage} aria-label="Сфотографировать для заметки"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-secondary">
            <Camera className="h-4 w-4"/>
          </button>}
          {toolVisible("gallery")&&<button type="button" onClick={addImage} aria-label="Добавить фотографию из галереи"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-secondary">
            <ImagePlus className="h-4 w-4"/>
          </button>}
          <button
            onClick={handlePin}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-secondary ${
              pinned ? "text-primary" : "text-muted-foreground"
            }`}
            aria-label={t("star")}
          >
            <Star className="h-4 w-4" fill={pinned ? "currentColor" : "none"} />
          </button>

          {toolVisible("outline")&&<button type="button" aria-label="Оглавление заметки" aria-expanded={outlineOpen}
            onClick={()=>setOutlineOpen(open=>!open)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
            <ListTree className="h-4 w-4"/>
          </button>}
          {toolVisible("search")&&<button type="button" onClick={()=>findOpen?dismissFind():setFindOpen(true)}
            aria-label="Найти в заметке" aria-expanded={findOpen}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
            <Search className="h-4 w-4"/>
          </button>}
          {toolVisible("checklist")&&<Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Добавить список дел" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
                <ListChecks className="h-4 w-4"/>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={8} className="w-52 rounded-xl p-2">
              <p className="px-2 pb-1 text-xs font-semibold">Форма отметок</p>
              {([{shape:"square",label:"Квадрат",symbol:"□"},{shape:"circle",label:"Круг",symbol:"○"},
                {shape:"diamond",label:"Ромб",symbol:"◇"},{shape:"check",label:"Галочка",symbol:"✓"}] as const).map(choice=>(
                <button type="button" key={choice.shape} onMouseDown={event=>event.preventDefault()}
                  onClick={()=>{
                    setCheckShape(choice.shape);
                    if(!editor)return;
                    editor.chain().focus().insertContent({type:"waveChecklistItem",
                      attrs:{shape:choice.shape,done:false},content:[{type:"text",text:" "}]}).run();
                  }}
                  className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-secondary ${checkShape===choice.shape?"text-primary":""}`}>
                  <span className="w-5 text-center text-lg">{choice.symbol}</span>{choice.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>}
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Оформление листа" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
                <WandSparkles className="h-4 w-4"/>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 rounded-xl p-2">
              <p className="px-2 py-1 text-xs font-semibold">Спокойное оформление</p>
              {PAPER_MOODS.map(mood=><button type="button" key={mood.id}
                onClick={()=>{setPaperMood(mood.id);if(mood.id!=="solid")setCanvasBg(mood.background);}}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-secondary ${paperMood===mood.id?"text-primary":""}`}>
                <span className="h-6 w-6 shrink-0 rounded-md border border-border" style={{background:mood.background,backgroundImage:mood.gradient||undefined}}/>
                {mood.name}
              </button>)}
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Разметка бумаги" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
                <Grid3X3 className="h-4 w-4"/>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48 rounded-xl p-2">
              <p className="px-2 py-1 text-xs font-semibold">Разметка листа</p>
              {PAPER_RULES.map(rule=><button type="button" key={rule.id} onClick={()=>setPaperRule(rule.id)}
                className={`flex min-h-11 w-full items-center rounded-lg px-2 text-left text-sm hover:bg-secondary ${paperRule===rule.id?"text-primary":""}`}>
                {rule.name}
              </button>)}
            </PopoverContent>
          </Popover>
          {toolVisible("insert")&&<Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Вставить блок" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
                <Blocks className="h-4 w-4"/>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={8} onOpenAutoFocus={e=>e.preventDefault()}
              className="max-h-[min(23rem,65dvh)] w-56 overflow-y-auto rounded-xl p-2">
              <p className="px-2 pb-1 text-xs font-semibold">Вставить в заметку</p>
              {blockChoices.map(item=><button type="button" key={item.id}
                onPointerDown={e=>e.preventDefault()} onMouseDown={e=>e.preventDefault()}
                onClick={()=>chooseBlock(item.id)}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-secondary">
                <span className="w-5 text-center">{item.icon}</span>{item.label}
              </button>)}
            </PopoverContent>
          </Popover>}
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
        {slashText!==null && visibleSlashChoices.length>0 && <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
            role="listbox" aria-label="Быстрое меню вставки">
            {visibleSlashChoices.map(item=><button type="button" key={item.id}
              onMouseDown={event=>event.preventDefault()} onClick={()=>chooseBlock(item.id)}
              className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-xs hover:bg-secondary">
              <span className="w-5 text-center">{item.icon}</span>{item.label}
            </button>)}
          </div>}
        {outlineOpen&&<div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border bg-card p-2"
          role="navigation" aria-label="Оглавление заметки">
          <p className="px-2 pb-1 text-xs text-muted-foreground">Заголовки и разделы</p>
          {outline.length===0?<p className="px-2 py-3 text-xs text-muted-foreground">Добавьте заголовок или сворачиваемый раздел.</p>:
            outline.map(item=><button key={item.pos} type="button"
              className="block w-full truncate rounded-lg px-3 py-2 text-left text-xs hover:bg-secondary"
              style={{paddingLeft:Math.min(item.depth,5)*8+8}}
              onClick={()=>{
                if(!editor)return;
                editor.chain().focus().setTextSelection(Math.min(editor.state.doc.content.size,item.pos+(item.type==="page"?0:1))).run();
                editor.view.domAtPos(item.pos+1).node.parentElement?.scrollIntoView({block:"nearest",behavior:"smooth"});
              }}>
              {item.type==="page"?"▤ ":item.type==="fold"?"▸ ":"§ "}{item.title}
            </button>)}
        </div>}
        {findOpen && <div role="search" aria-label="Поиск внутри заметки"
          className="mt-2 flex min-w-0 items-center gap-1 rounded-xl border border-border bg-secondary/50 px-2 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground"/>
          <input aria-label="Искать слово" autoFocus maxLength={100} placeholder="Найти слово…"
            value={findQuery} onChange={e=>{const q=e.target.value;setFindQuery(q);setFindActive(0);setSearchDecoration(q,0);}}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"/>
          <span aria-live="polite" className="shrink-0 text-[10px] text-muted-foreground">{findQuery?(hits.length?`${findActive+1}/${hits.length}`:"0/0"):"—"}</span>
          <button type="button" disabled={!hits.length} onClick={()=>stepFind(-1)} aria-label="Предыдущее совпадение" className="grid h-8 w-8 shrink-0 place-items-center disabled:opacity-30"><ChevronUp className="h-4 w-4"/></button>
          <button type="button" disabled={!hits.length} onClick={()=>stepFind(1)} aria-label="Следующее совпадение" className="grid h-8 w-8 shrink-0 place-items-center disabled:opacity-30"><ChevronDown className="h-4 w-4"/></button>
          <button type="button" onClick={dismissFind} aria-label="Закрыть поиск" className="grid h-8 w-8 shrink-0 place-items-center"><X className="h-4 w-4"/></button>
        </div>}
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
          style={{ backgroundColor: canvasBg, ...paperAppearance(paperMood,paperRule) }}
        >
          <EditorContent editor={editor} style={{
            "--wave-note-caret": noteCaretColor(canvasBg),
            "--wave-find-contrast": noteCaretColor(canvasBg),
            "--wave-note-ink": editorInk(isNew,note?.style?.color),
          } as React.CSSProperties} />
        </div>
        <p className="mt-2 shrink-0 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {t("save")}
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
