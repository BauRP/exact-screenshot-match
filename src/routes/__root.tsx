import "../lib/polyfills";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeBoot } from "../lib/theme";
import { AppLockGate } from "../lib/app-lock";
import { NativeShellBoot } from "../lib/native-shell";
import { NativeBackHandler } from "../lib/native-back";
import { normalizeLang, dirOf } from "../lib/i18n";


import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gradient-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Страница не найдена</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Такого маршрута не существует.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Попробуйте обновить страницу.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
      },
      { title: "Супер заметки — умный офлайн-блокнот" },
      {
        name: "description",
        content:
          "Супер заметки: премиальный офлайн-блокнот с распознаванием текста с камеры, стильным редактором и полной приватностью.",
      },
      { property: "og:title", content: "Супер заметки" },
      {
        property: "og:description",
        content:
          "Премиальный офлайн-блокнот с OCR-камерой и стильным редактором.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "favicon.ico", type: "image/x-icon" }, // Изменено
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Caveat:wght@400;600&family=Comfortaa:wght@400;600;700&family=Fira+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Lora:wght@400;600&family=Manrope:wght@400;500;600;700&family=Merriweather:wght@400;700&family=Montserrat:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&family=Nunito:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&family=Oswald:wght@400;500;600&family=PT+Sans:wght@400;700&family=Playfair+Display:ital,wght@0,600;1,600&family=Raleway:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Rubik:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Ubuntu:wght@400;500;700&family=Work+Sans:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Amatic+SC:wght@400;700&family=EB+Garamond:ital,wght@0,400;0,700;1,400&family=Lexend:wght@400;600;700&family=Lobster&family=Pacifico&family=Roboto+Mono:ital,wght@0,400;0,700;1,400&family=Roboto+Serif:ital,wght@0,400;0,700;1,400&family=Spectral:ital,wght@0,400;0,700;1,400&display=swap",
      },

    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ({ error, reset }) => <ErrorComponent error={error as Error} reset={reset} />,
});

function RootShell({ children }: { children: ReactNode }) {
  // The Capacitor/SPA entry mounts into an existing <div id="root">, so the
  // shell must NOT render a nested <html>/<body> document there.
  const isSpaMount =
    typeof window !== "undefined" &&
    Boolean((window as Window & { __waveNotesCapacitorEntry?: string }).__waveNotesCapacitorEntry);

  if (isSpaMount) {
    return (
      <>
        <HeadContent />
        {children}
      </>
    );
  }

  return (
    <html lang="ru">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="root">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sn.language.v1");
      const picked =
        normalizeLang(saved) ??
        normalizeLang(
          ([...(navigator.languages ?? []), navigator.language].filter(
            Boolean,
          ) as string[])[0],
        ) ??
        "en";
      localStorage.setItem("sn.language.v1", picked);
      document.documentElement.lang = picked;
      document.documentElement.dir = dirOf(picked);
    } catch {}
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeBoot />
      <NativeShellBoot />
      <NativeBackHandler />
      <AppLockGate>
        <SafeFrame>
          <div className="relative mx-auto flex min-h-0 w-full max-w-[450px] flex-1 flex-col overflow-hidden border-x border-slate-800 bg-background shadow-2xl md:max-w-3xl lg:max-w-5xl">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <Outlet />
            </div>
          </div>
        </SafeFrame>
      </AppLockGate>

      <Toaster position="top-center" theme="dark" richColors />
    </QueryClientProvider>
  );
}


/** Root frame: fills the screen and starts strictly below the system status bar. */
function SafeFrame({ children }: { children: ReactNode }) {
  const nativeAndroid = typeof window !== "undefined" && (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === "android";
  const top = nativeAndroid ? "0px" : "env(safe-area-inset-top)";
  return (
    <div
      style={{ paddingTop: top, paddingBottom: nativeAndroid ? "0px" : "env(safe-area-inset-bottom)" }}
      className="flex h-[100dvh] w-full max-w-[100vw] flex-col overflow-x-hidden bg-background"
    >
      {children}
    </div>
  );
}
