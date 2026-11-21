/**
 * Native boot helpers.
 *
 * The Capacitor JS bridge is injected into the WebView *asynchronously*: on a
 * cold start React can mount before `window.Capacitor.Plugins` is populated.
 * Calling `AdMob.initialize()` in that window silently rejects (or resolves
 * against a no-op web stub), which is exactly why ads never appeared on real
 * APK builds. Every native call must therefore wait for the bridge first.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: Record<string, unknown>;
};

function cap(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True only inside a real native (Android/iOS) Capacitor shell. */
export function isNativePlatform(): boolean {
  const c = cap();
  if (!c) return false;
  if (typeof c.isNativePlatform === "function") return c.isNativePlatform();
  const platform = c.getPlatform?.();
  return platform === "android" || platform === "ios";
}

export function isPluginReady(pluginName: string): boolean {
  const c = cap();
  if (!c) return false;
  if (typeof c.isPluginAvailable === "function" && c.isPluginAvailable(pluginName)) return true;
  return Boolean(c.Plugins && c.Plugins[pluginName]);
}

/**
 * Resolves once the requested Capacitor plugin is reachable through the native
 * bridge, or `false` if it never shows up within `timeoutMs`.
 */
export function waitForPlugin(pluginName: string, timeoutMs = 12_000, signal?: AbortSignal): Promise<boolean> {
  if (typeof window === "undefined" || signal?.aborted) return Promise.resolve(false);
  if (isNativePlatform() && isPluginReady(pluginName)) return Promise.resolve(true);

  // Capacitor's JS bridge may arrive AFTER React has mounted. In particular,
  // never return false just because the bridge wasn't ready on the first frame.
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("deviceready", check);
      signal?.removeEventListener("abort", abort);
      resolve(value);
    };
    const check = () => {
      if (isNativePlatform() && isPluginReady(pluginName)) finish(true);
      else if (Date.now() - started >= timeoutMs) finish(false);
    };
    const abort = () => finish(false);

    signal?.addEventListener("abort", abort, { once: true });
    document.addEventListener("deviceready", check);
    timer = setInterval(check, 100);
    check();
  });
}

/** Retries an async native call — the SDK can reject while the app is still booting. */
export async function retryNative<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 750,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

/** Hides the native splash screen; safe to call multiple times / on web. */
export async function hideNativeSplash(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* splash plugin unavailable */
  }
}
