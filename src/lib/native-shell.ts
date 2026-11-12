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
    document.documentElement.classList.add("wave-native-android");
    return () => document.documentElement.classList.remove("wave-native-android");
  }, []);

  useEffect(() => {
    if (!isNative()) return;

    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        // Native MainActivity owns edge-to-edge and insets on every API.
        // Calling setOverlaysWebView(false) would reconfigure the Window and
        // cause double/incorrect safe-area padding on some Android versions.
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
