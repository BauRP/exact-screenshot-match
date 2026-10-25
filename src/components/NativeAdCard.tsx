import { createElement } from "react";
import { FileText } from "lucide-react";
import type { ViewMode } from "@/lib/notes-store";
import { noteCardShell } from "@/components/NoteCard";
import { HOME_AD_FEED_ID } from "@/lib/native-ads";

export function NativeAdCard({ view, slotKey }: { view: ViewMode; slotKey: string }) {
  // The native SDK supplies the actual ad. Keep this placeholder if offline,
  // without permission, or when Google's inventory is unavailable.
  const slot = createElement("capacitor-admob-native", {
    "feed-id": HOME_AD_FEED_ID,
    "slot-key": slotKey,
    "aria-label": "Рекламное объявление",
    style: { display: "block", width: "100%", height: "120px", minHeight: "120px" },
  });
  return (
    <div className={`${noteCardShell(view)} ${view === "table" ? "min-h-[150px] overflow-hidden p-2" : "min-h-[150px] overflow-hidden p-2"}`}>
      <div className="flex items-center gap-2 px-1 pb-1 text-[10px] font-semibold text-muted-foreground">
        <FileText className="h-3 w-3" />
        <span>Реклама</span>
      </div>
      {slot}
    </div>
  );
}
