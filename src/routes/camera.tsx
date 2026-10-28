import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Camera as CameraIcon, ImagePlus, Loader2, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createNote, getNote } from "@/lib/notes-store";
import { saveOcrNoteAndOpenEditor, reopenSavedOcrNote, OcrEditorNavigationError } from "@/lib/ocr-save-flow";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { mergeOcrCandidates, exceedsOcrSpatialBudget, mergeOversizedOcrForReview, restoreOmittedOcrScriptTextForReview, hasAmbiguousHanCandidates, hasUncertainMixedScriptLayout, type OcrCandidate, type OcrLine, type OcrScript } from "@/lib/ocr-merge";
import { linesFromMlKitBounded, mlKitReportedLanguages } from "@/lib/ocr-geometry";
import { OcrSessionGate } from "@/lib/ocr-session";
import { OcrTimeBudget, withOcrDeadline, startOcrWithinBudget } from "@/lib/ocr-budget";
import { OcrScanCoverage } from "@/lib/ocr-coverage";
import { OcrIncompleteScanError, OcrAmbiguousHanError, markIncompleteOcrText, markRecoveredOcrText, buildReviewedOcrText, applyRecoveredOcrPass, OCR_SCRIPT_LABELS, type OcrRecoveryState, type OcrHanAlternatives, type OcrReviewReason, OcrMixedLayoutReviewError, OcrLimitedSelectionReviewError, OcrNativeTextReviewError, OcrLargeLayoutReviewError, OcrOmittedScriptReviewError, resumeOcrReviewDraft, recoverFromReviewedText, hanAlternativesFromCandidates, previewHanAlternatives, cyrillicTextWithLineFallback } from "@/lib/ocr-partial";
import { chooseLocalOcrImagePath, reusableOcrImagePath } from "@/lib/ocr-input";
import { savePendingOcrDraft, readPendingOcrDraft, clearPendingOcrDraft, shouldClearPendingDraft, OcrDraftWriteGate } from "@/lib/ocr-draft";
import { isCameraCancellation, readableOcrFailure } from "@/lib/ocr-errors";
import { composeRecognizedText, extractNativeTextAlternative, type OcrNativeTextAlternative } from "@/lib/ocr-text";
import { ocrScanPlan, selectedOcrScanPlan, AUTO_SCAN_ORDER, readOcrScanPreferences, saveOcrScanPreferences, prioritizeRemainingOcrScripts, cyrillicLanguageForScan, type OcrMode, type OcrScanRequest } from "@/lib/ocr-plan";

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
  processImage: (path: string, mode?: OcrScanRequest, onProgress?: (stage: string) => void) => Promise<string>;
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

