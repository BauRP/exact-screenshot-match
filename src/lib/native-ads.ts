import { useEffect, useRef, useState } from "react";
import type { ViewMode } from "@/lib/notes-store";
import { waitForPlugin } from "@/lib/native-ready";
import { updateAdDiagnostic } from "@/lib/ad-diagnostics";

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
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const slotRetries = new Map<string, number>();
    const knownSlots = new Set<string>();
    const slotTimers = new Set<ReturnType<typeof setTimeout>>();
    const handles: Array<{ remove(): Promise<void> }> = [];
    const report = (state: string, details?: unknown) => console.info(`[SuperNotes AdMob] ${state}`, details ?? "");

    const initialize = async () => {
      if (starting || disposed || feedRef.current) return;
      updateAdDiagnostic("bridge", "Проверка подключения AdMob");
      const bridgeReady = await waitForPlugin("AdMob", 12_000, abort.signal);
      if (disposed) return;
      if (!bridgeReady) {
        updateAdDiagnostic("failed", "Android-плагин AdMob недоступен");
        scheduleRetry();
        return;
      }
      if (!navigator.onLine) {
        report("Offline: native ad request postponed");
        return;
      }
      starting = true;
      attempts += 1;
      try {
        const {
          AdMob, AdmobConsentStatus, NativeAdFeed, NativeAdTemplate, NativeAdPluginEvents,
        } = await import("@capacitor-community/admob");

        // Google's UMP consent must be checked before any ad request.
        updateAdDiagnostic("consent", "Проверка согласия Google");
        let consent = await AdMob.requestConsentInfo();
        if (disposed) return;
        if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
          consent = await AdMob.showConsentForm();
        }
        if (disposed || !consent.canRequestAds) {
          updateAdDiagnostic("blocked", "Запрос рекламы пока не разрешён Google");
          return;
        }

        updateAdDiagnostic("initializing", "Запуск Google Mobile Ads");
        await AdMob.initialize();
        if (disposed) return;

        // Debug builds use Google test inventory. Set VITE_ADMOB_LIVE_ADS=true
        // only for a real release, after validating the native UI on a device.
        // APK built by this workflow is a debug build: use Google test inventory.
        const testAds = import.meta.env.VITE_ADMOB_LIVE_ADS !== "true";
        updateAdDiagnostic("loading", "Загрузка тестового нативного объявления");
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
          updateAdDiagnostic("failed", `Ошибка Google: ${event.code} — ${event.message}`, { error: `${event.code}: ${event.message}`, slot });
          if (slot && !disposed) {
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
          updateAdDiagnostic("loaded", "Тестовое объявление загружено", { slot: event.slotKey });
        });
        handles.push(loaded);
        if (pausedRef.current) await feed.pause();
        setReady(true);
        report("Native feed ready; awaiting slot ad response");
      } catch (error) {
        // Notes and PDF must continue working with an empty ad slot.
        console.warn("[SuperNotes AdMob] Initialization failed; preserving placeholder", error);
        updateAdDiagnostic("failed", "Ошибка запуска AdMob", { error: String(error) });
        if (!disposed) scheduleRetry();
      } finally {
        starting = false;
      }
    };

    const scheduleRetry = () => {
      if (disposed || retryTimer !== null || attempts >= 8) return;
      retryTimer = setTimeout(() => { retryTimer = null; void initialize(); }, Math.min(2000 * (attempts + 1), 15000));
    };
    const onOnline = () => { updateAdDiagnostic("waiting", "Интернет доступен, повторяем запрос"); void initialize(); };
    const onRetry = () => {
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
    void initialize();
    return () => {
      disposed = true;
      abort.abort();
      window.removeEventListener("online", onOnline);
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
