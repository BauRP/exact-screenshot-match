import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Info,
  Minus,
  Plus,
  Printer,
  RotateCw,
  Scissors,
  Search,
  Share2,
  Star,
  Type,
  Merge,
  Bold,
  Italic,
  Underline,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColorGrid, PALETTE } from "@/components/ColorGrid";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getNote, updateNote, createNote, useNotes, type PdfTextOverlay } from "@/lib/notes-store";
import {
  DEFAULT_PDF_FONT,
  DEFAULT_PDF_FONT_SIZE,
  DEFAULT_PDF_TEXT_COLOR,
  PDF_FONTS,
  fontCss,
  hexToRgb,
  standardFontKey,
} from "@/lib/pdf-fonts";
import {
  applyRange,
  baseStyle,
  compactRuns,
  getRuns,
  getSelectionOffsets,
  insertAt,
  rangeAll,
  readRunsFromDom,
  renderRunsInto,
  runCss,
  runsText,
  setSelectionOffsets,
  styleAt,
  type RunStyle,
} from "@/lib/pdf-runs";
import { formatBytes, loadPdfFile, pickPdfFile, savePdfFile } from "@/lib/pdf-files";

export const Route = createFileRoute("/pdf/$id")({
  head: () => ({ meta: [
    { title: "PDF viewer — Wave Notes" },
    { name: "description", content: "View and annotate your PDF in Wave Notes." },
    { property: "og:title", content: "PDF viewer — Wave Notes" },
    { property: "og:description", content: "View and annotate your PDF in Wave Notes." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PdfViewerScreen,
});

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;

type TextItemBox = {
  text: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  /** Real typography of the source segment, in PDF points. */
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
};

/** Maps a PDF font (name + generic family) onto the closest editor font. */
function detectFont(rawName: string, family: string): { fontFamily: string; bold: boolean; italic: boolean } {
  const name = rawName.replace(/^[A-Z]{6}\+/, "");
  const lower = `${name} ${family}`.toLowerCase();
  const bold = /bold|black|heavy|semibold|demi/.test(lower);
  const italic = /italic|oblique/.test(lower);
  const direct = PDF_FONTS.find((f) => lower.replace(/[\s_-]/g, "").includes(f.name.toLowerCase().replace(/\s/g, "")));
  let fontFamily = direct?.name;
  if (!fontFamily) {
    if (/courier|mono/.test(lower)) fontFamily = "Courier New";
    else if (/times|serif|roman|georgia|garamond/.test(lower) && !/sans/.test(lower)) fontFamily = "Times New Roman";
    else fontFamily = "Arial";
  }
  return { fontFamily, bold, italic };
}

function roundSize(points: number) {
  return Math.max(4, Math.round(points * 2) / 2);
}

function cssToReact(css: Record<string, string>): React.CSSProperties {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(css)) {
    out[key.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())] = value;
  }
  return out as React.CSSProperties;
}

function countMatches(haystack: string, needle: string) {
  if (!needle) return 0;
  let count = 0;
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    count += 1;
    from = haystack.indexOf(needle, from + needle.length);
  }
  return count;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createOverlayId() {
  return `ov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function PdfViewerScreen() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  // Subscribe to the notes store so favorite/overlay updates re-render.
  useNotes();
  const note = getNote(id);

  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageCount, setPageCount] = useState(note?.pdf?.pageCount ?? 0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [textTool, setTextTool] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [textBoxes, setTextBoxes] = useState<TextItemBox[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(0);
  const [viewScale, setViewScale] = useState(1);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [searchNeedle, setSearchNeedle] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const renderTaskRef = useRef<any>(null);
  const editingNodeRef = useRef<HTMLSpanElement | null>(null);
  // Remember where the user actually tapped while React mounts an editable overlay.
  const pendingTapRef = useRef<{ x: number; y: number } | null>(null);

  const overlays = useMemo(() => note?.pdf?.overlays ?? [], [note]);
  const pageOverlays = useMemo(() => overlays.filter((item) => item.page === page), [overlays, page]);

  const goBack = useCallback(() => {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: "/" });
  }, [navigate, router]);

  /* ---------------------------------------------------------------- load */

  useEffect(() => {
    let cancelled = false;
    loadPdfFile(id).then((buffer) => {
      if (cancelled) return;
      if (!buffer) setLoadError("Файл не найден в локальном хранилище.");
      else setBytes(buffer);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;

    (async () => {
      try {
        const pdfjs: any = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const task = pdfjs.getDocument({ data: bytes.slice(0) });
        const doc = await task.promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setPageCount(doc.numPages);
        setPage((current) => clamp(current, 1, doc.numPages));
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadError("Не удалось открыть документ.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bytes]);

  /* -------------------------------------------------------------- render */

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    (async () => {
      const pdfPage = await pdfDoc.getPage(page);
      if (cancelled) return;

      const container = scrollRef.current;
      const available = (container?.clientWidth ?? 360) - 16;
      const base = pdfPage.getViewport({ scale: 1, rotation });
      const fitScale = available / base.width;
      const viewport = pdfPage.getViewport({ scale: fitScale * zoom, rotation });

      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setCanvasHeight(viewport.height);
      setViewScale(viewport.scale || 1);

      renderTaskRef.current?.cancel?.();
      const task = pdfPage.render({
        canvasContext: context,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      renderTaskRef.current = task;

      try {
        await task.promise;
      } catch {
        return;
      }
      if (cancelled) return;

      const content = await pdfPage.getTextContent();
      const pdfjs: any = await import("pdfjs-dist");
      const boxes: TextItemBox[] = content.items
        .filter((item: any) => typeof item.str === "string" && item.str.trim())
        .map((item: any) => {
          const tx = pdfjs.Util.transform(viewport.transform, item.transform);
          const height = Math.hypot(tx[2], tx[3]) || 12;
          const width = item.width * (viewport.scale || 1);
          const style = (content.styles ?? {})[item.fontName] ?? {};
          let realName = String(item.fontName ?? "");
          try {
            if (pdfPage.commonObjs.has(item.fontName)) {
              const fontObj = pdfPage.commonObjs.get(item.fontName);
              realName = String(fontObj?.name ?? fontObj?.loadedName ?? realName);
            }
          } catch {
            // Font object not resolved yet — fall back to the style family.
          }
          const detected = detectFont(realName, String(style.fontFamily ?? ""));
          return {
            // Real rendered size = on-page glyph height / page scale (includes page CTM).
            fontSize: roundSize(height / (viewport.scale || 1)),
            ...detected,
            text: item.str,
            leftPct: (tx[4] / viewport.width) * 100,
            topPct: ((tx[5] - height) / viewport.height) * 100,
            widthPct: (width / viewport.width) * 100,
            heightPct: (height / viewport.height) * 100,
          };
        });
      if (!cancelled) setTextBoxes(boxes);
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, page, zoom, rotation]);

  /* ------------------------------------------------------- pinch to zoom */

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const distanceOf = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      );

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        pinchRef.current = { distance: distanceOf(event.touches), zoom };
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const next = clamp((distanceOf(event.touches) / pinch.distance) * pinch.zoom, MIN_ZOOM, MAX_ZOOM);
      setZoom(Number(next.toFixed(3)));
    };
    const onTouchEnd = () => {
      pinchRef.current = null;
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      setZoom((current) => clamp(Number((current * Math.exp(-dy * 0.0015)).toFixed(3)), MIN_ZOOM, MAX_ZOOM));
    };

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("wheel", onWheel);
    };
  }, [zoom]);

  /* ------------------------------------------------------------ overlays */

  const persistOverlays = useCallback(
    (next: PdfTextOverlay[]) => {
      const current = getNote(id);
      if (!current?.pdf) return;
      updateNote(id, { pdf: { ...current.pdf, overlays: next } });
    },
    [id],
  );

  const editingOverlay = useMemo(
    () => overlays.find((item) => item.id === editingId) ?? null,
    [overlays, editingId],
  );

  const patchOverlay = useCallback(
    (overlayId: string, patch: Partial<PdfTextOverlay>) => {
      const next = overlays.map((item) =>
        item.id === overlayId ? { ...item, ...patch } : item,
      );
      persistOverlays(next);
    },
    [overlays, persistOverlays],
  );

  const commitEditing = useCallback(() => {
    const current = editingId ? overlays.find((item) => item.id === editingId) : null;
    if (current && !current.text.trim() && !current.cover) {
      persistOverlays(overlays.filter((item) => item.id !== current.id));
    }
    editingNodeRef.current = null;
    setEditingId(null);
    setFontMenuOpen(false);
  }, [editingId, overlays, persistOverlays]);

  /* ---------------- Scoped rich-text formatting for the active box -------- */
  type FullRun = RunStyle & { text: string };
  const renderedRunsRef = useRef<FullRun[]>([]);
  const selRef = useRef<{ start: number; end: number } | null>(null);
  const pendingRef = useRef<{ offset: number; style: RunStyle } | null>(null);
  /** Typing color chosen in the palette; survives closing the palette and caret moves. */
  const typingColorRef = useRef<string | null>(null);
  const [activeStyle, setActiveStyle] = useState<RunStyle | null>(null);
  const [draftStyle, setDraftStyle] = useState<RunStyle>({
    bold: false,
    italic: false,
    underline: false,
    fontSize: DEFAULT_PDF_FONT_SIZE,
    fontFamily: DEFAULT_PDF_FONT,
    color: DEFAULT_PDF_TEXT_COLOR,
  });
  const editingOverlayRef = useRef<PdfTextOverlay | null>(null);
  editingOverlayRef.current = editingOverlay;
  const patchOverlayRef = useRef(patchOverlay);
  patchOverlayRef.current = patchOverlay;
  const viewScaleRef = useRef(viewScale);
  viewScaleRef.current = viewScale;

  const currentRuns = useCallback((): FullRun[] => {
    const node = editingNodeRef.current;
    const overlay = editingOverlayRef.current;
    if (!overlay) return [];
    if (!node) return getRuns(overlay);
    return readRunsFromDom(node, renderedRunsRef.current, baseStyle(overlay));
  }, []);

  const refreshActive = useCallback(() => {
    const overlay = editingOverlayRef.current;
    if (!overlay) return setActiveStyle(null);
    const runs = currentRuns();
    const sel = selRef.current ?? { start: runsText(runs).length, end: runsText(runs).length };
    const pending = pendingRef.current;
    if (pending && sel.start === sel.end && pending.offset === sel.start) {
      setActiveStyle(pending.style);
      return;
    }
    const at = styleAt(runs, sel.start === sel.end ? sel.start : sel.start + 1, baseStyle(overlay));
    if (sel.start === sel.end && typingColorRef.current) at.color = typingColorRef.current;
    if (sel.start !== sel.end) {
      at.bold = rangeAll(runs, sel.start, sel.end, "bold");
      at.italic = rangeAll(runs, sel.start, sel.end, "italic");
      at.underline = rangeAll(runs, sel.start, sel.end, "underline");
    }
    setActiveStyle(at);
  }, [currentRuns]);

  const saveRuns = useCallback(
    (overlayId: string, runs: FullRun[]) => {
      const overlay = editingOverlayRef.current;
      if (!overlay) return;
      patchOverlay(overlayId, { runs: compactRuns(overlay, runs), text: runsText(runs) });
    },
    [patchOverlay],
  );

  const rerender = useCallback((runs: FullRun[], start: number, end: number) => {
    const node = editingNodeRef.current;
    if (!node) return;
    renderRunsInto(node, runs, viewScaleRef.current);
    renderedRunsRef.current = runs;
    node.focus({ preventScroll: true });
    setSelectionOffsets(node, start, end);
    selRef.current = { start, end };
  }, []);

  /** Applies a style change to the selection only, or to the next typed text. */
  const applyStyle = useCallback(
    (make: (current: RunStyle, runs: FullRun[], start: number, end: number) => Partial<RunStyle>) => {
      const overlay = editingOverlayRef.current;
      if (!overlay) {
        // No active box yet: the toolbar edits the style for the next box.
        const patch = make(draftStyle, [], 0, 0);
        if (patch.color) typingColorRef.current = patch.color;
        setDraftStyle((prev) => ({ ...prev, ...patch }));
        return;
      }
      const runs = currentRuns();
      const len = runsText(runs).length;
      const sel = selRef.current ?? { start: len, end: len };
      const current = activeStyle ?? styleAt(runs, sel.start, baseStyle(overlay));
      const patch = make(current, runs, sel.start, sel.end);
      // Persist chosen color/font/size as the active typing style for later boxes too.
      const { bold: _b, italic: _i, underline: _u, ...sticky } = patch;
      if (Object.keys(sticky).length) setDraftStyle((prev) => ({ ...prev, ...sticky }));
      if (patch.color) typingColorRef.current = patch.color;
      if (sel.start !== sel.end) {
        const next = applyRange(runs, sel.start, sel.end, patch);
        saveRuns(overlay.id, next);
        rerender(next, sel.start, sel.end);
        pendingRef.current = null;
      } else if ((patch.fontSize !== undefined || patch.fontFamily !== undefined) && len > 0) {
        // With a caret inside a word, change only that word's font/size.
        const text = runsText(runs);
        let a = sel.start;
        let b = sel.start;
        while (a > 0 && !/\s/.test(text[a - 1])) a--;
        while (b < len && !/\s/.test(text[b])) b++;
        if (a === b) { a = 0; b = len; }
        const next = applyRange(runs, a, b, patch);
        saveRuns(overlay.id, next);
        rerender(next, sel.start, sel.start);
        pendingRef.current = null;
      } else {
        if (patch.color) typingColorRef.current = patch.color;
        pendingRef.current = { offset: sel.start, style: { ...current, ...patch } };
        const node = editingNodeRef.current;
        if (node) {
          node.focus();
          setSelectionOffsets(node, sel.start, sel.start);
        }
      }
      refreshActive();
    },
    [activeStyle, currentRuns, refreshActive, rerender, saveRuns],
  );

  const toggleMark = (key: "bold" | "italic" | "underline") =>
    applyStyle((current, runs, start, end) => ({
      [key]: start !== end ? !rangeAll(runs, start, end, key) : !current[key],
    }));

  // Track the caret/selection inside the active box so the toolbar mirrors it.
  useEffect(() => {
    if (!editingId) return;
    const onSel = () => {
      const node = editingNodeRef.current;
      if (!node) return;
      const offsets = getSelectionOffsets(node);
      if (!offsets) return; // focus moved to a toolbar control — keep the last range
      selRef.current = offsets;
      const pending = pendingRef.current;
      if (pending && (offsets.start !== offsets.end || offsets.start !== pending.offset)) pendingRef.current = null;
      refreshActive();
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [editingId, refreshActive]);

  useEffect(() => {
    if (!editingId) {
      selRef.current = null;
      pendingRef.current = null;
      setActiveStyle(null);
    }
  }, [editingId]);

  const mountEditor = useCallback(
    (node: HTMLSpanElement | null, overlay: PdfTextOverlay) => {
      if (!node || editingNodeRef.current === node) return;
      editingNodeRef.current = node;
      const runs = getRuns(overlay);
      renderRunsInto(node, runs, viewScaleRef.current);
      renderedRunsRef.current = runs;
      // Avoid scrolling/jumping to the top when activating an existing PDF line.
      node.focus({ preventScroll: true });
      const end = runsText(runs).length;
      const tap = pendingTapRef.current;
      pendingTapRef.current = null;
      // Place a temporary caret, then resolve the precise tapped character after mount.
      setSelectionOffsets(node, end, end);
      selRef.current = { start: end, end };
      pendingRef.current = null;
      if (tap) {
        requestAnimationFrame(() => {
          if (editingNodeRef.current !== node || !node.isConnected) return;
          const dom = document as Document & {
            caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
            caretRangeFromPoint?: (x: number, y: number) => Range | null;
          };
          const position = dom.caretPositionFromPoint?.(tap.x, tap.y);
          const pointRange = !position ? dom.caretRangeFromPoint?.(tap.x, tap.y) : null;
          const pointNode = position?.offsetNode ?? pointRange?.startContainer;
          const pointOffset = position?.offset ?? pointRange?.startOffset;
          if (pointNode && pointOffset !== undefined && node.contains(pointNode)) {
            const measure = document.createRange();
            measure.selectNodeContents(node);
            measure.setEnd(pointNode, pointOffset);
            const caret = Math.max(0, Math.min(measure.toString().length, runsText(runs).length));
            setSelectionOffsets(node, caret, caret);
            selRef.current = { start: caret, end: caret };
            setActiveStyle(styleAt(runs, caret, baseStyle(overlay)));
          } else {
            // An empty/missed line keeps its normal end insertion point.
            setActiveStyle(styleAt(runs, end, baseStyle(overlay)));
          }
        });
      } else {
        setActiveStyle(styleAt(runs, end, baseStyle(overlay)));
      }
      node.addEventListener("beforeinput", (event: InputEvent) => {
        if (event.inputType !== "insertText" || !event.data) return;
        const offsets = getSelectionOffsets(node);
        if (!offsets || offsets.start !== offsets.end) return;
        const base = baseStyle(editingOverlayRef.current ?? overlay);
        const current = readRunsFromDom(node, renderedRunsRef.current, base);
        let pending = pendingRef.current;
        if (pending && pending.offset !== offsets.start) pending = null;
        const sticky = typingColorRef.current;
        if (!pending && sticky) {
          const at = styleAt(current, offsets.start, base);
          if (at.color.toLowerCase() !== sticky.toLowerCase()) pending = { offset: offsets.start, style: { ...at, color: sticky } };
        }
        if (!pending) return;
        event.preventDefault();
        const next = insertAt(current, offsets.start, event.data, pending.style);
        const caret = offsets.start + event.data.length;
        pendingRef.current = { offset: caret, style: pending.style };
        renderRunsInto(node, next, viewScaleRef.current);
        renderedRunsRef.current = next;
        setSelectionOffsets(node, caret, caret);
        selRef.current = { start: caret, end: caret };
        const live = editingOverlayRef.current ?? overlay;
        patchOverlayRef.current(live.id, { runs: compactRuns(live, next), text: runsText(next) });
      });
      refreshActive();
    },
    [refreshActive],
  );

  const ui = editingOverlay ? (activeStyle ?? baseStyle(editingOverlay)) : textTool ? draftStyle : null;

  const onCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!textTool) {
      if (editingId) commitEditing();
      return;
    }
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;

    const existing = pageOverlays.find(
      (item) =>
        xPct >= item.xPct &&
        xPct <= item.xPct + item.widthPct &&
        yPct >= item.yPct &&
        yPct <= item.yPct + item.heightPct,
    );
    if (existing) {
      pendingTapRef.current = { x: event.clientX, y: event.clientY };
      editingNodeRef.current = null;
      setEditingId(existing.id);
      return;
    }

    const hit = textBoxes.find(
      (box) =>
        xPct >= box.leftPct &&
        xPct <= box.leftPct + box.widthPct &&
        yPct >= box.topPct &&
        yPct <= box.topPct + box.heightPct,
    );

    if (hit) {
      pendingTapRef.current = { x: event.clientX, y: event.clientY };
      const heightPx = (hit.heightPct / 100) * canvasHeight;
      const overlay: PdfTextOverlay = {
        id: createOverlayId(),
        page,
        xPct: hit.leftPct,
        yPct: hit.topPct,
        widthPct: Math.max(hit.widthPct, 8),
        heightPct: hit.heightPct,
        text: hit.text,
        cover: true,
        // Inspect the tapped text's own size; the toolbar value is never applied here.
        fontSize: hit.fontSize > 0 ? hit.fontSize : Math.max(4, roundSize(heightPx / Math.max(viewScale, 0.01))),
        fontFamily: hit.fontFamily,
        bold: hit.bold,
        italic: hit.italic,
        color: DEFAULT_PDF_TEXT_COLOR,
      };
      persistOverlays([...overlays, overlay]);
      editingNodeRef.current = null;
      setEditingId(overlay.id);
      return;
    }

    pendingTapRef.current = { x: event.clientX, y: event.clientY };
    const overlay: PdfTextOverlay = {
      id: createOverlayId(),
      page,
      xPct: clamp(xPct, 0, 90),
      yPct: clamp(yPct, 0, 96),
      widthPct: 40,
      heightPct: Math.max(((draftStyle.fontSize * viewScale * 1.35) / Math.max(canvasHeight, 1)) * 100, 2),
      text: "",
      cover: false,
      fontSize: draftStyle.fontSize,
      fontFamily: draftStyle.fontFamily,
      color: draftStyle.color,
      bold: draftStyle.bold,
      italic: draftStyle.italic,
      underline: draftStyle.underline,
    };
    persistOverlays([...overlays, overlay]);
    editingNodeRef.current = null;
    setEditingId(overlay.id);
  };

  /* ------------------------------------------------------ export helpers */

  const buildBytes = useCallback(async (): Promise<Uint8Array | null> => {
    if (!bytes) return null;
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const document = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
    const fontCache = new Map<string, any>();
    const embedFont = async (key: string) => {
      const cached = fontCache.get(key);
      if (cached) return cached;
      const standard = (StandardFonts as Record<string, any>)[key] ?? StandardFonts.Helvetica;
      const embedded = await document.embedFont(standard);
      fontCache.set(key, embedded);
      return embedded;
    };
    const pages = document.getPages();

    for (const overlay of overlays) {
      const target = pages[overlay.page - 1];
      if (!target) continue;
      const { width, height } = target.getSize();
      const x = (overlay.xPct / 100) * width;
      const boxHeight = Math.max((overlay.heightPct / 100) * height, 10);
      const y = height - (overlay.yPct / 100) * height - boxHeight;

      const runs = getRuns(overlay).filter((run) => run.text);
      // Validate glyphs before masking any original text.
      for (const run of runs) {
        const font = await embedFont(standardFontKey(run.fontFamily, run.bold, run.italic));
        try {
          font.encodeText(run.text);
        } catch {
          throw new Error("This PDF contains characters that require an embedded Unicode font. Export was stopped; the original document is safe.");
        }
      }
      if (overlay.cover) {
        target.drawRectangle({
          x: x - 1, y: y - 1,
          width: (overlay.widthPct / 100) * width + 2,
          height: boxHeight + 2,
          color: rgb(1, 1, 1),
        });
      }
      const maxSize = runs.reduce((m, run) => Math.max(m, run.fontSize), 0) || boxHeight * 0.8;
      const baselineY = y + Math.max((boxHeight - maxSize) / 2, 0) + maxSize * 0.2;
      let cursorX = x;

      for (const run of runs) {
        const size = run.fontSize;
        const font = await embedFont(standardFontKey(run.fontFamily, run.bold, run.italic));
        const { r, g, b } = hexToRgb(run.color);
        try {
          const runWidth = font.widthOfTextAtSize(run.text, size);
          target.drawText(run.text, { x: cursorX, y: baselineY, size, font, color: rgb(r, g, b) });
          if (run.underline && run.text.trim()) {
            target.drawRectangle({
              x: cursorX,
              y: baselineY - size * 0.12,
              width: runWidth,
              height: Math.max(size * 0.06, 0.6),
              color: rgb(r, g, b),
            });
          }
          cursorX += runWidth;
        } catch (error) {
          throw new Error("Unable to write PDF text; no exported file was produced.", { cause: error });
        }
      }
    }

    return document.save();
  }, [bytes, overlays]);

  const shareFile = async () => {
    setBusy(true);
    try {
      const output = await buildBytes();
      if (!output) return;
      const fileName = note?.pdf?.fileName ?? "document.pdf";
      const blob = new Blob([output as unknown as BlobPart], { type: "application/pdf" });

      // Native (Android/iOS): write to cache then hand the file URI to the OS sheet.
      const isNative =
        typeof window !== "undefined" &&
        Boolean(
          (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
            ?.isNativePlatform?.(),
        );

      if (isNative) {
        const [{ Filesystem, Directory }, { Share }] = await Promise.all([
          import("@capacitor/filesystem"),
          import("@capacitor/share"),
        ]);
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error);
          reader.onload = () => {
            const result = String(reader.result ?? "");
            resolve(result.slice(result.indexOf(",") + 1));
          };
          reader.readAsDataURL(blob);
        });
        const safeName = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
        const written = await Filesystem.writeFile({
          path: safeName,
          data: base64,
          directory: Directory.Cache,
        });
        await Share.share({ title: safeName, url: written.uri, dialogTitle: "Поделиться PDF" });
        return;
      }

      const file = new File([blob], fileName, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      // Aborted or unsupported share must never crash the viewer.
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Не удалось подготовить PDF для отправки");
    } finally {
      setBusy(false);
    }
  };

  const printFile = async () => {
    setBusy(true);
    try {
      const output = await buildBytes();
      if (!output) return;
      const blob = new Blob([output as unknown as BlobPart], { type: "application/pdf" });
      const fileName = (note?.pdf?.fileName ?? "document.pdf").toLowerCase().endsWith(".pdf")
        ? (note?.pdf?.fileName ?? "document.pdf")
        : `${note?.pdf?.fileName ?? "document"}.pdf`;

      const isNative =
        typeof window !== "undefined" &&
        Boolean(
          (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
            ?.isNativePlatform?.(),
        );

      // Android: hand the document to the system print spooler (PrintManager).
      if (isNative) {
        const [{ Filesystem, Directory }, { registerPlugin }] = await Promise.all([
          import("@capacitor/filesystem"),
          import("@capacitor/core"),
        ]);
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error);
          reader.onload = () => {
            const result = String(reader.result ?? "");
            resolve(result.slice(result.indexOf(",") + 1));
          };
          reader.readAsDataURL(blob);
        });
        const written = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Cache,
        });
        const PdfPrinter = registerPlugin<{
          print(options: { uri: string; name: string }): Promise<void>;
        }>("PdfPrinter");
        await PdfPrinter.print({ uri: written.uri, name: fileName });
        return;
      }

      const url = URL.createObjectURL(blob);
      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.src = url;
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      };
      document.body.appendChild(frame);
      window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Печать недоступна на этом устройстве");
    } finally {
      setBusy(false);
    }
  };

  const mergeWith = async () => {
    const file = await pickPdfFile();
    if (!file || !bytes) return;
    setBusy(true);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const base = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
      const extra = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const copied = await base.copyPages(extra, extra.getPageIndices());
      copied.forEach((copiedPage) => base.addPage(copiedPage));
      const merged = await base.save();
      const buffer = merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength) as ArrayBuffer;
      await savePdfFile(id, buffer);
      const current = getNote(id);
      if (current?.pdf) {
        updateNote(id, {
          pdf: { ...current.pdf, pageCount: base.getPageCount(), size: merged.byteLength },
        });
      }
      setBytes(buffer);
      toast.success(`Добавлено страниц: ${extra.getPageCount()}`);
    } catch (error) {
      console.error(error);
      toast.error("Не удалось объединить документы");
    } finally {
      setBusy(false);
    }
  };

  const splitCurrentPage = async () => {
    if (!bytes) return;
    setBusy(true);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const rendered = await buildBytes();
      if (!rendered) return;
      const source = await PDFDocument.load(rendered, { ignoreEncryption: true });
      const target = await PDFDocument.create();
      const [copied] = await target.copyPages(source, [page - 1]);
      target.addPage(copied);
      const output = await target.save();
      const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;

      const fileName = `${(note?.pdf?.fileName ?? "document.pdf").replace(/\.pdf$/i, "")}-p${page}.pdf`;
      const created = createNote({
        kind: "pdf",
        title: fileName.replace(/\.pdf$/i, ""),
        folderId: note?.folderId ?? "all",
        pdf: { fileName, size: output.byteLength, pageCount: 1, favorite: false, overlays: [] },
      });
      await savePdfFile(created.id, buffer);
      toast.success("Страница сохранена как отдельный PDF");
    } catch (error) {
      console.error(error);
      toast.error("Не удалось извлечь страницу");
    } finally {
      setBusy(false);
    }
  };

  const runSearch = async () => {
    if (!pdfDoc || !query.trim()) return;
    setSearching(true);
    try {
      const needle = query.trim().toLowerCase();
      let total = 0;
      let firstPage = 0;
      for (let index = 0; index < pdfDoc.numPages; index += 1) {
        const target = ((page + index - 1) % pdfDoc.numPages) + 1;
        const pdfPage = await pdfDoc.getPage(target);
        const content = await pdfPage.getTextContent();
        let pageHits = 0;
        for (const item of content.items as any[]) {
          pageHits += countMatches(String(item.str ?? "").toLowerCase(), needle);
        }
        if (pageHits && !firstPage) firstPage = target;
        total += pageHits;
      }
      if (total) {
        setSearchNeedle(needle);
        setPage(firstPage);
        toast.success(`Найдено: ${total}`);
      } else {
        setSearchNeedle("");
        toast.info("Совпадений не найдено");
      }
    } finally {
      setSearching(false);
    }
  };

  /** Highlight rectangles for every match on the current page. */
  const searchHighlights = useMemo(() => {
    if (!searchNeedle) return [];
    const out: { leftPct: number; topPct: number; widthPct: number; heightPct: number }[] = [];
    for (const box of textBoxes) {
      const lower = box.text.toLowerCase();
      const len = Math.max(box.text.length, 1);
      let from = lower.indexOf(searchNeedle);
      while (from !== -1) {
        out.push({
          leftPct: box.leftPct + (box.widthPct * from) / len,
          topPct: box.topPct,
          widthPct: Math.max((box.widthPct * searchNeedle.length) / len, 0.5),
          heightPct: box.heightPct,
        });
        from = lower.indexOf(searchNeedle, from + searchNeedle.length);
      }
    }
    return out;
  }, [searchNeedle, textBoxes]);

  const toggleFavorite = () => {
    const current = getNote(id);
    if (!current?.pdf) return;
    updateNote(id, { pdf: { ...current.pdf, favorite: !current.pdf.favorite } });
  };

  /* ----------------------------------------------------------------- ui */

  if (!note || note.kind !== "pdf") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">Документ не найден.</p>
        <Button onClick={() => navigate({ to: "/" })}>К списку</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* Tier 1 — top app bar */}
      <header className="flex shrink-0 items-center gap-1 border-b border-border bg-card/80 px-2 py-2 backdrop-blur">
        <button
          type="button"
          aria-label="Назад"
          onClick={goBack}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-secondary active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{note.pdf?.fileName}</h1>
        <button
          type="button"
          aria-label="Поиск"
          onClick={() => setSearchOpen((open) => !open)}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-secondary active:scale-95 ${searchOpen ? "text-primary" : ""}`}
        >
          <Search className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Поделиться"
          onClick={() => void shareFile()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-secondary active:scale-95"
        >
          <Share2 className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Инструменты"
          onClick={() => setPanelOpen((open) => !open)}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-secondary active:scale-95 ${panelOpen ? "bg-secondary text-primary" : ""}`}
        >
          {panelOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </button>
      </header>

      {searchOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/60 px-3 py-2">
          <Input
            autoFocus
            value={query}
            placeholder="Поиск по тексту"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void runSearch()}
            className="h-9"
          />
          <Button size="sm" className="h-9" disabled={searching} onClick={() => void runSearch()}>
            Найти
          </Button>
          <button type="button" aria-label="Закрыть поиск" onClick={() => {
              setSearchOpen(false);
              setSearchNeedle("");
            }} className="p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tier 2 — expandable tool panel */}
      {panelOpen && (
        <div className="shrink-0 border-b border-border bg-card/90 px-2 py-1.5 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <ToolButton label="Пред." onClick={() => setPage((p) => clamp(p - 1, 1, pageCount))}>
                <ChevronLeft className="h-4 w-4" />
              </ToolButton>
              <span className="min-w-[52px] text-center font-mono text-xs text-muted-foreground">
                {page} / {pageCount || 1}
              </span>
              <ToolButton label="След." onClick={() => setPage((p) => clamp(p + 1, 1, pageCount))}>
                <ChevronRight className="h-4 w-4" />
              </ToolButton>
            </div>
            <div className="flex items-center gap-1">
              <ToolButton label="Уменьшить" onClick={() => setZoom((z) => clamp(Number((z - 0.25).toFixed(2)), MIN_ZOOM, MAX_ZOOM))}>
                <Minus className="h-4 w-4" />
              </ToolButton>
              <span className="w-12 text-center font-mono text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <ToolButton label="Увеличить" onClick={() => setZoom((z) => clamp(Number((z + 0.25).toFixed(2)), MIN_ZOOM, MAX_ZOOM))}>
                <Plus className="h-4 w-4" />
              </ToolButton>
            </div>
          </div>

          <div className="mt-1.5 grid grid-cols-8 gap-1">
            <PanelAction label="Поворот" onClick={() => setRotation((r) => (r + 90) % 360)}>
              <RotateCw className="h-4 w-4" />
            </PanelAction>
            <PanelAction label="Текст" active={textTool} onClick={() => setTextTool((value) => !value)}>
              <Type className="h-4 w-4" />
            </PanelAction>
            <PanelAction label="Инфо" onClick={() => setInfoOpen(true)}>
              <Info className="h-4 w-4" />
            </PanelAction>
            <PanelAction label="Избранное" active={note.pdf?.favorite} onClick={toggleFavorite}>
              <Star className={`h-4 w-4 ${note.pdf?.favorite ? "fill-amber-400 text-amber-400" : ""}`} />
            </PanelAction>
            <PanelAction label="Печать" onClick={() => void printFile()}>
              <Printer className="h-4 w-4" />
            </PanelAction>
            <PanelAction label="Объединить" onClick={() => void mergeWith()}>
              <Merge className="h-4 w-4" />
            </PanelAction>
            <PanelAction label="Извлечь" onClick={() => void splitCurrentPage()}>
              <Scissors className="h-4 w-4" />
            </PanelAction>
            <PanelAction label="Поделиться" onClick={() => void shareFile()}>
              <Share2 className="h-4 w-4" />
            </PanelAction>
          </div>
        </div>
      )}

      {/* Inline text formatting toolbar — pinned to the top, bottom stays free */}
      {ui && (
        <div className="relative z-40 shrink-0 border-b border-border bg-card/95 px-2 pb-2 pt-1.5 backdrop-blur">
          {/* Decorative divider first, formatting controls below it */}
          <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-border" />
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
            <div className="flex shrink-0 items-center rounded-lg border border-border bg-secondary/40">
              <button
                type="button"
                aria-label="Меньше"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => applyStyle((cur) => ({ fontSize: clamp(cur.fontSize - 1, 4, 96) }))}
                className="grid h-8 w-8 place-items-center rounded-l-lg hover:bg-secondary active:scale-95"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                min={4}
                max={96}
                step={0.5}
                value={ui.fontSize}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value) || value <= 0) return;
                  applyStyle(() => ({ fontSize: clamp(value, 4, 96) }));
                }}
                aria-label="Размер шрифта"
                className="h-8 w-11 border-x border-border bg-transparent text-center text-xs font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                aria-label="Больше"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => applyStyle((cur) => ({ fontSize: clamp(cur.fontSize + 1, 4, 96) }))}
                className="grid h-8 w-8 place-items-center rounded-r-lg hover:bg-secondary active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <FormatToggle label="Жирный" active={ui.bold} onClick={() => toggleMark("bold")}>
              <Bold className="h-4 w-4" />
            </FormatToggle>
            <FormatToggle label="Курсив" active={ui.italic} onClick={() => toggleMark("italic")}>
              <Italic className="h-4 w-4" />
            </FormatToggle>
            <FormatToggle label="Подчёркнутый" active={ui.underline} onClick={() => toggleMark("underline")}>
              <Underline className="h-4 w-4" />
            </FormatToggle>

            <Popover open={colorMenuOpen} onOpenChange={setColorMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Цвет текста"
                  aria-expanded={colorMenuOpen}
                  onPointerDown={(event) => event.preventDefault()}
                  className="relative grid h-8 w-9 shrink-0 place-items-center rounded-lg border border-border bg-secondary/40 hover:bg-secondary"
                >
                  <span className="text-xs font-bold leading-none">A</span>
                  <span className="absolute bottom-1 h-1 w-4 rounded-full" style={{ backgroundColor: ui.color }} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="center"
                sideOffset={6}
                collisionPadding={12}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                className="z-50 max-h-[min(24rem,calc(100dvh-6rem))] w-[min(15rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-2"
              >
                <ColorGrid colors={PALETTE} value={ui.color} onChange={(color) => applyStyle(() => ({ color }))} />
              </PopoverContent>
            </Popover>

            <Popover open={fontMenuOpen} onOpenChange={setFontMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-expanded={fontMenuOpen}
                  onPointerDown={(event) => event.preventDefault()}
                  className="flex h-8 w-[7.5rem] min-w-0 max-w-[7.5rem] shrink-0 items-center gap-1 overflow-hidden rounded-full border border-border bg-secondary/40 px-2.5 text-xs hover:bg-secondary"
                  style={{ fontFamily: fontCss(ui.fontFamily), maxWidth: "7.5rem", overflow: "hidden" }}
                >
                  <span
                    className="block min-w-0 flex-1 text-left"
                    style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
                  >
                    {ui.fontFamily}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="end"
                sideOffset={6}
                collisionPadding={12}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                className="z-50 max-h-[min(16rem,calc(100dvh-8rem))] w-[min(14rem,calc(100vw-1.5rem))] max-w-[calc(100vw-24px)] overflow-x-hidden overflow-y-auto rounded-xl p-1"
              >
                {PDF_FONTS.map((font) => (
                  <button
                    key={font.name}
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      applyStyle(() => ({ fontFamily: font.name }));
                      setFontMenuOpen(false);
                    }}
                    className={`flex w-full min-w-0 items-center overflow-hidden rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary ${
                      ui.fontFamily === font.name ? "bg-secondary text-primary" : ""
                    }`}
                    style={{ fontFamily: font.css }}
                  >
                    <span className="block min-w-0 flex-1 truncate">{font.name}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <button
              type="button"
              aria-label="Готово"
              onClick={() => {
                if (editingId) commitEditing();
                else setTextTool(false);
              }}
              className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground active:scale-95"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>

        </div>
      )}

      {/* Document canvas */}
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-neutral-900/40 p-2 [-webkit-overflow-scrolling:touch]"
      >
        {loadError ? (
          <div className="mt-16 text-center text-sm text-destructive">{loadError}</div>
        ) : !pdfDoc ? (
          <div className="mt-16 flex justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : null}

        <div className="mx-auto w-fit">
          <div ref={canvasWrapRef} className="relative" onClick={onCanvasClick}>
            <canvas ref={canvasRef} className="block rounded-md shadow-2xl" />
            {searchHighlights.length > 0 && (
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                {searchHighlights.map((hit, index) => (
                  <span
                    key={`hl-${index}`}
                    className="absolute rounded-[2px] bg-yellow-300/50 mix-blend-multiply ring-1 ring-yellow-500/60"
                    style={{
                      left: `${hit.leftPct}%`,
                      top: `${hit.topPct}%`,
                      width: `${hit.widthPct}%`,
                      height: `${hit.heightPct}%`,
                    }}
                  />
                ))}
              </div>
            )}
            {/* Text hit-testing stays active, without drawing yellow markers over the PDF. */}
            {pageOverlays.map((overlay) => {
              const isEditing = overlay.id === editingId;
              const sizePx = Math.max((overlay.fontSize ?? DEFAULT_PDF_FONT_SIZE) * viewScale, 6);
              return (
                <div
                  key={overlay.id}
                  role={isEditing ? undefined : "button"}
                  tabIndex={isEditing ? undefined : 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!isEditing && textTool) {
                      pendingTapRef.current = { x: event.clientX, y: event.clientY };
                      editingNodeRef.current = null;
                      setEditingId(overlay.id);
                    }
                  }}
                  className={`absolute flex items-center overflow-visible whitespace-pre text-left leading-tight ${
                    overlay.cover ? "bg-white" : ""
                  }`}
                  style={{
                    left: `${overlay.xPct}%`,
                    top: `${overlay.yPct}%`,
                    width: `${overlay.widthPct}%`,
                    minHeight: `${overlay.heightPct}%`,
                    fontSize: `${sizePx}px`,
                    fontFamily: fontCss(overlay.fontFamily),
                    fontWeight: overlay.bold ? 700 : 400,
                    fontStyle: overlay.italic ? "italic" : "normal",
                    textDecoration: overlay.underline ? "underline" : "none",
                    color: overlay.color ?? DEFAULT_PDF_TEXT_COLOR,
                  }}
                >
                  {isEditing ? (
                    <span
                      ref={(node) => mountEditor(node, overlay)}
                      contentEditable
                      suppressContentEditableWarning
                      spellCheck={false}
                      className="block w-full bg-transparent outline-none"
                      style={{ caretColor: overlay.color ?? DEFAULT_PDF_TEXT_COLOR }}
                      onInput={(event) => {
                        const runs = readRunsFromDom(event.currentTarget, renderedRunsRef.current, baseStyle(overlay));
                        saveRuns(overlay.id, runs);
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitEditing();
                        }
                        if (event.key === "Escape") commitEditing();
                      }}
                    />
                  ) : (
                    <span className="block w-full truncate">
                      {getRuns(overlay).map((run, index) => (
                        <span key={index} style={cssToReact(runCss(run, viewScale))}>
                          {run.text}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom scrubber */}
      <div className="shrink-0 border-t border-border bg-card/80 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="w-10 shrink-0 font-mono text-[10px] text-muted-foreground">{page}</span>
          <input
            type="range"
            min={1}
            max={Math.max(pageCount, 1)}
            step={1}
            value={page}
            aria-label="Быстрая прокрутка страниц"
            onChange={(event) => setPage(Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
          />
          <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
            {pageCount || 1}
          </span>
        </div>
      </div>

      {busy && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
          <span className="rounded-full bg-black/70 px-3 py-1 text-xs text-white">Обработка…</span>
        </div>
      )}

      {/* Document info */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>О документе</DialogTitle>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <InfoRow label="Имя файла" value={note.pdf?.fileName ?? "—"} />
            <InfoRow label="Размер" value={formatBytes(note.pdf?.size ?? 0)} />
            <InfoRow label="Страниц" value={String(pageCount || note.pdf?.pageCount || 0)} />
            <InfoRow
              label="Создан"
              value={
                note.pdf?.createdAt
                  ? new Date(note.pdf.createdAt).toLocaleString("ru-RU")
                  : new Date(note.createdAt).toLocaleString("ru-RU")
              }
            />
            <InfoRow label="Автор" value={note.pdf?.author || "—"} />
            <InfoRow label="Производитель" value={note.pdf?.producer || "—"} />
            <InfoRow label="Права" value="Чтение · Редактирование · Печать · Экспорт" />
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-full bg-secondary/60 hover:bg-secondary active:scale-95"
    >
      {children}
    </button>
  );
}

function PanelAction({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-9 min-w-0 place-items-center rounded-lg border transition-colors active:scale-95 ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function FormatToggle({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`grid h-8 w-9 shrink-0 place-items-center rounded-lg border transition-colors active:scale-95 ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-secondary/40 hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-1.5">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-xs font-medium">{value}</dd>
    </div>
  );
}
