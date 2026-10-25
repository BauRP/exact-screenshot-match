import type { PdfTextOverlay, PdfTextRun } from "@/lib/notes-store";
import { DEFAULT_PDF_FONT, DEFAULT_PDF_FONT_SIZE, DEFAULT_PDF_TEXT_COLOR, fontCss } from "@/lib/pdf-fonts";

/**
 * Rich-text runs for PDF text overlays. Each run carries its own typography so
 * formatting applies only to the selected characters (or newly typed text),
 * never to the whole block.
 */
export type RunStyle = Required<Omit<PdfTextRun, "text">>;
export const STYLE_KEYS = ["bold", "italic", "underline", "fontSize", "fontFamily", "color"] as const;

export function baseStyle(overlay: PdfTextOverlay): RunStyle {
  return {
    bold: !!overlay.bold,
    italic: !!overlay.italic,
    underline: !!overlay.underline,
    fontSize: overlay.fontSize && overlay.fontSize > 0 ? overlay.fontSize : DEFAULT_PDF_FONT_SIZE,
    fontFamily: overlay.fontFamily ?? DEFAULT_PDF_FONT,
    color: overlay.color ?? DEFAULT_PDF_TEXT_COLOR,
  };
}

/** Fully resolved runs (every run has all style fields). */
export function getRuns(overlay: PdfTextOverlay): (RunStyle & { text: string })[] {
  const base = baseStyle(overlay);
  const runs = overlay.runs && overlay.runs.length ? overlay.runs : [{ text: overlay.text }];
  return runs.map((run) => ({ ...base, ...stripUndefined(run), text: run.text }));
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) (out as any)[k] = v;
  return out;
}

type FullRun = RunStyle & { text: string };

function sameStyle(a: RunStyle, b: RunStyle) {
  return STYLE_KEYS.every((k) => a[k] === b[k]);
}

export function normalize(runs: FullRun[]): FullRun[] {
  const out: FullRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, run)) last.text += run.text;
    else out.push({ ...run });
  }
  return out;
}

export function runsText(runs: { text: string }[]) {
  return runs.map((r) => r.text).join("");
}

/** Splits runs so that `offset` falls on a run boundary. */
function splitAt(runs: FullRun[], offset: number): FullRun[] {
  const out: FullRun[] = [];
  let pos = 0;
  for (const run of runs) {
    const end = pos + run.text.length;
    if (offset > pos && offset < end) {
      out.push({ ...run, text: run.text.slice(0, offset - pos) });
      out.push({ ...run, text: run.text.slice(offset - pos) });
    } else out.push({ ...run });
    pos = end;
  }
  return out;
}

export function applyRange(runs: FullRun[], start: number, end: number, patch: Partial<RunStyle>): FullRun[] {
  const split = splitAt(splitAt(runs, start), end);
  let pos = 0;
  const next = split.map((run) => {
    const s = pos;
    pos += run.text.length;
    return s >= start && pos <= end ? { ...run, ...patch } : run;
  });
  return normalize(next);
}

/** True when every character in [start, end) has `key` truthy. */
export function rangeAll(runs: FullRun[], start: number, end: number, key: "bold" | "italic" | "underline") {
  let pos = 0;
  let any = false;
  for (const run of runs) {
    const s = pos;
    pos += run.text.length;
    if (pos <= start || s >= end) continue;
    any = true;
    if (!run[key]) return false;
  }
  return any;
}

/** Style of the character before `offset` (or the first character at 0). */
export function styleAt(runs: FullRun[], offset: number, fallback: RunStyle): RunStyle {
  let pos = 0;
  const target = Math.max(offset - 1, 0);
  for (const run of runs) {
    if (target < pos + run.text.length) return pick(run);
    pos += run.text.length;
  }
  const last = runs[runs.length - 1];
  return last ? pick(last) : fallback;
}

function pick(run: RunStyle): RunStyle {
  const out = {} as RunStyle;
  for (const k of STYLE_KEYS) (out as any)[k] = run[k];
  return out;
}

export function insertAt(runs: FullRun[], offset: number, text: string, style: RunStyle): FullRun[] {
  const split = splitAt(runs, offset);
  const out: FullRun[] = [];
  let pos = 0;
  let inserted = false;
  for (const run of split) {
    if (!inserted && pos === offset) {
      out.push({ ...style, text });
      inserted = true;
    }
    out.push(run);
    pos += run.text.length;
  }
  if (!inserted) out.push({ ...style, text });
  return normalize(out);
}

