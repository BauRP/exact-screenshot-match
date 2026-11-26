import { useRouterState } from "@tanstack/react-router";
import { useView } from "@/lib/notes-store";
import { useNativeAdDialogBlocked } from "@/lib/native-ad-ui";
import { useNativeAdFeed } from "@/lib/native-ads";

/** One feed across the application, not a new feed whenever the user returns
 * from editing a note or importing a PDF. Hide native overlays on other pages.
 */
export function NativeAdRuntime() {
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const view = useView();
  const blockingDialog = useNativeAdDialogBlocked();
  useNativeAdFeed(view, pathname !== "/" || blockingDialog);
  return null;
}
