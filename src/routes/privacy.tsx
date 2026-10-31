import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Wave Notes — Политика конфиденциальности" }] }),
  component: PrivacyPage,
});

const POLICY_URL = "https://baurp.github.io/privacy/wave-notes/";

async function openOfficialPolicy() {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      await registerPlugin<{ openPolicy(): Promise<void> }>("PrivacyLink").openPolicy();
    } else {
      window.open(POLICY_URL, "_blank", "noopener,noreferrer");
    }
  } catch (error) {
    console.error("Unable to open privacy policy", error);
    toast.error("Не удалось открыть сайт политики конфиденциальности");
  }
}

function PrivacyPage() {
  const navigate = useNavigate();
  const t = useT();
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[450px] flex-col bg-background md:max-w-3xl">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="font-display text-base font-semibold">{t("privacy_policy")}</h1>
        <button aria-label={t("close")} onClick={() => navigate({ to: "/settings" })} className="grid h-10 w-10 place-items-center rounded-full bg-secondary">
          <X className="h-5 w-5" />
        </button>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <ShieldCheck className="h-12 w-12 text-primary" />
        <p className="text-sm text-muted-foreground">Официальная политика конфиденциальности Wave Notes от Tengrize studio опубликована на нашем сайте.</p>
        <button onClick={() => void openOfficialPolicy()} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground">
          Перейти на сайт <ArrowUpRight className="h-4 w-4" />
        </button>
      </main>
    </div>
  );
}
