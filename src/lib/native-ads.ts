import { useEffect, useRef, useState } from "react";
import type { ViewMode } from "@/lib/notes-store";
import { waitForPlugin } from "@/lib/native-ready";
import { consumePendingAdRetry, updateAdDiagnostic } from "@/lib/ad-diagnostics";
import { classifyAdMobFailure, type AdFailureStage } from "@/lib/admob-error-guide";
import { requestConsentForSession, initializeMobileAdsForSession } from "@/lib/admob-session";

export const HOME_AD_FEED_ID = "super-notes-home";
const NATIVE_AD_UNIT_ID = "ca-app-pub-9902253594429663/7940562510";

type NativeFeed = {
  pause(): Promise<void>;
  resume(): void;
  invalidateLayout(): Promise<void>;
  destroy(): Promise<void>;
  reload(slotKey: string): Promise<void>;
};

function onAndroid(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & {
    Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean };
  }).Capacitor;
  return cap?.getPlatform?.() === "android" && cap?.isNativePlatform?.() === true;
}

/**
 * The native SDK owns the ad, AdChoices, clicks, and attribution. The UI
 * owns only the slot and its persistent empty state; it never draws fake ads.
 */
export function useNativeAdFeed(view: ViewMode, pauseForOverlay: boolean): boolean {
  const feedRef = useRef<NativeFeed | null>(null);
  const pausedRef = useRef(pauseForOverlay);
  pausedRef.current = pauseForOverlay;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    const abort = new AbortController();
    let starting = false;
    let attempts = 0;
    let stage: AdFailureStage = "bridge";
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const slotRetries = new Map<string, number>();
    const knownSlots = new Set<string>();
    const slotTimers = new Set<ReturnType<typeof setTimeout>>();
    const handles: Array<{ remove(): Promise<void> }> = [];
    let restartingConsent = false;
    const report = (state: string, details?: unknown) => console.info(`[SuperNotes AdMob] ${state}`, details ?? "");

    const initialize = async () => {
      if (starting || disposed || feedRef.current) return;
      stage = "bridge";
      updateAdDiagnostic("bridge", "Проверка подключения AdMob");
      const bridgeReady = await waitForPlugin("AdMob", 12_000, abort.signal);
      if (disposed) return;
      if (!bridgeReady) {
        const failure = classifyAdMobFailure(new Error("Bridge not ready after 12 seconds"), "bridge");
        updateAdDiagnostic("failed", failure.label, { code:failure.code, advice:failure.advice, error:"Android AdMob plugin unavailable" });
        scheduleRetry();
        return;
      }
      if (!navigator.onLine) {
        updateAdDiagnostic("offline", "Нет подключения к интернету");
        return;
      }
      starting = true;
      attempts += 1;
      try {
        const { NativeAdFeed, NativeAdTemplate, NativeAdPluginEvents } =
          await import("@capacitor-community/admob");

        // New PDF/note slots reuse the current session's one Google UMP check.
        stage = "consent";
        updateAdDiagnostic("consent", "Проверка сохранённого согласия Google");
        const consent = await requestConsentForSession();
        if (disposed || !consent.canRequestAds) {
          updateAdDiagnostic("blocked", "Google пока не разрешил запрос рекламы", {
            code: "CONSENT_NOT_READY",
            advice: "Если пользователь ещё не дал согласие, реклама не загружается. Это не ошибка заметок. Проверьте выбор в форме Google.",
          });
          return;
        }

        stage = "sdk";
        updateAdDiagnostic("initializing", "Запуск Google Mobile Ads");
        await initializeMobileAdsForSession();
        if (disposed) return;

        // Debug builds use Google test inventory. Set VITE_ADMOB_LIVE_ADS=true
        // only for a real release, after validating the native UI on a device.
        // APK built by this workflow is a debug build: use Google test inventory.
        const testAds = import.meta.env.VITE_ADMOB_LIVE_ADS !== "true";
        stage = "native";
        updateAdDiagnostic("loading", testAds ? "Загрузка тестовой нативной рекламы" : "Загрузка нативной рекламы");
        const feed = await NativeAdFeed.create({
          feedId: HOME_AD_FEED_ID,
          template: NativeAdTemplate.Small,
          isTesting: testAds,
          ...(testAds ? {} : { adId: NATIVE_AD_UNIT_ID }),
          style: {
            backgroundColor: "#17191F",
            headlineColor: "#F4F5F7",
            cornerRadius: 16,
            callToActionBackgroundColor: "#FFB52E",
          },
        });
        if (disposed) {
          await feed.destroy();
          return;
        }
        feedRef.current = feed;
        const failed = await feed.addListener(NativeAdPluginEvents.FailedToLoad, (event) => {
          console.warn("[SuperNotes AdMob] Native ad failed to load", event);
          const slot = event.slotKey;
          if (slot) knownSlots.add(slot);
          const failure = classifyAdMobFailure({ code: event.code, message: event.message }, "native");
          updateAdDiagnostic("failed", failure.label, {
            error: `${event.code}: ${event.message}`, slot, code: failure.code, advice: failure.advice,
          });
          if (failure.retryable && slot && !disposed) {
            const retries = slotRetries.get(slot) ?? 0;
            if (retries < 3) {
              slotRetries.set(slot, retries + 1);
              const timer = setTimeout(() => {
                slotTimers.delete(timer);
                if (!disposed && navigator.onLine && !pausedRef.current) {
                  void feed.reload(slot).catch((reason) => console.warn("[SuperNotes AdMob] Retry failed", reason));
                }
              }, Math.min(3000 * (retries + 1), 12000));
              slotTimers.add(timer);
            }
          }
        });
        handles.push(failed);
        const loaded = await feed.addListener(NativeAdPluginEvents.Loaded, (event) => {
          slotRetries.delete(event.slotKey);
          knownSlots.add(event.slotKey);
          const mode = import.meta.env.VITE_ADMOB_LIVE_ADS === "true" ? "Нативное объявление" : "Тестовое нативное объявление";
          updateAdDiagnostic("loaded", mode + " успешно загружено", { slot: event.slotKey });
        });
        handles.push(loaded);
        if (pausedRef.current) await feed.pause();
        setReady(true);
        report("Native feed ready; awaiting slot ad response");
      } catch (error) {
        // A partially created feed blocks all subsequent create() attempts.
        // Tear it down before retrying, without disrupting notes or PDF.
        for (const handle of handles.splice(0)) void handle.remove().catch(console.warn);
        const failedFeed = feedRef.current;
        feedRef.current = null;
        if (failedFeed) await failedFeed.destroy().catch(console.warn);
        console.warn("[Wave Notes AdMob] Failed at stage", stage, error);
        const failure = classifyAdMobFailure(error, stage);
        const rawError = error instanceof Error ? error.message : String(error);
        updateAdDiagnostic("failed", failure.label, {
          error: rawError, code: failure.code, advice: failure.advice,
        });
        if (!disposed && failure.retryable) scheduleRetry();
      } finally {
        starting = false;
      }
    };

    const scheduleRetry = () => {
      if (disposed || retryTimer !== null || attempts >= 8) return;
      // Avoid hammering UMP/AdMob on failures or no-fill; retry limited,
      // network-related errors with a quiet backoff instead.
      retryTimer = setTimeout(() => { retryTimer = null; void initialize(); }, Math.min(15_000 * Math.max(attempts, 1), 90_000));
    };
    const onOnline = () => {
      updateAdDiagnostic("waiting", "Интернет восстановлен");
      if (feedRef.current) {
        feedRef.current.resume();
        void feedRef.current.invalidateLayout().catch(console.warn);
      } else void initialize();
    };
    const onPrivacyChanged = async () => {
      if (disposed || restartingConsent) return;
      restartingConsent = true;
      // Stop existing ads immediately when the consent preferences change.
      const oldFeed = feedRef.current;
      feedRef.current = null;
      setReady(false);
      for (const handle of handles.splice(0)) await handle.remove().catch(console.warn);
      if (oldFeed) {
        await oldFeed.pause().catch(console.warn);
        await oldFeed.destroy().catch(console.warn);
      }
      if (!disposed) {
        knownSlots.clear();
        slotRetries.clear();
        attempts = 0;
      }
      restartingConsent = false;
      if (!disposed) void initialize();
    };
    const onRetry = () => {
      consumePendingAdRetry();
      attempts = 0;
      slotRetries.clear();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      const existing = feedRef.current;
      if (existing) {
        for (const slot of knownSlots) {
          void existing.reload(slot).catch((error) => console.warn("[SuperNotes AdMob] Manual reload failed", slot, error));
        }
        if (knownSlots.size === 0) {
          existing.resume();
          void existing.invalidateLayout().catch(console.warn);
        }
      } else void initialize();
    };
    window.addEventListener("supernotes-admob-retry", onRetry);
    window.addEventListener("online", onOnline);
    window.addEventListener("wave-admob-consent-changed", onPrivacyChanged);
    if (consumePendingAdRetry()) onRetry();
    else void initialize();
    return () => {
      disposed = true;
      abort.abort();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("wave-admob-consent-changed", onPrivacyChanged);
      window.removeEventListener("supernotes-admob-retry", onRetry);
      for (const timer of slotTimers) clearTimeout(timer);
      if (retryTimer !== null) clearTimeout(retryTimer);
      for (const handle of handles) void handle.remove().catch(console.warn);
      setReady(false);
      const feed = feedRef.current;
      feedRef.current = null;
      if (feed) void feed.destroy().catch(console.warn);
    };
  }, []);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    if (pauseForOverlay) void feed.pause().catch(console.warn);
    else feed.resume();
  }, [pauseForOverlay, ready]);

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) void feed.invalidateLayout().catch(console.warn);
  }, [view, ready]);

  return ready;
}
