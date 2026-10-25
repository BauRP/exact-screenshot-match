import { createElement, memo } from "react";
import { FileText } from "lucide-react";
import { HOME_AD_FEED_ID } from "@/lib/native-ads";

/**
 * One permanent 120px Small native-ad slot for list, grid, and table.
 *
 * The ad's template, attribution, click targets and creative are native Google
 * SDK views. Our HTML is only a reserved rectangle and an empty-state label.
 * Never alter its height on a view change: 120 x 120 CSS pixels is the plugin's
 * documented minimum for NativeAdTemplate.Small (v8.2.1).
 */
export const NativeAdCard = memo(function NativeAdCard({ slotKey }: { slotKey: string }) {
  const slot = createElement("capacitor-admob-native", {
    "feed-id": HOME_AD_FEED_ID,
    "slot-key": slotKey,
    "aria-label": "Нативная реклама",
    style: {
      position: "absolute",
      inset: 0,
      display: "block",
      width: "100%",
      height: "120px",
      minHeight: "120px",
    },
  });

  return (
    <div
      role="group"
      aria-label="Реклама"
      className="relative box-border h-[120px] min-h-[120px] w-full min-w-0 shrink-0 rounded-2xl border border-border bg-card/70"
    >
      {/* Visible only as an empty placeholder: a loaded native ad draws above the WebView. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-start gap-2 p-3 text-xs text-muted-foreground"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-4 w-4" />
        </span>
        <span className="pt-1 font-semibold">Реклама</span>
      </div>
      {slot}
    </div>
  );
});
