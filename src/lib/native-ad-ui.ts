import { useSyncExternalStore } from "react";

// Only actual blocking dialogs hide the Android native overlays. A three-dot
// menu is rendered in normal page flow and must NEVER blank the advertisements.
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
