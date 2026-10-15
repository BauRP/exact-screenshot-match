<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

Native in-feed ads share `noteCardShell(view)` with note cards and pass the active view mode to the Android overlay plugin; this keeps slot geometry and native content synchronized without reloading ads when the view changes.
- Only in-feed native ads exist (no banner); they render in the app-local NativeAdPlugin overlay on android.R.id.content, and the plugin reports the real status-bar inset so the web frame starts below it. Why: WebView-parent overlays and env() insets were unreliable edge-to-edge.
- PDF text overlays store per-character styling as `runs`; toolbar actions apply only to the selection or next typed text. Why: formatting must never alter unselected text.
