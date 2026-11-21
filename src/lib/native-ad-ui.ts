import { useSyncExternalStore } from "react";

// Google native ads are separate Android views above WebView. Hide them
// temporarily while a floating dropdown or blocking dialog is open, so they
// cannot cover the menu's options. The ad feed stays alive; no ad reload.
let blockingDialog = false;
const listeners = new Set<() => void>();
export function setNativeAdDialogBlocked(value: boolean) {
  if (blockingDialog === value) return;
  blockingDialog = value;
  for (const notify of listeners) notify();
}
export function useNativeAdDialogBlocked() {
  return useSyncExternalStore(
    (notify) => { listeners.add(notify); return () => listeners.delete(notify); },
    () => blockingDialog, () => false,
  );
}
