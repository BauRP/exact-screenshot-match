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
 * Keeps application content separate from Android system status icons.
 */
export function NativeShellBoot() {
  useEffect(() => {
    if (!isNative()) return;

    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setBackgroundColor({ color: "#0B0E13" });
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.show();
      } catch (error) {
        console.warn("StatusBar configuration unavailable", error);
      }
    })();
  }, []);

  return null;
}
