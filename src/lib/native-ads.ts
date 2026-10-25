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

    const initialize = async () => {
      if (starting || disposed || !navigator.onLine || feedRef.current) return;
      starting = true;
      try {
        const {
          AdMob, AdmobConsentStatus, NativeAdFeed, NativeAdTemplate,
        } = await import("@capacitor-community/admob");

        // Google's UMP consent must be checked before any ad request.
        let consent = await AdMob.requestConsentInfo();
        if (disposed) return;
        if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
          consent = await AdMob.showConsentForm();
        }
        if (disposed || !consent.canRequestAds) return;

        await AdMob.initialize();
        if (disposed) return;

        // Debug builds use Google test inventory. Set VITE_ADMOB_LIVE_ADS=true
        // only for a real release, after validating the native UI on a device.
        const testAds = import.meta.env.VITE_ADMOB_LIVE_ADS !== "true";
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
        if (pausedRef.current) await feed.pause();
        setReady(true);
      } catch (error) {
        // Notes and PDF must continue working with an empty ad slot.
        console.warn("Native ads not available; reserving slots", error);
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
