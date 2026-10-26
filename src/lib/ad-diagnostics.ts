import { useSyncExternalStore } from "react";

export type AdStatus = "waiting" | "bridge" | "consent" | "blocked" | "initializing" | "loading" | "loaded" | "failed" | "offline";
export type AdDiagnostic = {
  status: AdStatus;
  message: string;
  updatedAt: number;
  lastError?: string;
  lastSlot?: string;
  loadedCount: number;
  failedCount: number;
};
let state: AdDiagnostic = {
  status: "waiting", message: "Ожидание запуска AdMob", updatedAt: Date.now(),
  loadedCount: 0, failedCount: 0,
};
const subscribers = new Set<() => void>();
const publish = () => subscribers.forEach((cb) => cb());
export function updateAdDiagnostic(status: AdStatus, message: string, details?: { error?: string; slot?: string }): void {
  state = {
    ...state, status, message, updatedAt: Date.now(),
    ...(details?.error ? { lastError: details.error } : {}),
    ...(details?.slot ? { lastSlot: details.slot } : {}),
    loadedCount: state.loadedCount + (status === "loaded" ? 1 : 0),
    failedCount: state.failedCount + (status === "failed" ? 1 : 0),
  };
  console.info("[SuperNotes AdMob]", status, message, details ?? "");
  publish();
}
export const useAdDiagnostic = (): AdDiagnostic =>
  useSyncExternalStore((cb) => { subscribers.add(cb); return () => subscribers.delete(cb); }, () => state, () => state);

export function requestAdRetry(): void {
  window.dispatchEvent(new Event("supernotes-admob-retry"));
}
