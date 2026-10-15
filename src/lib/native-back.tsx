import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Android hardware / gesture back button.
 *
 * Pops exactly one entry from the router history stack; when the stack is
 * empty (i.e. we are on the main list) the app is minimised/exited instead.
 */
export function NativeBackHandler() {
  const router = useRouter();

  useEffect(() => {
    let remove: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");

        const handle = await App.addListener("backButton", () => {
          if (router.history.canGoBack()) {
            router.history.back();
          } else {
            void App.exitApp();
          }
        });

        if (cancelled) void handle.remove();
        else remove = () => void handle.remove();
      } catch {
        /* web preview — nothing to bind */
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [router]);

  return null;
}
