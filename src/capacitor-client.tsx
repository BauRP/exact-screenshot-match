import "./lib/polyfills";

import { StrictMode, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router";
import { hideNativeSplash } from "./lib/native-ready";

const CAPACITOR_ENTRY_MARKER = "wave-notes-capacitor-client-entry";
if (typeof window !== "undefined") {
  (window as Window & { __waveNotesCapacitorEntry?: string }).__waveNotesCapacitorEntry =
    CAPACITOR_ENTRY_MARKER;
}

// Safety net: the splash must never stay on screen longer than 3 seconds,
// even if the app fails to start.
const splashTimer = setTimeout(() => void hideNativeSplash(), 3000);

window.addEventListener("error", (event) => {
  console.error("[startup] uncaught error", event.error ?? event.message);
  void hideNativeSplash();
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[startup] unhandled rejection", event.reason);
});

function renderFatal(root: HTMLElement, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = "";
  const box = document.createElement("div");
  box.style.cssText =
    "min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;background:#121212;color:#eee;font-family:sans-serif;text-align:center";
  const title = document.createElement("h1");
  title.textContent = "Wave Notes could not start";
  title.style.fontSize = "18px";
  const detail = document.createElement("p");
  detail.textContent = message;
  detail.style.cssText = "font-size:13px;opacity:.7;word-break:break-word";
  const retry = document.createElement("button");
  retry.textContent = "Reload";
  retry.style.cssText = "padding:10px 20px;border-radius:999px;border:0;background:#f5a524;color:#111";
  retry.onclick = () => window.location.reload();
  box.append(title, detail, retry);
  root.appendChild(box);
}

function mount() {
  const root = document.getElementById("root");
  if (!root) {
    console.error("[startup] #root element missing");
    void hideNativeSplash();
    return;
  }

  try {
    const router = getRouter();
    createRoot(root, {
      onUncaughtError: (error) => {
        console.error("[startup] React uncaught error", error);
        renderFatal(root, error);
        void hideNativeSplash();
      },
    }).render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
  } catch (error) {
    console.error("[startup] bootstrap failed", error);
    renderFatal(root, error);
  } finally {
    // Hide as soon as the first frame is painted.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        clearTimeout(splashTimer);
        void hideNativeSplash();
      }),
    );
  }
}

startTransition(mount);