/** Returns the runs to store: drops fields equal to the overlay base style. */
export function compactRuns(overlay: PdfTextOverlay, runs: FullRun[]): PdfTextRun[] {
  const base = baseStyle(overlay);
  return runs.map((run) => {
    const out: PdfTextRun = { text: run.text };
    for (const k of STYLE_KEYS) if (run[k] !== base[k]) (out as any)[k] = run[k];
    return out;
  });
}

export function runCss(run: RunStyle, viewScale: number): Record<string, string> {
  return {
    "font-size": `${Math.max(run.fontSize * viewScale, 6)}px`,
    "font-family": fontCss(run.fontFamily),
    "font-weight": run.bold ? "700" : "400",
    "font-style": run.italic ? "italic" : "normal",
    "text-decoration": run.underline ? "underline" : "none",
    color: run.color,
  };
}

/* ------------------------------ DOM helpers ------------------------------ */

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderRunsInto(node: HTMLElement, runs: FullRun[], viewScale: number) {
  node.innerHTML = runs
    .map((run, i) => {
      const css = Object.entries(runCss(run, viewScale))
        .map(([k, v]) => `${k}:${v.replace(/"/g, "'")}`)
        .join(";");
      return `<span data-r="${i}" style="${css}">${escapeHtml(run.text)}</span>`;
    })
    .join("");
}

/** Rebuilds runs from the editable DOM after the browser mutated it. */
export function readRunsFromDom(node: HTMLElement, rendered: FullRun[], fallback: RunStyle): FullRun[] {
  const out: FullRun[] = [];
  let lastStyle: RunStyle = rendered[0] ? pick(rendered[0]) : fallback;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const host = (current.parentElement?.closest("[data-r]") as HTMLElement | null) ?? null;
    if (host && node.contains(host)) {
      const idx = Number(host.dataset.r);
      if (rendered[idx]) lastStyle = pick(rendered[idx]);
    }
    const text = (current.textContent ?? "").replace(/\n/g, " ");
    if (text) out.push({ ...lastStyle, text });
    current = walker.nextNode();
  }
  return normalize(out);
}

export function getSelectionOffsets(node: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!node.contains(range.startContainer) || !node.contains(range.endContainer)) return null;
  const measure = (container: Node, offset: number) => {
    const r = document.createRange();
    r.selectNodeContents(node);
    r.setEnd(container, offset);
    return r.toString().length;
  };
  const a = measure(range.startContainer, range.startOffset);
  const b = measure(range.endContainer, range.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** Fallback for Android WebViews without a reliable caretRangeFromPoint.
 * Measures the rendered characters in the tapped PDF text box and picks the
 * visually nearest insertion point, instead of jumping to the end.
 */
export function nearestTextOffset(node: HTMLElement, x: number, y: number): number | null {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let current = walker.nextNode();
  let position = 0;
  let bestOffset: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let examined = 0;

  while (current && examined < 800) {
    const length = current.textContent?.length ?? 0;
    for (let index = 0; index < length && examined < 800; index += 1) {
      range.setStart(current, index);
      range.setEnd(current, index + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const middle = (rect.left + rect.right) / 2;
        const deltaY = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
        const distance = Math.abs(x - middle) + deltaY * 5;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestOffset = position + index + (x >= middle ? 1 : 0);
        }
      }
      examined += 1;
    }
    position += length;
    current = walker.nextNode();
  }
  return bestOffset;
}

export function setSelectionOffsets(node: HTMLElement, start: number, end: number) {
  const locate = (offset: number): [Node, number] => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let pos = 0;
    let n = walker.nextNode();
    let last: Node | null = null;
    while (n) {
      const len = n.textContent?.length ?? 0;
      if (offset <= pos + len) return [n, offset - pos];
      pos += len;
      last = n;
      n = walker.nextNode();
    }
    return last ? [last, last.textContent?.length ?? 0] : [node, 0];
  };
  const [sn, so] = locate(start);
  const [en, eo] = locate(end);
  const range = document.createRange();
  range.setStart(sn, so);
  range.setEnd(en, eo);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
