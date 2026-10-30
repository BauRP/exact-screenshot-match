import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { checkPinRecord, createPinRecord, needsPinMigration } from "./pin-security";

const PIN_KEY = "sn.lock.pin.v1";
const BIO_KEY = "sn.lock.bio.v1";
const UNLOCKED_KEY = "sn.lock.unlocked.session";

const listeners = new Set<() => void>();
let pinHash: string | null = null;
let bioEnabled = false;
let hydrated = false;


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
  const record = await createPinRecord(pin);
  // Never report success if the PIN cannot survive an app restart.
  localStorage.setItem(PIN_KEY, record);
  pinHash = record;
  markUnlocked(); // The authenticated settings session remains active.
  emit();
}

export function clearPin() {
  pinHash = null;
  try { localStorage.removeItem(PIN_KEY); } catch {}
  emit();
}

export function setBiometrics(v: boolean) {
  hydrate();
  if (v && !pinHash) throw new Error("Сначала установите PIN для восстановления доступа.");
  localStorage.setItem(BIO_KEY, v ? "1" : "0");
  bioEnabled = v;
  emit();
}

export async function verifyPin(pin: string): Promise<boolean> {
  hydrate();
  if (!pinHash) return false; // No PIN cannot authenticate protected actions.
  const saved = pinHash;
  const verified = await checkPinRecord(pin, saved);
  if (verified && needsPinMigration(saved) && /^\d{6,8}$/.test(pin)) {
    // Upgrade existing long PINs after a successful unlock, never before.
    try {
      const next=await createPinRecord(pin);
      if (pinHash===saved) {
        localStorage.setItem(PIN_KEY,next);
        pinHash=next;
      }
    } catch { /* old record remains usable */ }
  }
  return verified;
}

/** The Android system checks its OWN enrolled fingerprints. We never receive templates. */
export async function biometricAvailability(): Promise<{available:boolean; reason:string}> {
  try {
    if (typeof window==="undefined" || !(window as any).Capacitor?.isNativePlatform?.())
      return {available:false,reason:"Биометрия доступна только в установленном приложении Android."};
    const { NativeBiometric } = await import("capacitor-native-biometric");
    const status = await NativeBiometric.isAvailable({useFallback:false});
    if (!status.isAvailable) return {
      available:false,reason:"На устройстве нет зарегистрированного отпечатка или датчик временно недоступен. Настройте отпечаток в параметрах Android.",
    };
    return {available:true,reason:""};
  } catch {
    return {available:false,reason:"Не удалось подключиться к системе биометрии Android."};
  }
}
export async function verifyBiometric(): Promise<boolean> {
  try {
    const status=await biometricAvailability();
    if (!status.available) return false;
    const { NativeBiometric }=await import("capacitor-native-biometric");
    await NativeBiometric.verifyIdentity({
      reason:"Подтвердите доступ к заметкам",
      title:"Wave Notes",
      subtitle:"Используйте отпечаток пальца",
      negativeButtonText:"Использовать PIN",
      useFallback:false,
    });
    return true;
  } catch { return false; }
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

  if (!ready) return <div className="flex h-[100dvh] items-center justify-center bg-background" aria-label="Проверка защиты приложения"><span className="text-sm text-muted-foreground">Проверка доступа…</span></div>;

  if (locked) {
    return <LockScreen onUnlock={() => { markUnlocked(); setLocked(false); }} />;
  }
  return <>{children}</>;
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { pinEnabled, bioEnabled } = useLockConfig();
  const [pin, setPinState] = useState("");
  const [err, setErr] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanningRef = useRef(false);
  const tryBio = async () => {
    if (!bioEnabled || !pinEnabled || scanningRef.current) return;
    scanningRef.current=true;
    setScanning(true);
    try {
      const ok=await verifyBiometric();
      if (ok && document.visibilityState==="visible") {onUnlock();return;}
      if (!ok) setErr(true);
    } finally {
      scanningRef.current=false;
      setScanning(false);
    }
  };
  useEffect(() => {
    if (pinEnabled && bioEnabled) void tryBio();
    // Try the Android system dialog once. Manual retry remains available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!pinEnabled || pin.length<4) return;
    const ok=await verifyPin(pin);
    if (ok) {setErr(false);onUnlock();}
    else {setErr(true);setPinState("");}
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background px-6" role="dialog" aria-label="Защита заметок">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-2xl">
        <h1 className="font-display text-xl font-semibold">🔒</h1>
        <h2 className="mt-2 font-display text-lg font-semibold">Wave Notes заблокирован</h2>
        <p className="mt-1 text-xs text-muted-foreground">Введите PIN приложения или подтвердите отпечаток пальца.</p>
        {pinEnabled && (
          <div className="mt-5">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              aria-label="PIN приложения"
              autoFocus
              value={pin}
              onChange={event=>{setErr(false);setPinState(event.target.value.replace(/\D/g,"").slice(0,8));}}
              onKeyDown={event=>{if(event.key==="Enter") void submit();}}
              placeholder="••••••"
              className="w-full rounded-full border border-border bg-secondary/40 px-5 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:border-primary"
            />
            <button type="button" disabled={pin.length<4} onClick={()=>void submit()}
              className="mt-3 w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              Войти по PIN
            </button>
          </div>
        )}
        {bioEnabled && pinEnabled && (
          <button type="button" onClick={()=>void tryBio()} disabled={scanning}
            className="mt-3 w-full rounded-full bg-secondary/60 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
            {scanning ? "Проверка отпечатка…" : "Использовать отпечаток"}
          </button>
        )}
        {err && <p className="mt-3 text-xs text-destructive" role="alert">Проверка не прошла. Попробуйте PIN приложения.</p>}
        {!pinEnabled && <p className="mt-4 text-xs text-destructive" role="alert">PIN защиты не найден. Автоматический вход запрещён.</p>}
      </div>
    </div>
  );
}
