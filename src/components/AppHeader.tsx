import type { ReactNode } from "react";

export function AppHeader({
  title,
  eyebrow,
  right,
}: {
  title: string;
  eyebrow?: string;
  right?: ReactNode;
}) {
  return (
    <header className="z-40 w-full max-w-[100vw] shrink-0 overflow-x-hidden border-b border-border bg-background">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="truncate font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h1 className="truncate font-display text-sm font-semibold leading-tight sm:text-base">
            {title}
          </h1>
        </div>

        {right && <div className="flex shrink-0 items-center gap-1.5">{right}</div>}
      </div>
    </header>
  );
}