const nativeOcrGate = new OcrSessionGate();
async function initializeOcrEngine(): Promise<OcrEngine> {
  if (!isNativePlatform()) throw new Error("OCR доступно только в установленном приложении Android");
  const mlkit: NativeTextRecognitionBundle = await import("@capacitor-mlkit/text-recognition");
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  const native = Capacitor.getPlatform() === "android"
    ? registerPlugin<{ recognize(input: {path:string; language:string}): Promise<{text:string; confidence:number; truncatedGeometry?:boolean; lines?: Omit<OcrLine, "script">[]}>; prepareImage(input:{path:string}):Promise<{path:string;width:number;height:number}>; releaseImage(input:{path:string}):Promise<void> }>("OfflineCyrillicOcr")
    : null;
  const scripts: Array<{id:OcrScript; script: (typeof mlkit.Script)[keyof typeof mlkit.Script]; label: string}> = [
    {id:"latin",script:mlkit.Script.Latin,label:"Латиница"},
    {id:"japanese",script:mlkit.Script.Japanese,label:"Японский"},
    {id:"chinese",script:mlkit.Script.Chinese,label:"Китайский"},
    {id:"korean",script:mlkit.Script.Korean,label:"Корейский"},
    {id:"devanagari",script:mlkit.Script.Devanagari,label:"Деванагари"},
  ];
  return {
    processImage: async (path: string, mode: OcrScanRequest = "auto", onProgress: (stage: string) => void = () => undefined) => {
      const releaseSession = native ? nativeOcrGate.enter() : () => undefined;
      const results: OcrCandidate[] = [];
      const scanPlan = ocrScanPlan(mode);
      const coverage = new OcrScanCoverage(scanPlan);
      // Track all native work, including operations that outlive the UI deadline.
      const outstanding: Promise<unknown>[] = [];
      let prepared: {path:string;width:number;height:number} | null = null;
      let timedOut = false;
      const nativeAlternatives: OcrNativeTextAlternative[] = [];
      const languageHints: string[] = [];
      let nativeGeometryTruncated = false;
      let timeBudget: OcrTimeBudget | null = null;
      const timed = <T,>(start: () => Promise<T>, duration: number): Promise<T> => {
        if (!timeBudget) throw new Error("OCR budget was not initialized");
        return startOcrWithinBudget(timeBudget, duration, start, task => outstanding.push(task));
      };
      try {
        onProgress("Подготовка фотографии");
        const preparation = native ? native.prepareImage({path}) : null;
        if (preparation) {
          outstanding.push(preparation);
          try {
            prepared = await withOcrDeadline(preparation, 20000);
          } catch (error) {
            // In a timeout race the image may be created later. Cleanup is
            // deferred and keeps the session locked until that happens.
            outstanding.push(preparation.then(late =>
              native!.releaseImage({path:late.path}).catch(console.warn),
              () => undefined));
            throw error;
          }
        }
        timeBudget = new OcrTimeBudget(scanPlan.length > 1 ? 60000 : 25000);
        const scanPath = prepared?.path ?? path;
        const width = prepared?.width ?? 1;
        const height = prepared?.height ?? 1;
      // A timed-out model must not trigger any more native scans on this photo.
      const recognize = async (item: typeof scripts[number], step: number) => {
        onProgress(`Распознавание ${step}/${scanPlan.length}: ${item.label}`);
        try {
          const data = await timed(() => mlkit.TextRecognition.processImage({path:scanPath,script:item.script}), 15000);
          coverage.markCompleted(item.id);
          languageHints.push(...mlKitReportedLanguages(data));
          const value = composeRecognizedText(data);
          if (value.trim()) {
            const alternative = extractNativeTextAlternative(item.id,data);
            if (alternative) nativeAlternatives.push(alternative);
          }
          if (value.trim()) {
            const geometry = linesFromMlKitBounded(data,item.id,width,height);
            if (geometry.truncated) nativeGeometryTruncated = true;
            results.push({text:value,script:item.id,lines:geometry.lines});
          }
        } catch(error) {
          console.warn("OCR model failed",item.id,error);
          coverage.markFailed(item.id);
          if (error instanceof Error && error.message === "OCR timed out") timedOut = true;
        }
      };
      // Scan one recognizer at a time. Cyrillic now runs immediately after
      // Latin, rather than being starved by all five ML Kit recognizers.
      for (let index = 0; index < scanPlan.length; index++) {
        const script = scanPlan[index];
        if (timedOut) break; // Native work cannot be cancelled safely.
        if (script === "cyrillic") {
          if (!native) {
            coverage.markFailed("cyrillic");
            continue;
          }
          onProgress(`Распознавание ${index + 1}/${scanPlan.length}: ${mode === "russian" ? "русский" : mode === "kazakh" ? "казахский" : "русский и казахский"}`);
          try {
            const data = await timed(() => native.recognize({path:scanPath,language:cyrillicLanguageForScan(mode)}), 18000);
            coverage.markCompleted("cyrillic");
            if (data.truncatedGeometry) nativeGeometryTruncated = true;
            const cyrillicText = cyrillicTextWithLineFallback(data);
            if (cyrillicText.trim()) {
              const lines: OcrLine[] = (data.lines ?? []).map(line => ({...line,script:"cyrillic"}));
              results.push({text:cyrillicText,script:"cyrillic",lines,confidence:data.confidence});
            }
          } catch (error) {
            console.warn("Bundled Russian/Kazakh OCR failed",error);
            coverage.markFailed("cyrillic");
            if (error instanceof Error && error.message === "OCR timed out") timedOut = true;
          }
        } else {
          const item = scripts.find(item => item.id === script);
          if (item) await recognize(item, index + 1);
        }
        // First Latin and Cyrillic stay early. Later recognizers can move up
        // based on unambiguous characters already detected, but none is skipped.
        if (mode === "auto" && index >= 1 && index + 1 < scanPlan.length) {
          const ordered = prioritizeRemainingOcrScripts(
            scanPlan.slice(index + 1), results.map(result => result.text).join("\n"),languageHints);
          scanPlan.splice(index + 1, ordered.length, ...ordered);
        }
        await yieldToMainThread();
      }
      // A timeout leaves an incomplete multilingual page. Do not silently
      // save partial results as if every configured recognizer had completed.
      if (timedOut || !coverage.isComplete()) {
        const partialMerge = exceedsOcrSpatialBudget(results, nativeGeometryTruncated)
          ? mergeOversizedOcrForReview(results) : mergeOcrCandidates(results);
        const partial = restoreOmittedOcrScriptTextForReview(partialMerge,results);
        if (partial.trim()) throw new OcrIncompleteScanError(partial, coverage.missingScripts());
        if (timedOut) throw new Error("OCR timed out");
        coverage.ensureComplete();
      }
      // An empty but completed native scan is a valid result. On a recovery
      // pass it still clears the checked model from the pending list.
      if (!results.length) return "";
      // Until all model frames can be normalized using image dimensions, merge
      // only when at least one valid geometry source is available. The fallback
      // deliberately chooses a single result instead of duplicating page text.
      onProgress("Объединение распознанных строк");
      const tooManyLines = exceedsOcrSpatialBudget(results, nativeGeometryTruncated);
      const text = tooManyLines
        ? mergeOversizedOcrForReview(results) : mergeOcrCandidates(results);
      if (tooManyLines && text) throw new OcrLargeLayoutReviewError(text);
      if (scanPlan.length > 1 && text && hasAmbiguousHanCandidates(results)) {
        throw new OcrAmbiguousHanError(text, hanAlternativesFromCandidates(results));
      }
      const fullText = restoreOmittedOcrScriptTextForReview(text,results);
      if (fullText !== text) throw new OcrOmittedScriptReviewError(fullText);
      // Give priority to presenting the recognizer's own full-text reading
      // when its geometry omitted paragraphs. Otherwise an independent
      // mixed-layout warning would hide these concrete comparison excerpts.
      if (text && nativeAlternatives.length) throw new OcrNativeTextReviewError(text,nativeAlternatives);
      if (scanPlan.length > 1 && text && hasUncertainMixedScriptLayout(results)) {
        throw new OcrMixedLayoutReviewError(text);
      }
      if (text && Array.isArray(mode) && scanPlan.length < AUTO_SCAN_ORDER.length) {
        throw new OcrLimitedSelectionReviewError(text);
      }
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

  return chooseLocalOcrImagePath(photo);
}

function CameraPage() {
  const navigate = useNavigate();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerCleanupRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(false);
  const operationIdRef = useRef(0);
  const inFlightRef = useRef(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [partialOcrText, setPartialOcrText] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState("");
  const [reviewEdited, setReviewEdited] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [hanAlternatives, setHanAlternatives] = useState<OcrHanAlternatives | null>(null);
  const hanAlternativesRef = useRef<OcrHanAlternatives | null>(null);
  const [nativeAlternatives, setNativeAlternatives] = useState<OcrNativeTextAlternative[]>([]);
  const nativeAlternativesRef = useRef<OcrNativeTextAlternative[]>([]);
  const [reviewReason, setReviewReason] = useState<OcrReviewReason>("recovery");
  const pendingRecoveryRef = useRef<OcrRecoveryState | null>(null);
  const draftGateRef = useRef(new OcrDraftWriteGate());
  const latestReviewRef = useRef({text:"",edited:false});
  const [partialMissingScripts, setPartialMissingScripts] = useState<readonly OcrScript[]>([]);
  const [retryImagePath, setRetryImagePath] = useState<string | null>(null);
  const [ocrMode, setOcrMode] = useState<OcrMode>("auto");
  const [selectedOcrScripts, setSelectedOcrScripts] = useState<OcrScript[]>(["latin","cyrillic"]);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [draftPersistenceWarning, setDraftPersistenceWarning] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [ocrStage, setOcrStage] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    const preferences=readOcrScanPreferences();
    setOcrMode(preferences.mode);
    setSelectedOcrScripts(preferences.scripts);
    setPreferencesReady(true);
    const previous = readPendingOcrDraft();
    if (previous) {
      draftGateRef.current.arm();
      latestReviewRef.current = {text:previous.reviewedText,edited:previous.edited};
      setPartialOcrText(previous.text);
      setPartialMissingScripts(previous.missingScripts);
      setReviewReason(previous.reason);
      hanAlternativesRef.current = previous.hanAlternatives ?? null;
      setHanAlternatives(hanAlternativesRef.current);
      nativeAlternativesRef.current = previous.nativeAlternatives ?? [];
      setNativeAlternatives(nativeAlternativesRef.current);
      setReviewDraft(previous.reviewedText);
      setReviewEdited(previous.edited);
      setRestoredDraft(true);
      setStatus("error");
      setError("Найден незавершённый текст. Проверьте его перед сохранением.");
    }
    return () => {
      mountedRef.current = false;
      operationIdRef.current += 1;
      pickerCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (preferencesReady) saveOcrScanPreferences({mode:ocrMode,scripts:selectedOcrScripts});
  },[preferencesReady,ocrMode,selectedOcrScripts]);

  useEffect(() => {
    if (!partialOcrText || savedNoteId || !draftGateRef.current.canWrite) return;
    const generation = draftGateRef.current.token;
    const id = window.setTimeout(() => {
      if (!draftGateRef.current.canWriteToken(generation)) return;
      const current = latestReviewRef.current;
      const stored = savePendingOcrDraft({text:partialOcrText,
        reviewedText:current.edited ? current.text : partialOcrText,
        edited:current.edited, missingScripts:[...partialMissingScripts], reason:reviewReason,
        nativeAlternatives:nativeAlternativesRef.current,
        hanAlternatives:hanAlternativesRef.current});
      if (mountedRef.current) setDraftPersistenceWarning(!stored);
    },reviewEdited ? 350 : 0);
    return () => window.clearTimeout(id);
  },[partialOcrText,reviewDraft,reviewEdited,partialMissingScripts,reviewReason,savedNoteId]);

  const persistDraft = () => {
    if (!partialOcrText || !draftGateRef.current.canWrite) return;
    const current = latestReviewRef.current;
    const stored=savePendingOcrDraft({text:partialOcrText,
      reviewedText:current.edited ? current.text : partialOcrText,
      edited:current.edited, missingScripts:[...partialMissingScripts], reason:reviewReason,
      nativeAlternatives:nativeAlternativesRef.current,
      hanAlternatives:hanAlternativesRef.current});
    if (mountedRef.current) setDraftPersistenceWarning(!stored);
  };
  const retainUnfinishedResult = (state: OcrRecoveryState, reason: OcrReviewReason = "recovery",
    alternatives: OcrNativeTextAlternative[] = [],
    han: OcrHanAlternatives | null = hanAlternativesRef.current) => {
    hanAlternativesRef.current = previewHanAlternatives(han);
    setHanAlternatives(hanAlternativesRef.current);
    nativeAlternativesRef.current = alternatives;
    setNativeAlternatives(alternatives);
    draftGateRef.current.arm();
    latestReviewRef.current = {text:state.text,edited:false};
    const stored=savePendingOcrDraft({
      text:state.text,reviewedText:state.text,edited:false,
      missingScripts:[...state.missingScripts],reason,
      nativeAlternatives:alternatives,
      hanAlternatives:hanAlternativesRef.current,
    });
    if (mountedRef.current) setDraftPersistenceWarning(!stored);
  };
  const markDraftFinished = () => {
    setDraftPersistenceWarning(false);
    draftGateRef.current.disarm();
    clearPendingOcrDraft();
  };
  const discardDraft = () => {
    if (inFlightRef.current) return;
    if (shouldClearPendingDraft("discard")) markDraftFinished();
    pendingRecoveryRef.current = null;
    setPartialOcrText(null);
    setPartialMissingScripts([]);
    setReviewDraft("");
    setReviewEdited(false);
    setRestoredDraft(false);
    setDraftPersistenceWarning(false);
    setRetryImagePath(null);
    setHanAlternatives(null);
    hanAlternativesRef.current = null;
    nativeAlternativesRef.current = [];
    setNativeAlternatives([]);
    setReviewOpen(false);
    setStatus("idle");
    setError(null);
    setModalOpen(true);
  };

  // Android WebView can be killed while a user edits an OCR draft without
  // blur. Flush synchronously on backgrounding, app switch and pagehide.
  useEffect(() => {
    if (!partialOcrText || savedNoteId) return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") persistDraft();
    };
    const onPageHide = () => persistDraft();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
    };
  },[partialOcrText,reviewDraft,reviewEdited,partialMissingScripts,reviewReason,savedNoteId]);

  const safeSetStatus = (nextStatus: CaptureStatus, currentOperationId: number) => {
    if (!mountedRef.current || currentOperationId !== operationIdRef.current) return;
    setStatus(nextStatus);
  };

  const closeCamera = () => {
    persistDraft();
    pickerCleanupRef.current?.();
    operationIdRef.current += 1;
    setStatus("idle");
    setOcrStage("");
    setError(null);
    setSavedNoteId(null);
    setPartialOcrText(null);
    setReviewOpen(false);
    setReviewDraft("");
    setReviewEdited(false);
    setHanAlternatives(null);
    hanAlternativesRef.current = null;
    nativeAlternativesRef.current = [];
    setNativeAlternatives([]);
    setReviewReason("recovery");
    setPartialMissingScripts([]);
    pendingRecoveryRef.current = null;
    setRetryImagePath(null);
    setModalOpen(false);
    navigate({ to: "/" });
  };

  const finishWithText = async (text: string) => {
    return saveOcrNoteAndOpenEditor(
      text, t("camera"), createNote,
      (id) => navigate({ to: "/editor/$id", params: { id }, search: { folder: undefined } }),
    );
  };

  const handleFailure = (message: string, currentOperationId: number, existingId?: string, informational = false) => {
    if (!mountedRef.current || currentOperationId !== operationIdRef.current) return;
    setError(message);
    setSavedNoteId(existingId ?? null);
    setStatus("error");
    setModalOpen(true);
    if (informational) toast.info(message);
    else toast.error(message);
  };

  const scanNativeImage = async (source: CaptureSource, previousPhotoPath?: string, retryScripts?: readonly OcrScript[]) => {
    if (inFlightRef.current) return;
    if (nativeOcrGate.busy) {
      const message = readableOcrFailure(new Error("OCR_SCAN_BUSY"));
      setError(message);
      setStatus("error");
      setModalOpen(true);
      return;
    }
    const scanRequest = retryScripts ?? (ocrMode === "custom" ? selectedOcrScanPlan(selectedOcrScripts) : ocrMode);
    setSelectionError(null);
    const attemptedScripts = ocrScanPlan(scanRequest);
    inFlightRef.current = true;
    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;
    setError(null);
    setSavedNoteId(null);
    if (!previousPhotoPath) {
      draftGateRef.current.disarm();
      // Starting a photo picker is not permission to erase a review draft.
      if (shouldClearPendingDraft("picker-open")) clearPendingOcrDraft();
      setRestoredDraft(false);
      pendingRecoveryRef.current = null;
      setPartialOcrText(null);
      setReviewOpen(false);
      setReviewDraft("");
      setReviewEdited(false);
      setHanAlternatives(null);
      hanAlternativesRef.current = null;
      nativeAlternativesRef.current = [];
      setNativeAlternatives([]);
      setReviewReason("recovery");
      setPartialMissingScripts([]);
      setRetryImagePath(null);
    }
    setOcrStage(previousPhotoPath ? "Повторное распознавание фотографии" : "Подготовка камеры");
    setStatus("preparing");

    let currentImagePath: string | null = previousPhotoPath ?? null;
    let recognizedBeforeSave: string | null = null;
    try {
      await yieldToMainThread();
      if (!mountedRef.current || operationId !== operationIdRef.current) return;
      if (!previousPhotoPath) safeSetStatus("picking", operationId);
      // Manual retry bypasses the OS photo picker, preserving the same photo.
      const imagePath = previousPhotoPath
        ? reusableOcrImagePath(previousPhotoPath)
        : await captureNativePhoto(source);
      if (!mountedRef.current || operationId !== operationIdRef.current) return;
      currentImagePath = imagePath;
      setRetryImagePath(imagePath);
      await yieldToMainThread();
      safeSetStatus("scanning", operationId);
      const engine = await initializeOcrEngine();
      if (!mountedRef.current || operationId !== operationIdRef.current) return;
      const text = await engine.processImage(imagePath, scanRequest, (stage) => {
        if (mountedRef.current && operationId === operationIdRef.current) setOcrStage(stage);
      });

      if (!mountedRef.current || operationId !== operationIdRef.current) return;

      const recovery = pendingRecoveryRef.current;
      if (previousPhotoPath && recovery?.path === imagePath) {
        const updated = applyRecoveredOcrPass(recovery, attemptedScripts, text);
        pendingRecoveryRef.current = updated;
        setPartialOcrText(updated.text);
        setPartialMissingScripts(updated.missingScripts);
        retainUnfinishedResult(updated);
        // The order across independent OCR passes is not reliable enough for
        // an automatic save. Let the user explicitly confirm the result.
        handleFailure(updated.missingScripts.length
          ? "Повторная проверка завершилась. Некоторые языки ещё нужно проверить."
          : "Повторная проверка завершена. Подтвердите сохранение и проверьте текст.",
          operationId, undefined, true);
        return;
      }
      if (!text.trim()) {
        handleFailure("На фотографии не удалось обнаружить читаемый текст. Выберите другой снимок.", operationId);
        return;
      }
      setOcrStage("Сохранение заметки");
      recognizedBeforeSave = text;
      await finishWithText(text);
      if (shouldClearPendingDraft("note-saved")) markDraftFinished();
    } catch (caught) {
      // The note may be saved even when router navigation fails/unmounts.
      // Never leave a retryable draft that could create a duplicate note.
      if (caught instanceof OcrEditorNavigationError) markDraftFinished();
      if (!mountedRef.current || operationId !== operationIdRef.current) return;
      // The scanner finished, but the notes store rejected the write.
      // Keep the exact recognized text for retry, without rescanning the photo.
      if (recognizedBeforeSave?.trim() && !(caught instanceof OcrEditorNavigationError)) {
        const unsaved: OcrRecoveryState = {
          path:currentImagePath ?? "",text:recognizedBeforeSave,missingScripts:[],
        };
        pendingRecoveryRef.current=unsaved;
        setPartialOcrText(unsaved.text);
        setPartialMissingScripts([]);
        setReviewReason("save-retry");
        setReviewEdited(false);
        retainUnfinishedResult(unsaved,"save-retry");
      }
      if (isCameraCancellation(caught)) {
        // Backing out of camera/photo picker is normal user intent.
        setStatus("idle");
        setModalOpen(true);
        return;
      }
      if (caught instanceof OcrAmbiguousHanError || caught instanceof OcrMixedLayoutReviewError ||
          caught instanceof OcrLimitedSelectionReviewError || caught instanceof OcrNativeTextReviewError ||
          caught instanceof OcrLargeLayoutReviewError || caught instanceof OcrOmittedScriptReviewError) {
        const previous = pendingRecoveryRef.current;
        const combined = previous?.path === currentImagePath
          ? applyRecoveredOcrPass(previous, attemptedScripts, caught.recognizedText)
          : { path: currentImagePath ?? "", text: caught.recognizedText, missingScripts: [] };
        pendingRecoveryRef.current = combined;
        setPartialOcrText(combined.text);
        setPartialMissingScripts(combined.missingScripts);
        const reason: OcrReviewReason = caught instanceof OcrAmbiguousHanError ? "ambiguous-han" :
          caught instanceof OcrMixedLayoutReviewError ? "mixed-layout" :
          caught instanceof OcrLimitedSelectionReviewError ? "limited-selection" :
          caught instanceof OcrLargeLayoutReviewError ? "large-layout" :
          caught instanceof OcrOmittedScriptReviewError ? "script-omission" : "native-text";
        setReviewReason(reason);
        hanAlternativesRef.current = previewHanAlternatives(caught instanceof OcrAmbiguousHanError ? caught.alternatives : null);
        setHanAlternatives(hanAlternativesRef.current);
        setReviewEdited(false);
        retainUnfinishedResult(combined, reason,
          caught instanceof OcrNativeTextReviewError ? [...caught.alternatives] : nativeAlternativesRef.current,
          caught instanceof OcrAmbiguousHanError ? caught.alternatives : hanAlternativesRef.current);
      }
      if (caught instanceof OcrIncompleteScanError) {
        const recovery = pendingRecoveryRef.current;
        const updated: OcrRecoveryState = previousPhotoPath && recovery?.path === previousPhotoPath
          ? applyRecoveredOcrPass(recovery, attemptedScripts, caught.partialText, caught.missingScripts)
          : { path: currentImagePath ?? "", text: caught.partialText, missingScripts: caught.missingScripts };
        pendingRecoveryRef.current = updated;
        setPartialOcrText(updated.text);
        setPartialMissingScripts(updated.missingScripts);
        setHanAlternatives(null);
        hanAlternativesRef.current = null;
        setReviewEdited(false);
        retainUnfinishedResult(updated);
      }
      handleFailure(readableOcrFailure(caught), operationId,
        caught instanceof OcrEditorNavigationError ? caught.savedNoteId : undefined,
        caught instanceof OcrAmbiguousHanError || caught instanceof OcrMixedLayoutReviewError ||
        caught instanceof OcrLimitedSelectionReviewError || caught instanceof OcrNativeTextReviewError ||
        caught instanceof OcrLargeLayoutReviewError || caught instanceof OcrOmittedScriptReviewError);
    } finally {
      inFlightRef.current = false;
    }
  };

  const applyUserCorrectionsBeforeRetry = () => {
    const previous = pendingRecoveryRef.current;
    const edits = latestReviewRef.current;
    if (!previous || !edits.edited) return true;
    if (!edits.text.trim()) {
      toast.error("Исправленный текст пуст. Введите текст или удалите черновик.");
      return false;
    }
    const updated = recoverFromReviewedText(previous,edits.text,true);
    pendingRecoveryRef.current = updated;
    setPartialOcrText(updated.text);
    retainUnfinishedResult(updated,reviewReason,nativeAlternativesRef.current);
    return true;
  };

  const retryManualOnSamePhoto = () => {
    if (!retryImagePath || inFlightRef.current || status !== "error") return;
    if (ocrMode === "auto") {
      toast.error("Для повторной проверки выберите язык в списке.");
      return;
    }
    if (!applyUserCorrectionsBeforeRetry()) return;
    setModalOpen(false);
    void scanNativeImage("gallery",retryImagePath);
  };

  const retryUnfinishedOnSamePhoto = () => {
    if (!retryImagePath || inFlightRef.current || status !== "error" ||
        !partialOcrText || !partialMissingScripts.length) return;
    if (!applyUserCorrectionsBeforeRetry()) return;
    setModalOpen(false);
    void scanNativeImage("gallery", retryImagePath, partialMissingScripts);
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
      pickerCleanupRef.current?.();
      window.setTimeout(() => {
        if (!mountedRef.current || operationId !== operationIdRef.current) return;
        if (!input.files || input.files.length === 0) {
          setStatus("idle");
          setModalOpen(true);
        }
      }, 250);
    };

    pickerCleanupRef.current?.();
    pickerCleanupRef.current = () => {
      window.removeEventListener("focus", handleFocusReturn);
      pickerCleanupRef.current = null;
    };
    window.addEventListener("focus", handleFocusReturn);
    input.click();
  };

  const startCapture = (source: CaptureSource) => {
    if (inFlightRef.current || partialOcrText) return;
    if (ocrMode === "custom" && selectedOcrScripts.length === 0) {
      setSelectionError("Выберите хотя бы один язык для распознавания.");
      return;
    }
    setModalOpen(false);
    if (isNativePlatform()) {
      void scanNativeImage(source);
      return;
    }
    openWebPicker(source);
  };

  const handleWebFileSelected = () => {
    pickerCleanupRef.current?.();
    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;
    setStatus("scanning");
    setError(null);

    window.setTimeout(() => {
      if (!mountedRef.current || operationId !== operationIdRef.current) return;
      handleFailure(t("ocr_unavailable"), operationId);
    }, 0);
  };

  const showReview = () => {
    if (!partialOcrText || inFlightRef.current) return;
    const current = latestReviewRef.current;
    const restored = resumeOcrReviewDraft(partialOcrText,current.text,current.edited);
    latestReviewRef.current = {text:restored,edited:current.edited};
    setReviewDraft(restored);
    setModalOpen(false);
    setReviewOpen(true);
  };

  const saveReviewedScan = async () => {
    if (!partialOcrText || inFlightRef.current || !reviewDraft.trim()) return;
    inFlightRef.current = true;
    const operationId = operationIdRef.current;
    setStatus("preparing");
    try {
      await finishWithText(buildReviewedOcrText(reviewDraft, partialMissingScripts, reviewReason));
      if (shouldClearPendingDraft("note-saved")) markDraftFinished();
      if (!mountedRef.current || operationId !== operationIdRef.current) return;
      setReviewOpen(false);
      setReviewEdited(false);
      setPartialOcrText(null);
      setPartialMissingScripts([]);
    } catch (caught) {
      if (caught instanceof OcrEditorNavigationError) markDraftFinished();
      if (!mountedRef.current || operationId !== operationIdRef.current) return;
      const message = readableOcrFailure(caught);
      setError(message);
      setSavedNoteId(caught instanceof OcrEditorNavigationError ? caught.savedNoteId : null);
      if (caught instanceof OcrEditorNavigationError) {
        setReviewOpen(false);
        setPartialOcrText(null);
        setPartialMissingScripts([]);
      }
      setStatus("error");
      toast.error(message);
    } finally { inFlightRef.current = false; }
  };

  const openPreviouslySavedNote = async () => {
    if (!savedNoteId || inFlightRef.current) return;
    inFlightRef.current = true;
    setStatus("preparing");
    try {
      await reopenSavedOcrNote(savedNoteId, getNote, id =>
        navigate({ to: "/editor/$id", params: { id }, search: { folder: undefined } }));
    } catch (caught) {
      const message = readableOcrFailure(caught);
      setError(message);
      setStatus("error");
      toast.error(message);
    } finally {
      inFlightRef.current = false;
    }
  };

  const busy = status === "preparing" || status === "picking" || status === "scanning";
  const toggleSelectedLanguage = (script: OcrScript) => {
    if (busy) return;
    setSelectedOcrScripts(current => current.includes(script)
      ? current.filter(value => value !== script)
      : selectedOcrScanPlan([...current,script]));
    setSelectionError(null);
  };
  const savePartialLabel = reviewReason === "save-retry"
    ? "Повторить сохранение распознанного текста"
    : partialMissingScripts.length
    ? "Сохранить найденный текст (неполный)"
    : reviewReason === "ambiguous-han"
      ? "Сохранить после проверки иероглифов"
      : "Сохранить объединённый текст (проверить)";

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

      <main className="mx-auto flex w-full min-h-0 max-w-xl flex-1 flex-col items-center justify-start overflow-y-auto overscroll-contain px-4 pb-[130px] pt-4 text-center sm:justify-center">

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
          Режим распознавания (автоматически проверяются все языки)
          <select id="ocr-language" value={ocrMode} disabled={busy} onChange={(e) => setOcrMode(e.target.value as OcrMode)} className="rounded-lg border border-border bg-background p-2 text-foreground">
            <option value="auto">Определять автоматически</option>
            <option value="custom">Проверить несколько выбранных языков</option>
            <option value="cyrillic">Русский + Казахский</option>
            <option value="russian">Только русский — точная проверка</option>
            <option value="kazakh">Только казахский — точная проверка</option>
            <option value="latin">Латиница</option>
            <option value="chinese">Китайский</option>
            <option value="japanese">Японский</option>
            <option value="korean">Корейский</option>
            <option value="devanagari">Хинди и другие на деванагари</option>
          </select>
        </label>
        {ocrMode === "custom" && (
          <div role="group" aria-label="Языки для распознавания" className="mb-3 w-full max-w-sm rounded-xl border border-border bg-card p-3 text-left">
            <p className="mb-2 text-xs text-muted-foreground">
              Проверяются только выбранные языковые модели, уже встроенные в приложение.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {AUTO_SCAN_ORDER.map(script => (
                <label key={script} className="flex items-center gap-2 text-xs text-foreground">
                  <input type="checkbox" checked={selectedOcrScripts.includes(script)}
                    disabled={busy} onChange={() => toggleSelectedLanguage(script)} />
                  {OCR_SCRIPT_LABELS[script]}
                </label>
              ))}
            </div>
            {selectionError && <p role="alert" className="mt-2 text-xs text-destructive">{selectionError}</p>}
          </div>
        )}
        <p className="mx-auto max-w-xs px-4 text-center text-xs leading-relaxed text-muted-foreground">
          Распознавание текста на разных языках — без отправки фото на сервер
        </p>
        <h2 className="mt-3 px-4 text-center font-display text-base font-semibold leading-snug">
          {busy ? (ocrStage || t("ocr_scanning")) : "Выберите фотографию с текстом, чтобы извлечь его и добавить в заметку"}
        </h2>
        {error && <p className="mt-3 max-w-sm text-sm text-destructive">{error}</p>}
        {draftPersistenceWarning && partialOcrText && <p role="alert" className="mt-2 max-w-sm text-xs text-destructive">
          Недостаточно места для резервного черновика. Не закрывайте приложение до сохранения заметки; освободите память устройства.
        </p>}
        {restoredDraft && partialOcrText && <p className="mt-2 max-w-sm text-xs text-muted-foreground">
          Черновик восстановлен после перезапуска. Для повторного сканирования нужно выбрать фото заново.
        </p>}
        {partialMissingScripts.length > 0 && (
          <p className="mt-2 max-w-sm text-xs text-muted-foreground">
            Не завершены: {partialMissingScripts.map(s => OCR_SCRIPT_LABELS[s]).join(", ")}
          </p>
        )}

        <Button
          type="button"
          onClick={() => savedNoteId ? void openPreviouslySavedNote() : partialOcrText ? showReview() : setModalOpen(true)}
          size="lg"
          disabled={busy}
          className="mt-6 h-11 rounded-xl bg-gradient-to-r from-primary to-primary-glow px-6 text-sm text-primary-foreground shadow-xl hover:opacity-95"
        >
          <ImagePlus className="mr-2 h-5 w-5" />
          {savedNoteId ? "Открыть сохранённую заметку" : partialOcrText ? savePartialLabel : t("camera_pick")}
        </Button>
      </main>

      <Dialog open={reviewOpen} onOpenChange={(open) => {
        if (!inFlightRef.current) {
          if (!open) persistDraft();
          setReviewOpen(open);
        }
      }}>
        <DialogContent className="flex max-h-[85dvh] w-[min(35rem,calc(100vw-2rem))] max-w-[35rem] flex-col overflow-hidden rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle>Проверьте распознанный текст</DialogTitle>
            <DialogDescription>
              Исправьте символы и порядок строк перед сохранением. Текст обрабатывается на устройстве.
              {partialMissingScripts.length > 0
                ? " Некоторые языки не были проверены — заметка сохранится с предупреждением."
                : " Результат нескольких проверок может содержать ошибки."}
            </DialogDescription>
          </DialogHeader>
          {nativeAlternatives.length > 0 && (
            <div className="min-h-0 overflow-y-auto rounded-lg border border-border p-2 text-left">
              <p className="mb-2 text-xs font-semibold">Разные варианты текста от распознавателя</p>
              <p className="mb-2 text-xs text-muted-foreground">Показаны фрагменты до 2000 символов. Сравните их с фотографией; исправлять нужно основной текст ниже.</p>
              {nativeAlternatives.map((alt,index) => (
                <div key={`${alt.script}-${index}`} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="min-w-0 rounded border border-border p-2">
                    <p className="text-xs font-medium">{OCR_SCRIPT_LABELS[alt.script]} — общий текст</p>
                    <p className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs">{alt.complete}</p>
                  </div>
                  <div className="min-w-0 rounded border border-border p-2">
                    <p className="text-xs font-medium">Отдельные строки</p>
                    <p className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs">{alt.lines}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {hanAlternatives && (
            <div className="grid min-h-0 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-border p-2">
                <p className="mb-1 text-xs font-semibold">Японский распознаватель</p>
                <p className="max-h-28 overflow-auto whitespace-pre-wrap break-words text-xs">{hanAlternatives.japanese}</p>
              </div>
              <div className="min-w-0 rounded-lg border border-border p-2">
                <p className="mb-1 text-xs font-semibold">Китайский распознаватель</p>
                <p className="max-h-28 overflow-auto whitespace-pre-wrap break-words text-xs">{hanAlternatives.chinese}</p>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Сравните два варианта с фотографией. Исправьте объединённый текст ниже,
                не удаляя остальные распознанные языки.
              </p>
            </div>
          )}
          <label htmlFor="ocr-review-text" className="text-sm font-medium">Распознанный текст</label>
          <textarea
            id="ocr-review-text"
            aria-label="Исправление распознанного текста"
            value={reviewDraft}
            onChange={event => {
              latestReviewRef.current = {text:event.target.value,edited:true};
              setReviewDraft(event.target.value);
              setReviewEdited(true);
            }}
            onBlur={persistDraft}
            spellCheck={false}
            disabled={busy}
            className="min-h-48 w-full flex-1 resize-y overflow-auto rounded-xl border border-border bg-background p-3 text-sm leading-relaxed text-foreground"
          />
          {partialMissingScripts.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Не завершены: {partialMissingScripts.map(script => OCR_SCRIPT_LABELS[script]).join(", ")}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy}
              onClick={() => { persistDraft(); setReviewOpen(false); setModalOpen(true); }}>
              Вернуться к проверкам
            </Button>
            <Button type="button" disabled={busy || !reviewDraft.trim()}
              onClick={() => void saveReviewedScan()}>
              Сохранить исправленный текст
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
            {savedNoteId ? (
              <Button type="button" disabled={busy}
                className="h-9 rounded-xl text-xs font-semibold"
                onClick={() => void openPreviouslySavedNote()}>
                Открыть сохранённую заметку
              </Button>
            ) : (
            <>
            {partialOcrText && (
              <Button type="button" disabled={busy} onClick={showReview}
                className="h-9 rounded-xl text-xs font-semibold">
                {savePartialLabel}
              </Button>
            )}
            {partialOcrText && <Button type="button" variant="outline"
              disabled={busy} onClick={discardDraft} className="h-9 rounded-xl text-xs font-semibold">
              Удалить черновик и выбрать новое фото
            </Button>}
            {retryImagePath && partialOcrText && partialMissingScripts.length > 0 && (
              <Button type="button" variant="outline" disabled={busy}
                onClick={retryUnfinishedOnSamePhoto}
                className="h-9 rounded-xl text-xs font-semibold">
                Повторить недостающие языки ({partialMissingScripts.length})
              </Button>
            )}
            {retryImagePath && !savedNoteId && (
              <Button type="button" disabled={busy || ocrMode === "auto" || (ocrMode === "custom" && !selectedOcrScripts.length)}
                onClick={retryManualOnSamePhoto}
                variant="outline"
                className="h-9 rounded-xl text-xs font-semibold">
                Повторить на этом фото с выбранным языком
              </Button>
            )}
            <Button
              type="button"
              disabled={busy || Boolean(partialOcrText)}
              className="h-9 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-xs font-semibold text-primary-foreground hover:opacity-95"
              onClick={() => startCapture("camera")}
            >
              <CameraIcon className="mr-1.5 h-4 w-4" />
              {t("camera_open")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || Boolean(partialOcrText)}
              className="h-9 rounded-xl text-xs font-semibold"
              onClick={() => startCapture("gallery")}
            >
              <ImagePlus className="mr-1.5 h-4 w-4" />
              {t("camera_pick")}
            </Button>
            </>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
