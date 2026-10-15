import { useEffect } from "react";

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }).Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
  const platform = cap.getPlatform?.();
  return platform === "android" || platform === "ios";
}

/**
 * Makes the native system status bar transparent and lets the web view draw
 * beneath it, so the clock / Wi-Fi / battery icons stay crisp and visible on
 * top of the app UI (standard modern Android edge-to-edge behaviour).
 */
export function NativeShellBoot() {
  useEffect(() => {
    if (!isNative()) return;

    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setBackgroundColor({ color: "#00000000" });
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.show();
      } catch (error) {
        console.warn("StatusBar configuration unavailable", error);
      }
    })();
  }, []);

  return null;
}
