import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Moon,
  Sun,
  LayoutGrid,
  List,
  Table2,
  Languages,
  Lock,
  Fingerprint,
  Shield,
  Send,
  MessageSquarePlus,
  Download,
  Upload,
 } from "lucide-react";
import { sendFeedback } from "@/lib/feedback.functions";
import { AdMobDiagnosticsPanel } from "@/components/AdMobDiagnosticsPanel";
import { isAutomaticBackupEnabled, setAutomaticBackupEnabled, restoreLocalBackup } from "@/lib/local-backup";
import { invalidateConsentForSession, requestConsentForSession } from "@/lib/admob-session";
import { AppHeader } from "@/components/AppHeader";
import { LanguagePickerSheet } from "@/components/LanguagePickerSheet";
import { BottomNav } from "@/components/BottomNav";
import { useTheme, setTheme } from "@/lib/theme";
import {
  setView,
  useView,
  type ViewMode,
} from "@/lib/notes-store";
import { toast } from "sonner";
import { setLang, useLang, useT, LANGUAGES, type Lang } from "@/lib/i18n";
import {
  setBiometrics,
  setPin,
  useLockConfig,
  verifyBiometric,
  verifyPin,
  biometricAvailability,
} from "@/lib/app-lock";
import { pinIsValid } from "@/lib/pin-security";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [
    { title: "Settings — Wave Notes" },
    { name: "description", content: "Personalize your Wave Notes language, appearance, security and note view." },
    { property: "og:title", content: "Settings — Wave Notes" },
    { property: "og:description", content: "Personalize your Wave Notes language, appearance, security and note view." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SettingsPage,
});


