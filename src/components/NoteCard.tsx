import { useRef } from "react";
import type React from "react";
import type { Note, ViewMode } from "@/lib/notes-store";
import { Check, FileText, FileType2, Star } from "lucide-react";
import { formatBytes } from "@/lib/pdf-files";
import {reminderLabel} from "@/lib/note-reminders";
import {checklistSummary} from "@/lib/note-checklist-summary";
import {noteSearchSnippet,readableText} from "@/lib/note-search";

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Shared geometry for notes and their native in-feed ad slots. */
export function noteCardShell(view: ViewMode) {
  const layout = view === "grid"
    ? "aspect-[4/5] p-4 flex flex-col"
    : view === "table"
      ? "min-h-[142px] flex items-center gap-4 p-3"
      : "min-h-[154px] p-4 flex flex-col gap-2";
  return `relative min-w-0 rounded-2xl border border-border bg-card/70 backdrop-blur ${layout}`;
}

export function NoteCard({
  note,
  view,
  selected,
  selectionMode = false,
  onToggle,
  onOpen,
  onMove,
  searchQuery,
}: {
  note: Note;
  view: ViewMode;
  selected: boolean;
  selectionMode?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onMove: (targetId:string)=>void;
  searchQuery?:string;
}) {
  const isPdf = note.kind === "pdf";
  const isFavorite = isPdf ? !!note.pdf?.favorite : !!note.pinned;
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const dragging=useRef(false);
  const dropTarget=useRef<string|null>(null);
  const startPos = useRef({ x: 0, y: 0 });

  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  // Short tap opens the record; holding ~450ms toggles selection.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    longPressed.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };
    clearPress();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      longPressed.current = true;
      navigator.vibrate?.(15);
      onToggle();
    }, 450);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (Math.abs(e.clientX - startPos.current.x) > 10 || Math.abs(e.clientY - startPos.current.y) > 10) clearPress();
  };
  const handleClick = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    clearPress();
    // While multi-select is active, a short tap toggles instead of opening.
    if (selectionMode) onToggle();
    else onOpen();
  };

  const cardBg = /^#[0-9a-f]{6}$/i.test(note.cardColor??"")?note.cardColor:undefined;
  const reminder=reminderLabel(note.reminderAt);
  const checklist=isPdf?null:checklistSummary(note.body);
  // Keep status in the normal preview line; floating tags hid note dates
  // and overlapped controls in table/list/grid layouts.
  const badges=[checklist?.total?`☑ ${checklist.done}/${checklist.total}`:"",reminder].filter(Boolean);
  const preview=isPdf
    ? `PDF · ${note.pdf?.pageCount ?? 0} стр. · ${formatBytes(note.pdf?.size ?? 0)}`
    : [...badges,(searchQuery?noteSearchSnippet(note,searchQuery,140):readableText(note.body).slice(0,140))||"Пусто…"].join(" · ");
  const light = cardBg ? (parseInt(cardBg.slice(1,3),16)*.2126+parseInt(cardBg.slice(3,5),16)*.7152+parseInt(cardBg.slice(5,7),16)*.0722)>145 : false;
  const ink = cardBg?(light?"#18181B":"#FFFFFF"):undefined;
  const muted = cardBg?(light?"#3F3F46":"#E5E7EB"):undefined;
  return (
    <div
      data-wave-note-id={note.id}
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onClick={handleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: "none",backgroundColor:cardBg,color:ink } as React.CSSProperties}
      onKeyDown={(e) => {
        if (e.key === " ") { e.preventDefault(); onToggle(); }
        if (e.key === "Enter") onOpen();
      }}
      className={`group cursor-pointer select-none transition-all active:scale-[0.98] ${noteCardShell(view)} ${selectionMode?"pl-12 ":""} ${
        selected ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/40"
      }`}
    >
      {selectionMode && <button type="button" aria-label="Перетащить заметку"
        className="absolute left-1.5 top-2 z-20 grid h-10 w-9 touch-none place-items-center rounded-lg text-muted-foreground hover:bg-secondary/70"
        onClick={e=>e.stopPropagation()}
        onPointerDown={e=>{e.stopPropagation();e.preventDefault();clearPress();dragging.current=true;dropTarget.current=null;e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{
          if(!dragging.current)return;e.stopPropagation();e.preventDefault();
          const target=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-wave-note-id]");
          const id=target?.getAttribute("data-wave-note-id");
          if(id&&id!==note.id)dropTarget.current=id;
          const scroll=e.currentTarget.closest("main") as HTMLElement|null;
          if(scroll){const bounds=scroll.getBoundingClientRect();if(e.clientY<bounds.top+48)scroll.scrollTop-=13;else if(e.clientY>bounds.bottom-48)scroll.scrollTop+=13;}
        }}
        onPointerUp={e=>{e.stopPropagation();e.preventDefault();const dest=dropTarget.current;dragging.current=false;dropTarget.current=null;if(dest)onMove(dest);}}
        onPointerCancel={e=>{e.stopPropagation();dragging.current=false;dropTarget.current=null;}}>
        <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>}
      {selected && (
        <span className="absolute right-2 top-2 z-10 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
        {view === "table" ? (
          <>
            <div
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                isPdf ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"
              }`}
            >
              {isPdf ? <FileType2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold">{note.title}</h3>
              <p className="truncate text-xs text-muted-foreground" style={{color:muted}}>{preview}</p>
            </div>
            <span style={{color:muted}} className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {formatDate(note.updatedAt)}
            </span>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <div
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                  isPdf ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"
                }`}
              >
                {isPdf ? <FileType2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              </div>
              <h3 className="line-clamp-2 min-w-0 flex-1 font-display text-base font-semibold leading-tight">
                {note.title}
              </h3>
            </div>

            <p
              style={{color:muted}}
              className={`text-sm text-muted-foreground ${
                view === "grid" ? "line-clamp-6 flex-1" : "line-clamp-2"
              }`}
            >
              {preview}
            </p>
            <div className="mt-auto flex items-center justify-between pt-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {formatDate(note.updatedAt)}
              </span>
              {isFavorite ? (
                <Star
                  aria-label="В избранном"
                  className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400"
                />
              ) : null}
            </div>
          </>
        )}
    </div>
  );
}
