import { useEffect, useState } from "react";
import type React from "react";

/** Curated tonal palette: neutrals, then muted → vivid tones per hue. */
export const PALETTE = [
  "#FFFFFF", "#D4D4D8", "#A1A1AA", "#52525B", "#27272A", "#000000",
  "#FCA5A5", "#FDBA74", "#FDE68A", "#86EFAC", "#7DD3FC", "#C4B5FD",
  "#EF4444", "#F97316", "#EAB308", "#22C55E", "#0EA5E9", "#8B5CF6",
  "#991B1B", "#9A3412", "#854D0E", "#166534", "#075985", "#5B21B6",
];

/** Shared color picker: curated swatches, preview, custom wheel and hex field. */
export function ColorGrid({
  colors,
  value,
  onChange,
}: {
  colors: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  const [hex, setHex] = useState(value.toUpperCase());
  useEffect(() => setHex(value.toUpperCase()), [value]);
  const commitHex = (raw: string) => {
    const v = raw.trim().replace(/^#?/, "#");
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toUpperCase());
  };
  const [custom, setCustom] = useState(false);
  return (
    <div className="w-full space-y-3 p-1">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-lg border border-border shadow-inner"
          style={{ background: value }}
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Color</p>
          <p className="truncate font-mono text-xs">{value.toUpperCase()}</p>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {colors.map((c) => {
          const selected = value.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(c)}
              aria-label={c}
              aria-pressed={selected}
              className={`aspect-square w-full rounded-full border border-border/60 transition-transform active:scale-90 ${
                selected ? "ring-2 ring-primary ring-offset-2 ring-offset-popover" : ""
              }`}
              style={{ background: c }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          aria-label="Custom color"
          aria-expanded={custom}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setCustom((v) => !v)}
          className={`h-8 w-8 shrink-0 rounded-lg border bg-[conic-gradient(from_0deg,#ef4444,#eab308,#22c55e,#0ea5e9,#8b5cf6,#ef4444)] ${custom ? "border-primary ring-2 ring-primary/40" : "border-border"}`}
        />
        <input
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onBlur={() => commitHex(hex)}
          onKeyDown={(e) => e.key === "Enter" && commitHex(hex)}
          maxLength={7}
          spellCheck={false}
          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-secondary/40 px-2 font-mono text-xs uppercase outline-none focus:border-primary"
        />
      </div>
      {custom && <HsvPicker value={value} onChange={onChange} />}
    </div>
  );
}

function hexToHsv(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

function hsvToHex(h: number, s: number, v: number) {
  const f = (k: number) => {
    const x = (k + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(x, 4 - x, 1))) * 255);
  };
  return "#" + [f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** In-app dark color picker (saturation/brightness area + hue strip); replaces the OS dialog. */
function HsvPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  useEffect(() => {
    if (hsvToHex(...hsv) !== value.toUpperCase()) setHsv(hexToHsv(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const set = (next: [number, number, number]) => {
    setHsv(next);
    onChange(hsvToHex(...next));
  };
  const drag = (el: HTMLElement, e: React.PointerEvent, apply: (x: number, y: number) => void) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent | React.PointerEvent) => {
      const r = el.getBoundingClientRect();
      apply(
        Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
        Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
      );
    };
    move(e);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  const [h, s, v] = hsv;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-2">
      <div
        className="relative h-32 w-full cursor-crosshair touch-none rounded-lg"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h} 100% 50%))`,
        }}
        onPointerDown={(e) => drag(e.currentTarget, e, (x, y) => set([h, x, 1 - y]))}
      >
        <span
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground shadow"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: hsvToHex(h, s, v) }}
        />
      </div>
      <div
        className="relative h-4 w-full cursor-pointer touch-none rounded-full"
        style={{ background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}
        onPointerDown={(e) => drag(e.currentTarget, e, (x) => set([Math.min(359.9, x * 360), s, v]))}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground shadow"
          style={{ left: `${(h / 360) * 100}%`, background: `hsl(${h} 100% 50%)` }}
        />
      </div>
    </div>
  );
}

