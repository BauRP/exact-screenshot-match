/**
 * Developer-only AdMob diagnostics. Delete this file and its one-line mount
 * when diagnostics are no longer needed. The release builds do not render it.
 *
 * To opt in for a test APK, set VITE_ADMOB_DIAGNOSTICS=true at build time.
 * Production/live-ad builds must not include the debug panel.
 */
import { Radio, RefreshCw } from "lucide-react";
import { requestAdRetry, useAdDiagnostic } from "@/lib/ad-diagnostics";

export function AdMobDiagnosticsPanel({ onGoHome }: { onGoHome: () => void }) {
  const diagnostic = useAdDiagnostic();

  const retry = () => {
    // Queue before navigating. A retry listener does not exist while the
    // settings page is active; the home feed consumes this pending request.
    requestAdRetry();
    onGoHome();
  };

  return (
    <section data-testid="admob-diagnostics-panel">
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Диагностика тестовой рекламы
        </h2>
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground/60">06</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card/60">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary/60 text-primary">
            <Radio className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium leading-tight">{diagnostic.message}</p>
            <p className="text-[11px] leading-tight text-muted-foreground">
              { `Состояние: ${diagnostic.status}; загрузок: ${diagnostic.loadedCount}; ошибок: ${diagnostic.failedCount}` }
            </p>
          </div>
          <button type="button" onClick={retry}
            className="inline-flex h-8 max-w-[9.5rem] shrink-0 items-center justify-center rounded-full bg-secondary/70 px-3 text-xs font-semibold text-foreground hover:bg-secondary">
            <RefreshCw className="mr-1 inline h-3 w-3" /> Повторить
          </button>
        </div>
        {diagnostic.issueCode && (
          <p className="break-words px-3 pb-1 text-xs text-muted-foreground">Причина: {diagnostic.issueCode}</p>
        )}
        {diagnostic.advice && (
          <p className="break-words px-3 pb-2 text-xs text-muted-foreground">Что делать: {diagnostic.advice}</p>
        )}
        {diagnostic.lastError && (
          <p className="break-words px-3 pb-2 text-xs text-destructive">Технические сведения: {diagnostic.lastError}</p>
        )}
        {diagnostic.lastSlot && (
          <p className="break-words px-3 pb-2 text-[10px] text-muted-foreground">Место: {diagnostic.lastSlot}</p>
        )}
      </div>
    </section>
  );
}
