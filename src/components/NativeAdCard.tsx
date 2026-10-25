import { createElement } from "react";
import { FileText } from "lucide-react";
import type { ViewMode } from "@/lib/notes-store";
import { noteCardShell } from "@/components/NoteCard";
import { HOME_AD_FEED_ID } from "@/lib/native-ads";

/**
 * An ad is a regular feed item, with the same frame/height as a note in
 * each view mode. The real creative is drawn by the native Google SDK on top
 * of this HTML slot; this component never imitates an actual advertisement.
 *
 * The Small native template needs a real, non-clipped area. 90px is the
 * compact in-feed height; the reserved area remains when the ad is offline.
 */
export function NativeAdCard({ view, slotKey }: { view: ViewMode; slotKey: string }) {
  const isGrid = view === "grid";
  const slotHeight = isGrid ? 120 : 90;

  const slot = createElement("capacitor-admob-native", {
    "feed-id": HOME_AD_FEED_ID,
    "slot-key": slotKey,
    "aria-label": "Нативное рекламное объявление",
    style: {
      display: "block",
      width: "100%",
      height: `${slotHeight}px`,
      minHeight: `${slotHeight}px`,
    },
  });

  if (isGrid) {
    // Keep the previously accepted tile appearance unchanged.
    return (
      <div className={`${noteCardShell(view)} min-h-[150px] overflow-hidden`}>
        <div className="flex items-center gap-2 px-1 pb-1 text-[10px] font-semibold text-muted-foreground">
          <FileText className="h-3 w-3" />
          <span>Реклама</span>
        </div>
        {slot}
      </div>
    );
  }

  return (
    <div
      aria-label="Реклама"
      className={`${noteCardShell(view)} overflow-hidden`}
    >
      <div className="min-w-0 w-full flex-1">
        <div className="mb-1 flex min-w-0 items-center gap-2">
          <div className={`grid shrink-0 place-items-center bg-primary/10 text-primary ${
            view === "table" ? "h-6 w-6 rounded-lg" : "h-7 w-7 rounded-lg"
          }`}>
            <FileText className="h-4 w-4" />
          </div>
          <h3 className={`min-w-0 truncate font-semibold ${
            view === "table" ? "text-sm" : "font-display text-base"
          }`}>
            Реклама
          </h3>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            Объявление
          </span>
        </div>
        <div className="relative h-[90px] w-full min-w-0 overflow-hidden rounded-lg">
          {slot}
        </div>
      </div>
    </div>
  );
}
