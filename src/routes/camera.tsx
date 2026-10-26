import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Camera as CameraIcon, ImagePlus, Loader2, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createNote } from "@/lib/notes-store";
import { ocrTextToEditorHtml } from "@/lib/ocr-note";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { mergeOcrCandidates, type OcrCandidate, type OcrLine, type OcrScript } from "@/lib/ocr-merge";
import { linesFromMlKit } from "@/lib/ocr-geometry";
import { OcrSessionGate } from "@/lib/ocr-session";
import { isCameraCancellation, readableOcrFailure } from "@/lib/ocr-errors";

export const Route = createFileRoute("/camera")({
  head: () => ({ meta: [
    { title: "Scan to note — Wave Notes" },
    { name: "description", content: "Capture text with your camera and save it as a note in Wave Notes." },
    { property: "og:title", content: "Scan to note — Wave Notes" },
    { property: "og:description", content: "Capture text with your camera and save it as a note in Wave Notes." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CameraRoute,
});

type CaptureSource = "camera" | "gallery";
type CaptureStatus = "idle" | "preparing" | "picking" | "scanning" | "error";

type NativeCameraBundle = typeof import("@capacitor/camera");
type NativeTextRecognitionBundle = typeof import("@capacitor-mlkit/text-recognition");

type OcrEngine = {
  processImage: (path: string, mode?: OcrMode) => Promise<string>;
};

type CameraErrorBoundaryState = {
  failed: boolean;
};

class CameraErrorBoundary extends Component<{ children: ReactNode }, CameraErrorBoundaryState> {
  state: CameraErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): CameraErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Camera screen error", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="grid min-h-screen place-items-center px-6 text-center">
          <div className="max-w-sm rounded-2xl border border-destructive/40 bg-destructive/10 p-5">
            <h1 className="font-display text-base font-semibold text-destructive">Camera error</h1>
            <p className="mt-2 text-sm text-muted-foreground">OCR screen could not be opened. Return to notes and try again.</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function CameraRoute() {
  return (
    <CameraErrorBoundary>
      <CameraPage />
    </CameraErrorBoundary>
  );
}

function isNativePlatform() {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === "function") return capacitor.isNativePlatform();
  return capacitor.getPlatform?.() === "android" || capacitor.getPlatform?.() === "ios";
}

function yieldToMainThread() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function loadCameraBundle(): Promise<NativeCameraBundle> {
  return import("@capacitor/camera");
}

/**
 * Rebuilds the recognised text preserving the original photo layout:
 * every ML Kit line becomes its own `\n`-separated row, every block becomes a
 * paragraph (blank line), and the horizontal spaces inside a line are kept
 * exactly as ML Kit reports them (no trimming, no re-flowing).
 */
function composeRecognizedText(result: {
  text: string;
  blocks?: { lines?: { text: string }[] }[];
}): string {
  const blocks = result.blocks ?? [];
  if (blocks.length === 0) {
    return result.text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
  }

  const paragraphs = blocks
    .map((block) =>
      (block.lines ?? [])
        .map((line) => line.text.replace(/\s+$/g, ""))
        .filter((line) => line.length > 0)
        .join("\n"),
    )
    .filter((paragraph) => paragraph.length > 0);

  return paragraphs.join("\n\n");
}

type OcrMode = "auto" | "latin" | "cyrillic" | "chinese" | "japanese" | "korean" | "devanagari";
const nativeOcrGate = new OcrSessionGate();
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("OCR timed out")), ms); }),
  ]).finally(() => clearTimeout(timer));
}
async function initializeOcrEngine(): Promise<OcrEngine> {
  if (!isNativePlatform()) throw new Error("OCR доступно только в установленном приложении Android");
  const mlkit: NativeTextRecognitionBundle = await import("@capacitor-mlkit/text-recognition");
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  const native = Capacitor.getPlatform() === "android"
    ? registerPlugin<{ recognize(input: {path:string; language:string}): Promise<{text:string; confidence:number; lines?: Omit<OcrLine, "script">[]}>; prepareImage(input:{path:string}):Promise<{path:string;width:number;height:number}>; releaseImage(input:{path:string}):Promise<void> }>("OfflineCyrillicOcr")
    : null;
  const scripts: Array<{id:OcrScript; script: (typeof mlkit.Script)[keyof typeof mlkit.Script]}> = [
    {id:"latin",script:mlkit.Script.Latin},
    {id:"japanese",script:mlkit.Script.Japanese},
    {id:"chinese",script:mlkit.Script.Chinese},
    {id:"korean",script:mlkit.Script.Korean},
    {id:"devanagari",script:mlkit.Script.Devanagari},
  ];
  return {
    processImage: async (path: string, mode: OcrMode = "auto") => {
      const releaseSession = native ? nativeOcrGate.enter() : () => undefined;
      const results: OcrCandidate[] = [];
      // Track all native work, including operations that outlive the UI deadline.
      const outstanding: Promise<unknown>[] = [];
      let prepared: {path:string;width:number;height:number} | null = null;
      let timedOut = false;
      const timed = <T,>(task: Promise<T>, duration: number): Promise<T> => {
        outstanding.push(task);
        return withDeadline(task, duration);
      };
      try {
        const preparation = native ? native.prepareImage({path}) : null;
        if (preparation) {
          outstanding.push(preparation);
          try {
            prepared = await withDeadline(preparation, 20000);
          } catch (error) {
            // In a timeout race the image may be created later. Cleanup is
            // deferred and keeps the session locked until that happens.
            outstanding.push(preparation.then(late =>
              native!.releaseImage({path:late.path}).catch(console.warn),
              () => undefined));
            throw error;
          }
        }
        const scanPath = prepared?.path ?? path;
        const width = prepared?.width ?? 1;
        const height = prepared?.height ?? 1;
      // A timed-out model must not trigger any more native scans on this photo.
      const recognize = async (item: typeof scripts[number]) => {
        try {
          const data = await timed(mlkit.TextRecognition.processImage({path:scanPath,script:item.script}), 15000);
          const value = composeRecognizedText(data);
          if (value.trim()) results.push({text:value,script:item.id,lines:linesFromMlKit(data,item.id,width,height)});
        } catch(error) {
          console.warn("OCR model failed",item.id,error);
          if (error instanceof Error && error.message === "OCR timed out") timedOut = true;
        }
      };
      // Explicit mode scans just one model.
      if (mode !== "auto" && mode !== "cyrillic") {
        const item = scripts.find(item => item.id === mode);
        if (item) await recognize(item);
      } else if (mode === "auto") {
        // Common Latin text first. Chinese and Japanese must BOTH be checked
        // when a Han-script image is suspected; first-model wins is unsafe.
        for (const item of scripts) {
          await recognize(item);
          if (timedOut) break;
          await yieldToMainThread();
        }
      }
      if (!timedOut && native && (mode === "auto" || mode === "cyrillic")) {
        try {
          const data = await timed(native.recognize({path:scanPath,language:"rus+kaz"}), 18000);
          if (data.text.trim()) {
            const lines: OcrLine[] = (data.lines ?? []).map(line => ({...line,script:"cyrillic"}));
            results.push({text:data.text,script:"cyrillic",lines,confidence:data.confidence});
          }
        } catch(error) {
          console.warn("Bundled Russian/Kazakh OCR failed",error);
        }
      }
      if (!results.length) throw new Error("Не удалось распознать текст. Попробуйте другое фото.");
      // Until all model frames can be normalized using image dimensions, merge
      // only when at least one valid geometry source is available. The fallback
      // deliberately chooses a single result instead of duplicating page text.
      const text = mergeOcrCandidates(results);
      if (!text) throw new Error("Не удалось распознать текст. Попробуйте другое фото.");
      return text;
      } finally {
        // Releasing an image while ML Kit still reads it causes intermittent
        // failures. Hold the gate until every underlying promise has settled.
        void Promise.allSettled(outstanding)
          .then(async () => {
            if (native && prepared) {
              await native.releaseImage({path:prepared.path});
            }
          })
          .catch(console.warn)
          .finally(releaseSession);
      }
    }
  };
}