/* ------------------------------------------------------------------ */
/* Native, dependency-free primitives (no Radix in this screen)        */
/* ------------------------------------------------------------------ */

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-secondary"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${
          checked ? "left-[1.375rem]" : "left-0.5"
        }`}
      />
    </button>
  );
}


function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  footer: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-2xl">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          {icon}
          {title}
        </h2>
        <div className="pt-3">{children}</div>
        <div className="flex justify-end gap-2 pt-4">{footer}</div>
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  variant = "secondary",
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  disabled?: boolean;
  className?: string;
}) {
  const styles: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-secondary/70 text-foreground hover:bg-secondary",
    ghost: "text-muted-foreground hover:bg-secondary/60",
    destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 max-w-[9.5rem] shrink-0 items-center truncate justify-center rounded-full px-3 text-xs font-semibold transition-colors disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */

function SettingsPage() {
  const { theme } = useTheme();
  const view = useView();
  const language = useLang();
  const t = useT();
  const navigate = useNavigate();
  const { pinEnabled, bioEnabled } = useLockConfig();
  const [pinDialog, setPinDialog] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [enableBioAfterPin, setEnableBioAfterPin] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authPin, setAuthPin] = useState("");
  const [authError, setAuthError] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [fbTopic, setFbTopic] = useState("");
  const [fbText, setFbText] = useState("");
  const [fbSending, setFbSending] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [automaticBackup, setAutomaticBackup] = useState(false);
  useEffect(()=>{setAutomaticBackup(isAutomaticBackupEnabled());},[]);
  const [adPrivacyAvailable, setAdPrivacyAvailable] = useState(false);
  const [adPrivacyLoading, setAdPrivacyLoading] = useState(false);

  // UMP determines whether a privacy-options entry is required in this region.
  // Do not expose a dead button before the publisher has configured the form.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
        const info = await requestConsentForSession();
        if (!cancelled) setAdPrivacyAvailable(info.privacyOptionsRequirementStatus === "REQUIRED");
      } catch (error) {
        console.info("AdMob privacy options unavailable", error);
        if (!cancelled) setAdPrivacyAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openAdPrivacyOptions = async () => {
    if (adPrivacyLoading) return;
    setAdPrivacyLoading(true);
    try {
      const { AdMob } = await import("@capacitor-community/admob");
      await AdMob.showPrivacyOptionsForm();
      invalidateConsentForSession();
      toast.info("Рекламные настройки обновлены");
    } catch (error) {
      console.warn("Google UMP privacy options unavailable", error);
      toast.error("Google пока не предоставил форму рекламных настроек. Проверьте публикацию сообщения в AdMob.");
    } finally {
      setAdPrivacyLoading(false);
    }
  };

  const changeAutomaticBackup=async(enabled:boolean)=>{
    if(backupBusy)return;
    setBackupBusy(true);
    try{
      await setAutomaticBackupEnabled(enabled);
      setAutomaticBackup(isAutomaticBackupEnabled());
      toast.success(enabled
        ? "Автокопирование включено. Первая копия сохранена внутри приложения."
        : "Автокопирование выключено. Последняя копия сохранена.");
    }catch(error){
      setAutomaticBackup(isAutomaticBackupEnabled());
      toast.error(error instanceof Error?error.message:"Не удалось изменить резервное копирование");
    }finally{setBackupBusy(false);}
  };

  const restoreBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const count = await restoreLocalBackup();
      toast.success(count > 0 ? `Восстановлено заметок: ${count}` : "Резервная копия проверена. Новых заметок нет.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось восстановить резервную копию");
    } finally { setBackupBusy(false); }
  };

  const openPinSetup = (enableBiometricsAfterwards: boolean) => {
    setEnableBioAfterPin(enableBiometricsAfterwards);
    setPinValue("");
    setPinConfirm("");
    setPinDialog(true);
  };

  /** Requires a biometric scan OR the current PIN before running `action`. */
  const requireAuth = (action: () => void) => {
    if (!pinEnabled && !bioEnabled) {
      action();
      return;
    }
    setPendingAction(() => action);
    setAuthPin("");
    setAuthError(false);
    setAuthOpen(true);
    if (bioEnabled) {
      // System fingerprint prompt is requested only by the explicit button; PIN always works.
    }
  };

  const submitAuthPin = async () => {
    const ok = await verifyPin(authPin);
    if (!ok) {
      setAuthError(true);
      setAuthPin("");
      return;
    }
    const action = pendingAction;
    setAuthOpen(false);
    setAuthPin("");
    setPendingAction(null);
    action?.();
  };

  const runBiometricAuth = async () => {
    const ok = await verifyBiometric();
    if (!ok) {
      setAuthError(true);
      return;
    }
    const action = pendingAction;
    setAuthOpen(false);
    setPendingAction(null);
    action?.();
  };

  const submitFeedback = async () => {
    const topic = fbTopic.trim();
    const text = fbText.trim();
    if (!topic || !text || fbSending) return;
    setFbSending(true);
    try {
      const { Capacitor, registerPlugin } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
        // The offline APK does not include a TanStack feedback server.
        // Android's email composer sends only after the user confirms.
        const email = registerPlugin<{ compose(options: { subject: string; message: string }): Promise<void> }>("FeedbackEmail");
        await email.compose({ subject: topic, message: text });
        toast.info("Открыта почта. Для доставки предложения нажмите «Отправить».");
        setFeedbackOpen(false);
      } else {
        const res = await sendFeedback({ data: { topic, text } });
        if (!res?.ok) throw new Error("Feedback service unavailable");
        toast.success(t("fb_sent"));
        setFbTopic("");
        setFbText("");
        setFeedbackOpen(false);
      }
    } catch {
      toast.error(t("fb_failed"));
    } finally {
      setFbSending(false);
    }
  };

  const enableBiometrics = async () => {
    if (securityBusy) return;
    if (!pinEnabled) { openPinSetup(true); return; }
    setSecurityBusy(true);
    try {
      const status = await biometricAvailability();
      if (!status.available) { toast.error(status.reason); return; }
      if (!await verifyBiometric()) { toast.error("Отпечаток не подтверждён. PIN продолжает работать."); return; }
      setBiometrics(true);
      toast.success("Биометрия включена. PIN остаётся резервным.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось включить биометрию");
    } finally { setSecurityBusy(false); }
  };

  const savePin = async () => {
    const value = pinValue.trim();
    if (!pinIsValid(value)) { toast.error("Укажите PIN из 6–8 цифр, без простой последовательности."); return; }
    if (value !== pinConfirm.trim()) { toast.error("PIN и повторный ввод не совпадают."); return; }
    if (securityBusy) return;
    setSecurityBusy(true);
    try {
      await setPin(value);
      const wantBio=enableBioAfterPin;
      setEnableBioAfterPin(false);
      setPinValue("");
      setPinConfirm("");
      setPinDialog(false);
      toast.success("PIN установлен. Сохраните его для резервного входа.");
      if (wantBio) {
        const status=await biometricAvailability();
        if (!status.available) toast.info(status.reason);
        else if (await verifyBiometric()) {
          setBiometrics(true);
          toast.success("Отпечаток подтверждён. PIN остаётся резервным.");
        } else toast.info("Отпечаток не подтверждён; защита PIN включена.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось установить PIN");
    } finally { setSecurityBusy(false); }
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <AppHeader eyebrow={t("configuration")} title={t("settings")} />

      <main className="mx-auto w-full min-h-0 max-w-xl flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 pb-[130px] pt-3 [-webkit-overflow-scrolling:touch]">

        <Section title={t("appearance")} eyebrow="01">
          <Row
            icon={theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            title={t("dark_theme")}
            hint={t("dark_theme_hint")}
          >
            <Toggle
              label={t("dark_theme")}
              checked={theme === "dark"}
              onChange={(v) => setTheme(v ? "dark" : "light")}
            />
          </Row>
        </Section>

        <Section title={t("default_list")} eyebrow="02">
          <div className="grid grid-cols-3 gap-1.5 p-1.5">
            <ViewChoice current={view} value="list" label={t("list")} icon={<List className="h-4 w-4" />} />
            <ViewChoice current={view} value="grid" label={t("grid")} icon={<LayoutGrid className="h-4 w-4" />} />
            <ViewChoice current={view} value="table" label={t("table")} icon={<Table2 className="h-4 w-4" />} />
          </div>
        </Section>

        <Section title={t("languages")} eyebrow="03">
          <Row
            icon={<Languages className="h-4 w-4" />}
            title={t("ui_language")}
            hint={t("ui_language_hint")}
          >
            <LanguagePickerSheet
              compact label={t("ui_language")}
              description="Выберите язык приложения Wave Notes"
              value={language}
              onChange={(v) => setLang(v as Lang)}
              options={LANGUAGES}
            />
          </Row>
        </Section>

        <Section title={t("security")} eyebrow="04">
          <Row
            icon={<Fingerprint className="h-4 w-4" />}
            title={t("biometrics")}
            hint={t("biometrics_hint")}
          >
            <Toggle
              label={t("biometrics")}
              checked={bioEnabled}
              onChange={(next) => {
                if (next) {
                  // Enabling biometrics always requires a backup PIN first.
                  if (pinEnabled) void enableBiometrics();
                  else openPinSetup(true);
                } else {
                  // Disabling requires a successful biometric scan or the PIN.
                  requireAuth(() => {
                    setBiometrics(false);
                  });
                }
              }}
            />
          </Row>
          <div className="h-px bg-border" />
          <Row icon={<Lock className="h-4 w-4" />} title={t("set_pin")} hint={t("app_lock_hint")}>
            <Btn
              onClick={() => {
                // Always permit first-time PIN setup; authenticate before changes.
                if (pinEnabled) requireAuth(() => openPinSetup(false));
                else openPinSetup(false);
              }}
            >
              {t("set_pin")}
            </Btn>
          </Row>
        </Section>

        <Section title={t("data")} eyebrow="05">
          <Row icon={<Download className="h-4 w-4" />} title="Автоматическая резервная копия"
            hint={automaticBackup
              ? "Включено. Копия обновляется после сохранения заметки или PDF галочкой."
              : "Выключено. Включите, чтобы создать внутреннюю копию и обновлять её после сохранения."}>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <Toggle checked={automaticBackup} onChange={value=>void changeAutomaticBackup(value)}
                label="Автоматическое резервное копирование" />
              <span className={`text-[10px] font-semibold ${automaticBackup?"text-primary":"text-muted-foreground"}`}>
                {backupBusy?"Подождите":automaticBackup?"Включено":"Выключено"}
              </span>
            </div>
          </Row>
          <div className="h-px bg-border" />
          <Row icon={<Upload className="h-4 w-4" />} title="Восстановить резервную копию" hint="Автоматически находит последнюю внутреннюю копию. Выбирать файл не нужно.">
            <Btn disabled={backupBusy} onClick={() => void restoreBackup()}>Восстановить</Btn>
          </Row>
          <div className="h-px bg-border" />
          <Row icon={<Shield className="h-4 w-4" />} title={t("privacy_policy")}>
            <Btn onClick={async () => {
              try {
                const { Capacitor, registerPlugin } = await import("@capacitor/core");
                if (Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform()) {
                  const browser = registerPlugin<{ openPolicy(): Promise<void> }>("PrivacyLink");
                  await browser.openPolicy();
                } else {
                  window.open("https://baurp.github.io/privacy/wave-notes/", "_blank", "noopener,noreferrer");
                }
              } catch (error) {
                toast.error("Не удалось открыть сайт политики конфиденциальности");
                console.error("Cannot open privacy policy", error);
              }
            }}>Перейти</Btn>
          </Row>
          {adPrivacyAvailable ? (
            <>
              <div className="h-px bg-border" />
              <Row icon={<Shield className="h-4 w-4" />} title="Настройки рекламной конфиденциальности" hint="Изменить выбор согласия Google">
                <Btn disabled={adPrivacyLoading} onClick={() => void openAdPrivacyOptions()}>
                  {adPrivacyLoading ? "Открытие…" : "Управлять"}
                </Btn>
              </Row>
            </>
          ) : null}
          <div className="h-px bg-border" />
          <Row icon={<MessageSquarePlus className="h-4 w-4" />} title={t("ideas_wishes")}>
            <Btn onClick={() => setFeedbackOpen(true)}>{t("fb_send")}</Btn>
          </Row>
        </Section>

        {/* Build-time opt-in only: never show debug details in live-ad releases. */}
        {import.meta.env.VITE_ADMOB_DIAGNOSTICS === "true" &&
         import.meta.env.VITE_ADMOB_LIVE_ADS !== "true" ? (
          <AdMobDiagnosticsPanel onGoHome={() => void navigate({ to: "/" })} />
        ) : null}

        <p className="pt-4 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {t("offline_note")}
        </p>
      </main>

      {/* PIN modal */}
      <Modal
        open={pinDialog}
        onClose={() => setPinDialog(false)}
        title={t("set_pin")}
        icon={<Lock className="h-4 w-4 text-primary" />}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setPinDialog(false)}>
              {t("cancel")}
            </Btn>
            <Btn variant="primary" onClick={savePin} disabled={securityBusy || !pinIsValid(pinValue) || pinValue !== pinConfirm}>
              {t("save")}
            </Btn>
          </>
        }
      >
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pinValue}
          onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="Новый PIN: 6–8 цифр"
          autoComplete="new-password"
          className="h-9 w-full rounded-xl border border-border bg-secondary/40 px-3 text-sm outline-none focus:border-primary"
        />
        <input type="password" inputMode="numeric" autoComplete="new-password"
          aria-label="Повторите PIN" value={pinConfirm}
          onChange={event=>setPinConfirm(event.target.value.replace(/\D/g,"").slice(0,8))}
          placeholder="Повторите PIN"
          className="mt-2 h-9 w-full rounded-xl border border-border bg-secondary/40 px-3 text-sm outline-none focus:border-primary" />
        <p className="mt-2 text-xs text-muted-foreground">PIN необходим для входа, если отпечаток пальца недоступен.</p>
      </Modal>

      {/* Authentication gate (biometric scan or current PIN) */}
      <Modal
        open={authOpen}
        onClose={() => {
          setAuthOpen(false);
          setPendingAction(null);
        }}
        title={t("biometrics")}
        icon={<Fingerprint className="h-4 w-4 text-primary" />}
        footer={
          <>
            <Btn
              variant="ghost"
              onClick={() => {
                setAuthOpen(false);
                setPendingAction(null);
              }}
            >
              {t("cancel")}
            </Btn>
            <Btn variant="primary" onClick={submitAuthPin} disabled={authPin.length < 4}>
              {t("save")}
            </Btn>
          </>
        }
      >
        <div className="space-y-2">
          {bioEnabled && (
            <Btn onClick={runBiometricAuth}>
              <Fingerprint className="mr-1.5 h-3.5 w-3.5" />
              {t("biometrics")}
            </Btn>
          )}
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={authPin}
            onChange={(e) => {
              setAuthError(false);
              setAuthPin(e.target.value.replace(/\D/g, "").slice(0, 8));
            }}
            onKeyDown={(e) => e.key === "Enter" && submitAuthPin()}
            placeholder={t("pin_placeholder")}
            className="h-9 w-full rounded-xl border border-border bg-secondary/40 px-3 text-sm outline-none focus:border-primary"
          />
          {authError && <p className="text-xs text-destructive">{t("wrong_pin")}</p>}
        </div>
      </Modal>


      {/* Feedback modal */}
      <Modal
        open={feedbackOpen}
        onClose={() => !fbSending && setFeedbackOpen(false)}
        title={t("ideas_wishes")}
        icon={<MessageSquarePlus className="h-4 w-4 text-primary" />}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setFeedbackOpen(false)} disabled={fbSending}>
              {t("cancel")}
            </Btn>
            <Btn
              variant="primary"
              onClick={submitFeedback}
              disabled={fbSending || !fbTopic.trim() || !fbText.trim()}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {t("fb_send")}
            </Btn>
          </>
        }
      >
        <div className="grid gap-2">
          <input
            autoFocus
            value={fbTopic}
            onChange={(e) => setFbTopic(e.target.value.slice(0, 200))}
            placeholder={t("fb_topic")}
            className="h-9 w-full rounded-xl border border-border bg-secondary/40 px-3 text-sm outline-none focus:border-primary"
          />
          <textarea
            rows={5}
            value={fbText}
            onChange={(e) => setFbText(e.target.value.slice(0, 4000))}
            placeholder={t("fb_text")}
            className="w-full resize-none rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </Modal>

      <BottomNav />
    </div>
  );
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground/60">{eyebrow}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card/60">{children}</div>
    </section>
  );
}

function Row({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary/60 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-tight">{title}</p>
        {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ViewChoice({
  current,
  value,
  label,
  icon,
}: {
  current: ViewMode;
  value: ViewMode;
  label: string;
  icon: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => setView(value)}
      className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-secondary/60"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
