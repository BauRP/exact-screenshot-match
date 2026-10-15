import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Camera, Settings } from "lucide-react";
import { useT } from "@/lib/i18n";

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";
  const isSettings = pathname.startsWith("/settings");
  const t = useT();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[450px] overflow-visible border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:max-w-3xl lg:max-w-5xl">
      <div className="mx-auto w-full max-w-xl overflow-visible px-3 pb-2 pt-1.5">
        <div className="relative flex items-center justify-between gap-2 overflow-visible rounded-full border border-border bg-surface px-3 py-1.5 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.6)]">

          <TabLink to="/" label={t("general")} active={isHome}>
            <Home className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          </TabLink>

          <Link
            to="/camera"
            aria-label={t("camera")}
            className="relative -mt-10 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-[0_15px_35px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)] ring-4 ring-background transition-transform active:scale-95"
          >
            <Camera className="h-5 w-5" strokeWidth={2.2} />
          </Link>

          <TabLink to="/settings" label={t("settings")} active={isSettings}>
            <Settings className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          </TabLink>

        </div>
      </div>
    </nav>
  );
}

function TabLink({
  to,
  label,
  active,
  children,
}: {
  to: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-2 py-1.5 text-[10px] font-medium transition-colors ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      {children}
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}
