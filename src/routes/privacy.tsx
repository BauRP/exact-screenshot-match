import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Wave Notes offline notebook" },
      {
        name: "description",
        content:
          "How Wave Notes handles your data: offline-first local storage, camera and media permissions, third-party SDKs and data deletion.",
      },
      { property: "og:title", content: "Privacy Policy — Wave Notes" },
      {
        property: "og:description",
        content:
          "Offline-first notes: local storage only, clear permission usage and full data deletion at any time.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const navigate = useNavigate();
  const t = useT();

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[450px] flex-col overflow-x-hidden bg-background md:max-w-3xl lg:max-w-5xl">
      <header className="z-10 shrink-0">
        <div className="glass mx-3 mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-4 py-3">
          <h1 className="truncate font-display text-lg font-semibold">
            {t("privacy_policy")}
          </h1>
          <button
            aria-label={t("close")}
            onClick={() => navigate({ to: "/settings" })}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary/60 hover:bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5">
        <article className="mx-auto max-w-xl space-y-6 text-sm leading-relaxed text-muted-foreground">
          <header className="space-y-1">
            <h2 className="font-display text-xl font-semibold text-foreground">
              {t("pp_title")}
            </h2>
            <p className="text-xs uppercase tracking-wide">{t("pp_developer")}</p>
          </header>

          <section className="space-y-2">
            <h3 className="font-display text-base font-semibold text-foreground">
              {t("pp_1_h")}
            </h3>
            <p>{t("pp_1_b")}</p>
          </section>

          <section className="space-y-2">
            <h3 className="font-display text-base font-semibold text-foreground">
              {t("pp_2_h")}
            </h3>
            <p>{t("pp_2_b")}</p>
            <ul className="space-y-3 border-l border-border pl-4">
              <li>
                <span className="font-semibold text-foreground">
                  {t("pp_2_camera_t")}:
                </span>{" "}
                {t("pp_2_camera_b")}
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  {t("pp_2_files_t")}:
                </span>{" "}
                {t("pp_2_files_b")}
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-display text-base font-semibold text-foreground">
              {t("pp_3_h")}
            </h3>
            <p>{t("pp_3_b")}</p>
            <p>{t("pp_3_purposes")}</p>
          </section>

          <section className="space-y-2">
            <h3 className="font-display text-base font-semibold text-foreground">
              {t("pp_4_h")}
            </h3>
            <p>{t("pp_4_b")}</p>
          </section>
        </article>
      </main>
    </div>
  );
}
