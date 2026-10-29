import { useSyncExternalStore } from "react";

export type AdStatus = "waiting" | "bridge" | "consent" | "blocked" | "initializing" | "loading" | "loaded" | "failed" | "offline";
export type AdDiagnostic = {
  status: AdStatus;
  message: string;
  updatedAt: number;
  lastError?: string;
  lastSlot?: string;
  issueCode?: string;
  advice?: string;
  loadedCount: number;
  failedCount: number;
};
let state: AdDiagnostic = {
  status: "waiting", message: "Ожидание запуска AdMob", updatedAt: Date.now(),
  loadedCount: 0, failedCount: 0,
};
const subscribers = new Set<() => void>();
const publish = () => subscribers.forEach((cb) => cb());
export function updateAdDiagnostic(status: AdStatus, message: string, details?: { error?: string; slot?: string; code?: string; advice?: string }): void {
  state = {
    ...state, status, message, updatedAt: Date.now(),
    // A successful new attempt must not display an old UMP failure forever.
    lastError: details?.error ?? ((status === "failed" || status === "blocked") ? state.lastError : undefined),
    lastSlot: details?.slot ?? ((status === "failed" || status === "blocked") ? state.lastSlot : undefined),
    issueCode: details?.code ?? ((status === "failed" || status === "blocked") ? state.issueCode : undefined),
    advice: details?.advice ?? ((status === "failed" || status === "blocked") ? state.advice : undefined),
    loadedCount: state.loadedCount + (status === "loaded" ? 1 : 0),
    failedCount: state.failedCount + (status === "failed" ? 1 : 0),
  };
  console.info("[SuperNotes AdMob]", status, message, details ?? "");
  publish();
}
export const useAdDiagnostic = (): AdDiagnostic =>
  useSyncExternalStore((cb) => { subscribers.add(cb); return () => subscribers.delete(cb); }, () => state, () => state);

// The settings screen is a different route from the native ad feed.
// Persist ONE retry request in memory until the home feed starts listening.
let pendingRetry = false;
export function requestAdRetry(): void {
  pendingRetry = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("supernotes-admob-retry"));
  }
}
export function consumePendingAdRetry(): boolean {
  const requested = pendingRetry;
  pendingRetry = false;
  return requested;
}