async function captureNativePhoto(source: CaptureSource): Promise<string> {
  const cameraBundle = await loadCameraBundle();
  const photo = await cameraBundle.Camera.getPhoto({
    source: source === "camera" ? cameraBundle.CameraSource.Camera : cameraBundle.CameraSource.Photos,
    resultType: cameraBundle.CameraResultType.Uri,
    quality: 90,
    correctOrientation: true,
    allowEditing: false,
    saveToGallery: false,
  });

  const path = photo.path ?? photo.webPath;
  // Native OCR only accepts local image paths, never a WebView URL.
  if (!path || (!path.startsWith("/") && !/^file:\/\//i.test(path) && !/^content:\/\//i.test(path))) {
    throw new Error("Selected image has no readable local path.");
  }
  return path;
}

function createOcrNote(text: string, title: string) {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return createNote({
    title: firstLine ? firstLine.slice(0, 80) : title,
    body: ocrTextToEditorHtml(text),
  });
}

function CameraPage() {
  const navigate = useNavigate();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);
  const operationIdRef = useRef(0);
  const inFlightRef = useRef(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ocrMode, setOcrMode] = useState<OcrMode>("auto");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationIdRef.current += 1;
    };
  }, []);

  const safeSetStatus = (nextStatus: CaptureStatus, currentOperationId: number) => {
    if (!mountedRef.current || currentOperationId !== operationIdRef.current) return;
    setStatus(nextStatus);
  };

  const closeCamera = () => {
    operationIdRef.current += 1;
    setStatus("idle");
    setError(null);
    setModalOpen(false);
    navigate({ to: "/" });
  };

  const finishWithText = (text: string) => {
    const note = createOcrNote(text, t("camera"));
    navigate({ to: "/editor/$id", params: { id: note.id }, search: { folder: undefined } });
  };

  const handleFailure = (message: string, currentOperationId: number) => {
    if (!mountedRef.current || currentOperationId !== operationIdRef.current) return;
    setError(message);
    setStatus("error");
    setModalOpen(true);
    toast.error(message);
  };

  const scanNativeImage = async (source: CaptureSource) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;
    setError(null);
    setStatus("preparing");

    try {
      await yieldToMainThread();
      safeSetStatus("picking", operationId);
      const imagePath = await captureNativePhoto(source);
      if (!mountedRef.current || operationId !== operationIdRef.current) return;
      await yieldToMainThread();
      safeSetStatus("scanning", operationId);
      const engine = await initializeOcrEngine();
      if (!mountedRef.current || operationId !== operationIdRef.current) return;
      const text = await engine.processImage(imagePath, ocrMode);

      if (!mountedRef.current || operationId !== operationIdRef.current) return;

      if (!text.trim()) {
        handleFailure("No text was recognized in this image.", operationId);
        return;
      }

      finishWithText(text);
    } catch (caught) {
      if (!mountedRef.current || operationId !== operationIdRef.current) return;
      if (isCameraCancellation(caught)) {
        // Backing out of camera/photo picker is normal user intent.
        setStatus("idle");
        setModalOpen(true);
        return;
      }
      handleFailure(readableOcrFailure(caught), operationId);
    } finally {
      inFlightRef.current = false;
    }
  };

  const openWebPicker = (source: CaptureSource) => {
    const input = inputRef.current;
    if (!input) return;

    operationIdRef.current += 1;
    setError(null);
    setStatus("picking");
    input.value = "";

    if (source === "camera") input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");

    const operationId = operationIdRef.current;
    const handleFocusReturn = () => {
      window.removeEventListener("focus", handleFocusReturn);
      window.setTimeout(() => {
        if (!mountedRef.current || operationId !== operationIdRef.current) return;
        if (!input.files || input.files.length === 0) {
          setStatus("idle");
          setModalOpen(true);
        }
      }, 250);
    };

    window.addEventListener("focus", handleFocusReturn);
    input.click();
  };

  const startCapture = (source: CaptureSource) => {
    if (inFlightRef.current) return;
    setModalOpen(false);
    if (isNativePlatform()) {
      void scanNativeImage(source);
      return;
    }
    openWebPicker(source);
  };

  const handleWebFileSelected = () => {
    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;
    setStatus("scanning");
    setError(null);

    window.setTimeout(() => {
      if (!mountedRef.current || operationId !== operationIdRef.current) return;
      handleFailure(t("ocr_unavailable"), operationId);
    }, 0);
  };

  const busy = status === "preparing" || status === "picking" || status === "scanning";

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden"
    >
      <header className="z-40 shrink-0 border-b border-border bg-background">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-semibold">{t("camera")}</h1>
          </div>
          <button
            type="button"
            onClick={closeCamera}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary/60 hover:bg-secondary active:scale-95"
            aria-label={t("close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full min-h-0 max-w-xl flex-1 flex-col items-center justify-center overflow-hidden overscroll-none px-4 pb-[130px] pt-4 text-center touch-none">

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.[0]) handleWebFileSelected();
            else {
              setStatus("idle");
              setModalOpen(true);
            }
          }}
        />

        <div className="relative mb-8">
          <div className="absolute inset-0 -z-10 animate-pulse rounded-3xl bg-primary/30 blur-2xl" />
          <div className="grid h-40 w-40 place-items-center rounded-3xl border border-primary/30 bg-card/70 backdrop-blur">
            {busy ? <Loader2 className="h-12 w-12 animate-spin text-primary" strokeWidth={1.5} /> : <ScanLine className="h-12 w-12 text-primary" strokeWidth={1.4} />}
          </div>
        </div>

        <label className="mb-3 flex flex-col gap-1 text-xs text-muted-foreground" htmlFor="ocr-language">
          Язык текста (обычно определяется автоматически)
          <select id="ocr-language" value={ocrMode} disabled={busy} onChange={(e) => setOcrMode(e.target.value as OcrMode)} className="rounded-lg border border-border bg-background p-2 text-foreground">
            <option value="auto">Определять автоматически</option>
            <option value="cyrillic">Русский / Казахский</option>
            <option value="latin">Латиница</option>
            <option value="chinese">Китайский</option>
            <option value="japanese">Японский</option>
            <option value="korean">Корейский</option>
            <option value="devanagari">Хинди и другие на деванагари</option>
          </select>
        </label>
        <p className="mx-auto max-w-xs px-4 text-center text-xs leading-relaxed text-muted-foreground">
          Распознавание текста на разных языках — без отправки фото на сервер
        </p>
        <h2 className="mt-3 px-4 text-center font-display text-base font-semibold leading-snug">
          {busy ? t("ocr_scanning") : "Выберите фотографию с текстом, чтобы извлечь его и добавить в заметку"}
        </h2>
        {error && <p className="mt-3 max-w-sm text-sm text-destructive">{error}</p>}

        <Button
          type="button"
          onClick={() => setModalOpen(true)}
          size="lg"
          disabled={busy}
          className="mt-6 h-11 rounded-xl bg-gradient-to-r from-primary to-primary-glow px-6 text-sm text-primary-foreground shadow-xl hover:opacity-95"
        >
          <ImagePlus className="mr-2 h-5 w-5" />
          {t("camera_pick")}
        </Button>
      </main>

      <Dialog open={modalOpen} onOpenChange={(open) => !busy && setModalOpen(open)}>
        <DialogContent className="w-[min(20rem,calc(100vw-2.5rem))] max-w-[20rem] rounded-2xl border-border p-0">
          <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-2.5">
            <DialogHeader className="space-y-0 text-left">
              <DialogTitle className="text-sm font-semibold">Распознавание текста</DialogTitle>
              <DialogDescription className="text-[11px] leading-snug">
                {t("camera_pick_hint")}
              </DialogDescription>
            </DialogHeader>
            <button
              type="button"
              onClick={closeCamera}
              disabled={busy}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary/60 hover:bg-secondary disabled:opacity-50"
              aria-label={t("close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-2 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <Button
              type="button"
              disabled={busy}
              className="h-9 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-xs font-semibold text-primary-foreground hover:opacity-95"
              onClick={() => startCapture("camera")}
            >
              <CameraIcon className="mr-1.5 h-4 w-4" />
              {t("camera_open")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="h-9 rounded-xl text-xs font-semibold"
              onClick={() => startCapture("gallery")}
            >
              <ImagePlus className="mr-1.5 h-4 w-4" />
              {t("camera_pick")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
