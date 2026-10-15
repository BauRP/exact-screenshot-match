import { useRef } from "react";
import type React from "react";
import type { Note, ViewMode } from "@/lib/notes-store";
import { Check, FileText, FileType2, Star } from "lucide-react";
import { formatBytes } from "@/lib/pdf-files";

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
      ? "flex items-center gap-4 p-3"
      : "p-4 flex flex-col gap-2";
  return `relative min-w-0 rounded-2xl border border-border bg-card/70 backdrop-blur ${layout}`;
}

export function NoteCard({
  note,
  view,
  selected,
  selectionMode = false,
  onToggle,
  onOpen,
}: {
  note: Note;
  view: ViewMode;
  selected: boolean;
  selectionMode?: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const isPdf = note.kind === "pdf";
  const isFavorite = isPdf ? !!note.pdf?.favorite : !!note.pinned;
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
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

  const preview = isPdf
    ? `PDF · ${note.pdf?.pageCount ?? 0} стр. · ${formatBytes(note.pdf?.size ?? 0)}`
    : stripHtml(note.body).slice(0, 180) || "Пусто…";

  return (
    <div
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
      style={{ WebkitTouchCallout: "none" }}
      onKeyDown={(e) => {
        if (e.key === " ") { e.preventDefault(); onToggle(); }
        if (e.key === "Enter") onOpen();
      }}
      className={`group cursor-pointer select-none transition-all active:scale-[0.98] ${noteCardShell(view)} ${
        selected ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/40"
      }`}
    >
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
              <p className="truncate text-xs text-muted-foreground">{preview}</p>
            </div>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
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
