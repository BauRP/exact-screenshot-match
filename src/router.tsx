import "./lib/polyfills";

import { QueryClient } from "@tanstack/react-query";
import { createHashHistory, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

type AppRouter = ReturnType<typeof createAppRouter>;

let browserRouter: AppRouter | null = null;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 0,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

function readHashInitialEntry() {
  if (typeof window === "undefined") return "/";
  const rawHash = window.location.hash;
  if (!rawHash || rawHash === "#") return "/";
  const withoutHash = rawHash.slice(1);
  return withoutHash.startsWith("/") ? withoutHash : `/${withoutHash}`;
}

function createAppRouter() {
  const queryClient = createQueryClient();
  const history =
    typeof window === "undefined"
      ? createMemoryHistory({ initialEntries: [readHashInitialEntry()] })
      : createHashHistory();

  return createRouter({
    routeTree,
    context: { queryClient },
    history,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 250,
    defaultPendingMinMs: 150,
  });
}

export function getRouter() {
  if (typeof window === "undefined") return createAppRouter();
  if (!browserRouter) browserRouter = createAppRouter();
  return browserRouter;
}
