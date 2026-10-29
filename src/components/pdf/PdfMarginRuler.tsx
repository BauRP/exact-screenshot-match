import { useRef } from "react";
import { normalizePdfMargins } from "@/lib/pdf-text-layout";

export type PdfMargins = { left: number; right: number };

type Handle = "left" | "right";

/** Hairline ruler with accessible 44px touch targets, never tied to screen scroll. */
export function PdfMarginRuler({ value, onChange }: {
  value: PdfMargins;
  onChange: (value: PdfMargins) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<Handle | null>(null);
  const currentRef = useRef(value);
  currentRef.current = value;

  const setFromClient = (side: Handle, clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const point = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
    const old = currentRef.current;
    const next = side === "left"
      ? normalizePdfMargins(Math.min(point, old.right - 4), old.right)
      : normalizePdfMargins(old.left, Math.max(point, old.left + 4));
    currentRef.current = next;
    onChange(next);
  };

  const begin = (side: Handle, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); // keep text caret and prevent page-scroll jumps
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = side;
    setFromClient(side, event.clientX);
  };

  const keys = (side: Handle, event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 5 : 1;
    let delta = 0;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") delta = -step;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") delta = step;
    const old = currentRef.current;
    if (event.key === "Home") delta = -100;
    if (event.key === "End") delta = 100;
    if (!delta) return;
    event.preventDefault();
    const next = side === "left"
      ? normalizePdfMargins(Math.min(old.left + delta, old.right - 4), old.right)
      : normalizePdfMargins(old.left, Math.max(old.right + delta, old.left + 4));
    currentRef.current = next;
    onChange(next);
  };

  return (
    <div className="mt-2 rounded-lg border border-border/70 bg-secondary/25 px-4 py-0.5"
      aria-label="Линейка отступов PDF">
      <div className="relative h-10" ref={trackRef}>
        <div className="pointer-events-none absolute inset-x-0 top-[19px] h-px bg-border" />
        <div className="pointer-events-none absolute top-[19px] h-px bg-primary"
          style={{ left: `${value.left}%`, right: `${100 - value.right}%` }} />
        {Array.from({ length: 21 }, (_, index) => (
          <span key={index} aria-hidden="true"
            className="pointer-events-none absolute top-[11px] w-px bg-muted-foreground/35"
            style={{ left: `${index * 5}%`, height: index % 2 === 0 ? 8 : 5 }} />
        ))}
        {(["left", "right"] as const).map((side) => (
          <button key={side} type="button" role="slider"
            aria-label={side === "left" ? "Левый отступ текста" : "Правый отступ текста"}
            aria-valuemin={side === "left" ? 0 : value.left + 4}
            aria-valuemax={side === "left" ? value.right - 4 : 100}
            aria-valuenow={Math.round(value[side])}
            aria-valuetext={`${Math.round(value[side])}% ширины страницы`}
            tabIndex={0}
            onPointerDown={(event) => begin(side, event)}
            onPointerMove={(event) => {
              if (activeRef.current === side && event.currentTarget.hasPointerCapture(event.pointerId))
                setFromClient(side, event.clientX);
            }}
            onPointerUp={() => { activeRef.current = null; }}
            onPointerCancel={() => { activeRef.current = null; }}
            onKeyDown={(event) => keys(side, event)}
            className="absolute top-0 z-10 flex h-10 w-11 -translate-x-1/2 touch-none items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            style={{ left: `${value[side]}%` }}>
            <span className="flex h-[19px] w-[15px] items-center justify-center rounded-md border border-primary/70 bg-card shadow-sm">
              <span className="h-2.5 w-0.5 rounded-full bg-primary" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
