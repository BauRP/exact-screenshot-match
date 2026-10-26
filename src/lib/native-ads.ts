import { useEffect, useRef, useState } from "react";
import type { ViewMode } from "@/lib/notes-store";

export const HOME_AD_FEED_ID = "super-notes-home";
const NATIVE_AD_UNIT_ID = "ca-app-pub-9902253594429663/7940562510";

type NativeFeed = {
  pause(): Promise<void>;
  resume(): void;
  invalidateLayout(): Promise<void>;
  destroy(): Promise<void>;
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
    if (!onAndroid()) return;
    let disposed = false;
    let starting = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const handles: Array<{ remove(): Promise<void> }> = [];
    const report = (state: string, details?: unknown) => console.info(`[SuperNotes AdMob] ${state}`, details ?? "");

    const initialize = async () => {
      if (starting || disposed || feedRef.current) return;
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
        report("Checking consent");
        let consent = await AdMob.requestConsentInfo();
        if (disposed) return;
        if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
          consent = await AdMob.showConsentForm();
        }
        if (disposed || !consent.canRequestAds) {
          report("Ad loading blocked by consent state", { status: consent.status });
          return;
        }

        report("Initializing Google Mobile Ads SDK");
        await AdMob.initialize();
        if (disposed) return;

        // Debug builds use Google test inventory. Set VITE_ADMOB_LIVE_ADS=true
        // only for a real release, after validating the native UI on a device.
        // APK built by this workflow is a debug build: use Google test inventory.
        const testAds = import.meta.env.VITE_ADMOB_LIVE_ADS !== "true";
        report("Creating native feed (Small 120px test ads)", { testing: testAds });
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
        });
        handles.push(failed);
        const loaded = await feed.addListener(NativeAdPluginEvents.Loaded, (event) => {
          report("Native test ad loaded", event);
        });
        handles.push(loaded);
        if (pausedRef.current) await feed.pause();
        setReady(true);
        report("Native feed ready; awaiting slot ad response");
      } catch (error) {
        // Notes and PDF must continue working with an empty ad slot.
        console.warn("[SuperNotes AdMob] Initialization failed; preserving placeholder", error);
        if (!disposed && attempts < 3 && navigator.onLine) {
          retryTimer = setTimeout(() => { retryTimer = null; void initialize(); }, Math.min(2000 * attempts, 6000));
        }
      } finally {
        starting = false;
      }
    };

    const onOnline = () => { void initialize(); };
    window.addEventListener("online", onOnline);
    void initialize();
    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
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
