# Wave Notes premium startup — detailed timeline and performance contract

Reference: **Screen1**, specifically the animated segment *after* its static T. **Screen2** is the undesirable static-fade and stepped-light example. All motion is built directly into the Android WebView HTML (offline CSS/SVG); no external video service or downloadable clip is used.

| Second | Brand symbol | Lighting and transitions |
| --- | --- | --- |
| 0.00–0.40 | No static T, symbol starts hidden | Full-viewport light field reveals immediately and continuously. Overhead beam brightens, not top-to-bottom blocks. |
| 0.40–1.20 | Cool-white outline fades in; entire mark travels upward ~12 CSS px and scales from .925 toward 1 | Atmosphere fills **every edge** of the app viewport; small central halo starts to glow. No sweep or bar artifacts. |
| 1.20–1.90 | White symbol (including head) becomes solid; outline crossfades away; motion settles | Broad overhead illumination peaks softly and tapers, center remains brighter than edges. |
| 1.90–2.80 | **Tengrize Studio** then **WAVE NOTES** appear separately, each with subtle rise | Lighting is continuous: never a single flat fade of the entire composition. |
| 2.80–4.20 | Form and text remain crisp and stationary; head is approximately 9% wider than previous version | Full-screen atmospheric brightness changes slightly, no flashes. |
| 4.20–4.65 | Exit overlay in ~300ms, revealing the already mounting app | All light disappears together without a horizontal cut. |

Performance safeguards: main light layers are `position:absolute; inset:0`, with *fixed* gradients animated only via opacity. Small logo/halo transforms are permitted. Avoid animated blur/filter/clip paths/SVG dash strokes, raster video decoding, network requests. Android's system splash icon must remain transparent, not a frozen T. Reduced-motion preference displays the completed mark immediately while respecting the same exit timer. The inline script begins on the first WebView frame; a later React begin call is idempotent. Timing targets 4.6s *after the WebView becomes visible* and has a 5.2s hard watchdog; physical cold-start time before the WebView is system-dependent.

Acceptance: review actual slow-motion screen recordings for smooth, broad light; check absence of static T and stepped light, correct head size and text, and safe status-bar behavior. GitHub APK and the seven Android emulator test profiles must pass; **visual approval on a real device remains required**. Notes, PDF, OCR, camera and AdMob behavior must remain untouched.
