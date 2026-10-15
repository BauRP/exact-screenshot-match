import { useEffect, useState, useSyncExternalStore } from "react";

const PIN_KEY = "sn.lock.pin.v1";
const BIO_KEY = "sn.lock.bio.v1";
const UNLOCKED_KEY = "sn.lock.unlocked.session";

const listeners = new Set<() => void>();
let pinHash: string | null = null;
let bioEnabled = false;
let hydrated = false;

async function sha256(s: string): Promise<string> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
      const enc = new TextEncoder().encode(s);
      const buf = await crypto.subtle.digest("SHA-256", enc);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {}
  let hash = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `legacy-${(hash >>> 0).toString(16)}`;
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    pinHash = localStorage.getItem(PIN_KEY);
    bioEnabled = localStorage.getItem(BIO_KEY) === "1";
  } catch {}
}

function emit() { cachedConfig = null; listeners.forEach((l) => l()); }

let cachedConfig: { pinEnabled: boolean; bioEnabled: boolean } | null = null;
const SERVER_CONFIG = { pinEnabled: false, bioEnabled: false };
function readConfig() {
  hydrate();
  if (!cachedConfig || cachedConfig.pinEnabled !== !!pinHash || cachedConfig.bioEnabled !== bioEnabled) {
    cachedConfig = { pinEnabled: !!pinHash, bioEnabled };
  }
  return cachedConfig;
}

export function useLockConfig() {
  return useSyncExternalStore(
    (cb) => { hydrate(); listeners.add(cb); return () => listeners.delete(cb); },
    readConfig,
    () => SERVER_CONFIG,
  );
}

export async function setPin(pin: string) {
  const h = await sha256(pin);
  pinHash = h;
  try { localStorage.setItem(PIN_KEY, h); } catch {}
  emit();
}

export function clearPin() {
  pinHash = null;
  try { localStorage.removeItem(PIN_KEY); } catch {}
  emit();
}

export function setBiometrics(v: boolean) {
  bioEnabled = v;
  try { localStorage.setItem(BIO_KEY, v ? "1" : "0"); } catch {}
  emit();
}

export async function verifyPin(pin: string): Promise<boolean> {
  hydrate();
  if (!pinHash) return true;
  const h = await sha256(pin);
  return h === pinHash;
}

/** Runs a native biometric prompt. Resolves true only on a successful scan. */
export async function verifyBiometric(): Promise<boolean> {
  try {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return false;
    const mod: any = await import("capacitor-native-biometric").catch(() => null);
    if (!mod?.NativeBiometric) return false;
    const avail = await mod.NativeBiometric.isAvailable().catch(() => null);
    if (!avail?.isAvailable) return false;
    await mod.NativeBiometric.verifyIdentity({
      reason: "Confirm it's you",
      title: "Authenticate",
    });
    return true;
  } catch {
    return false;
  }
}

export function isProtected() {
  hydrate();
  return !!pinHash || bioEnabled;
}

export function markUnlocked() {
  try { sessionStorage.setItem(UNLOCKED_KEY, "1"); } catch {}
}
export function markLocked() {
  try { sessionStorage.removeItem(UNLOCKED_KEY); } catch {}
}
export function isUnlocked() {
  try { return sessionStorage.getItem(UNLOCKED_KEY) === "1"; } catch { return false; }
}

/** Overlay gate: renders LockScreen when app is protected and not unlocked. */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    hydrate();
    // Re-check on mount (cold start)
    setLocked(isProtected() && !isUnlocked());
    setReady(true);

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        markLocked();
      } else if (document.visibilityState === "visible") {
        if (isProtected() && !isUnlocked()) setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    // Capacitor App plugin (native): appStateChange
    let removeCap: (() => void) | undefined;
    (async () => {
      try {
        const cap = (window as any).Capacitor;
        if (cap?.isNativePlatform?.()) {
          const { App } = await import("@capacitor/app");
          const h = await App.addListener("appStateChange", (state: { isActive: boolean }) => {
            if (!state.isActive) {
              markLocked();
            } else if (isProtected() && !isUnlocked()) {
              setLocked(true);
            }
          });
          removeCap = () => h.remove();
        }
      } catch {}
    })();

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      removeCap?.();
    };
  }, []);

  if (!ready) return <>{children}</>;

  if (locked) {
    return <LockScreen onUnlock={() => { markUnlocked(); setLocked(false); }} />;
  }
  return <>{children}</>;
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { pinEnabled, bioEnabled } = useLockConfig();
  const [pin, setPinState] = useState("");
  const [err, setErr] = useState(false);

  const tryBio = async () => {
    try {
      const cap = (window as any).Capacitor;
      if (!cap?.isNativePlatform?.()) {
        // Web preview: no biometrics available. Fall back to PIN if set, otherwise unlock.
        if (!pinEnabled) onUnlock();
        return;
      }
      const mod: any = await import("capacitor-native-biometric").catch(() => null);
      if (mod?.NativeBiometric) {
        const avail = await mod.NativeBiometric.isAvailable().catch(() => null);
        if (avail?.isAvailable) {
          await mod.NativeBiometric.verifyIdentity({
            reason: "Unlock app",
            title: "Authenticate",
          });
          onUnlock();
          return;
        }
      }
      if (!pinEnabled) onUnlock();
    } catch {
      setErr(true);
    }
  };

  useEffect(() => {
    if (bioEnabled && !pinEnabled) tryBio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    const ok = await verifyPin(pin);
    if (ok) { setErr(false); onUnlock(); }
    else { setErr(true); setPinState(""); }
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/95 backdrop-blur-xl px-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card/80 p-6 text-center shadow-2xl">
        <h1 className="font-display text-xl font-semibold">🔒</h1>
        <h2 className="mt-2 font-display text-lg font-semibold">Locked</h2>
        <p className="mt-1 text-xs text-muted-foreground">Enter your PIN or use biometrics to continue.</p>

        {pinEnabled && (
          <div className="mt-5">
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPinState(e.target.value.replace(/\D/g, "").slice(0, 8))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••"
              className="w-full rounded-full border border-border bg-secondary/40 px-5 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:border-primary"
            />
            {err && <p className="mt-2 text-xs text-destructive">Wrong PIN</p>}
            <button
              onClick={submit}
              className="mt-3 w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Unlock
            </button>
          </div>
        )}
        {bioEnabled && (
          <button
            onClick={tryBio}
            className="mt-3 w-full rounded-full bg-secondary/60 px-5 py-2.5 text-sm font-semibold hover:bg-secondary"
          >
            Use biometrics
          </button>
        )}
      </div>
    </div>
  );
}
