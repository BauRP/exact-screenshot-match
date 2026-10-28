# OCR acceptance and evidence

Two independent numbers are tracked in reports:

- **Implementation estimate** is a qualitative engineering assessment. It is not a measured percentage of correct recognition or devices supported.
- **Confirmed checks** are pass/fail assertions from a completed GitHub Actions run. A queued/running/cancelled run is not counted as passed.

| Direction | Automated evidence | Remaining real-world verification |
| --- | --- | --- |
| Bundled language models | APK contains rus/kaz traineddata; pinned Git blob hashes | Verify full offline installation on physical devices |
| Offline operation | Tesseract runs on emulator after Wi-Fi/data are disabled | Independently exercise full camera-to-note workflow without network |
| Camera / gallery | Local URI admission tests, Android project compiled | Real camera and gallery selection on various devices |
| Russian / Kazakh OCR | 11 Tesseract fixture images; native Android OCR tests | Real photographs and handwriting/low-light |
| Chinese / Japanese / Korean / Devanagari | Script selection/merge logic and 5 native ML Kit recognizer smoke tests | Real photos and document-level accuracy on Android |
| Automatic language detection | Six model scan-order assertions and script-score checks | Real mixed-script photos with quality metrics |
| Line merging | Anchors, columns, missing geometry, duplicates tests | Document-level mixed-language comparisons |
| Note saving | Real notes-store serialization, HTML escaping, failed storage writes | App navigation, editor open and restart on Android |
| Stability | Session gate, timeout budget/deadline, malformed coordinates | Long-run stress and low-memory phones |
| Android verification | Instrumentation tests on API 34 emulator | More Android API levels and physical devices |

Never report a simulated fixture's 0% CER as zero errors on actual camera photographs.

ML Kit five-script tests run on the Android emulator with network radios disabled. The Android app build.gradle explicitly uses `com.google.mlkit:text-recognition*` bundled model artifacts, not `play-services-mlkit-*` downloadable models. Tests do not establish document-level accuracy.

**Partial-result safety:** In automatic mode, a failed script recognizer now blocks note creation instead of silently saving the other recognizers' text. The user is asked to retry in manual language mode. This does not prove the missing text can be recovered automatically.

**Android image decoder:** Instrumented tests exercise the real `OfflineCyrillicOcrPlugin.loadBitmap` path for absolute JPEG paths, file:// JPEG URIs, EXIF rotation and corrupt input. These checks cannot replace camera/gallery picker tests on physical phones.

**Gallery content URI:** an Android emulator test now creates an app-owned JPEG through `MediaStore`, reads it via its `content://` URI with the real native OCR image decoder, and cleans the fixture up. This verifies image decode, not Android's interactive picker UI.
**Editor text fidelity:** OCR note tests preserve leading/trailing spaces and tabs and use grapheme-aware truncation for titles when available.

**Native image decoding regression:** Test the actual Android decoding helper with a
real Instrumentation Context (not an uninitialized Capacitor Plugin), verify
MediaStore content:// URI, local JPEG and PNG, EXIF orientation, invalid URLs,
corrupt images, and bounded downsampling of a 4800px photo. These still do
not exercise the interactive picker or real camera hardware.

**Budget launch safety:** the remaining OCR deadline is checked before starting each native recognizer. An expired budget launches no new model and leaves no untracked native task. Verified by automated logic tests.
**Compressed JPEG-to-text:** an Android instrumented test now creates a real JPEG, decodes it through the production decoder and runs the bundled Russian/Kazakh Tesseract recognizer. It does not yet test the photo picker, editor UI, or real photos.

**Cold restart and safe recovery:** CI now loads a real previously persisted multilingual OCR note through the actual notes-store, creates another note without overwriting it, and verifies that corrupt preexisting storage rejects writes without touching its original bytes. This remains a simulated WebView store rather than a physical-device reinstall.

**Compressed native images:** Android instruments actual JPEG->native decoder->ML Kit Latin/Korean pipelines, alongside JPEG->native decoder->Tesseract Russian/Kazakh. Further EXIF 270° and front-image mirror orientation smoke tests supplement the 90° rotation test.
**Sizable notes:** An isolated CI test saves 25 sizable mixed-language OCR documents into the real notes-store and verifies all persisted IDs and bodies. This test does not guarantee a physical WebView's available quota.

**Overlapping multilingual lines:** Deduplication now prefers a longer whole-line result when it contains a recognized whole-word fragment in the same image region. It must not merge separate columns or rows; these cases have dedicated regression tests.

**OCR-to-editor handoff:** dedicated CI tests run the real notes-store when saving recognized multi-script text and only then call the editor navigation callback. A failed save never navigates. If navigation fails after a successful save, the user is told to open the existing note; the stored record is never rolled back or silently duplicated. Android UI navigation itself still needs an interactive integration test.

**Recover saved note after editor routing failure:** camera UI now offers a direct 'Открыть сохранённую заметку' action using its original persisted note ID. A retry never calls `createNote`, and a deleted/missing note gives a clear warning. CI verifies retries do not create duplicate OCR notes. This is not a full end-to-end Android UI test.

**Missing-geometry third script:** when two or more languages have reliable coordinates but a third model recognizes a substantial, strongly script-matching paragraph without boxes, retain it once after the spatially confirmed text. Skip ambiguous Han-only Chinese/Japanese overlap and short or noisy fragments. Its true position on the photo is unknown; real mixed-language photo validation is still required.
**Deterministic OCR merge matrix:** CI now checks 60+ script order and overlapping-line scenarios. These are logic assertions, not recognition accuracy measurements.

**All models without geometry:** when every recognizer returns text without boxes, retain strong independent alphabet-specific paragraphs rather than selecting only one language. Reject short low-confidence noise, repeated content and ambiguous Han-only Chinese/Japanese pairs. Exact visual reading order remains unknown and must be validated with real photographs.

**2026-10-28 continuation safeguards:** The full Android/APK and offline emulator matrix must pass after the changes below. A completed recognizer that returns blank text is distinct from a crash. Recovery preserves repeated lines by occurrence count. Competing Han-only Chinese/Japanese OCR readings are not silently auto-saved; the user must review and explicitly save the ambiguous result. These logic safeguards do not measure real-world OCR accuracy.


**Mixed-language layout safety (2026-10-29):** When two credible, independent scripts have unlocated OCR lines, the combined document now requires explicit review before saving instead of silently claiming correct paragraph/column order. Tests exclude single-script, hallucinated low-quality results, fully located pages, and ambiguous Han-only Chinese/Japanese readings handled separately. Reviewer edits must survive closing and reopening the dialog. These safeguards do not measure OCR accuracy on real photos.

**2026-10-29 unsaved OCR text safety:** An unsaved multilingual OCR result can now be stored in a separate versioned, bounded local WebView draft with corrections, missing-script status and warning type. It contains no photo, camera URI, native bitmap or network location. On startup the route can recover this text for explicit review. The draft expires after 7 days and is removed after saving a real note or explicit discard. A full/quota-denied WebView store never aborts recognition. CI tests corrupt/expired/oversized drafts and confirms it never creates a saved note automatically. Physical Android app lifecycle behaviour still needs testing.

**Multi-column ordering (2026-10-29):** Spatial fusion detects two columns only with at least two distinct rows per column, a measurable horizontal gap, and overlapping vertical coverage; reading order is column-by-column. Full-width/overlapping text disables inference. Regression tests assert deterministic output under reversed recognizer input and preserve ordinary row order for short documents. Physical documents with irregular tables, more than two columns, or spanning headings still require manual review.

**Custom multi-script selection:** The scan screen now permits any nonempty user-selected subset of the six bundled recognizers, without a cloud dependency. It retains a stable scan order and refuses empty/unknown/duplicate plans. Both the full automatic mode and single-script mode are preserved. Multiscript manual scans still require review for conflicting Chinese/Japanese or insufficient mixed-script geometry. Android instrumentation checks the two Russian/Kazakh models can initialize independently with the APK-bundled files. UI interaction and physical-device accuracy require separate verification.

**Picker cancellation safety:** The local OCR review draft is not cleared merely because a picker starts or an image selection fails. Only successful note persistence or explicit draft discard clears its recovery record; tests cover the complete action matrix. An existing note ID is preserved if editor navigation fails.

**2026-10-29 durable OCR recovery:** Partial/uncertain OCR results are synchronously checkpointed as soon as they become available (before UI scheduling), and review typing synchronizes to a mutable current-text reference for blur/close. A lifecycle gate prevents delayed autosave timers from recreating an already saved/discarded draft. A note is still created only after explicit confirmation; unfinished review text stays local. CI now checks post-save autosave races. Physical process-kill and touch-keyboard cases remain acceptance tests.

**OCR completion truthfulness and text integrity:** For manually selected *subsets* of script models, finished recognition now goes through the review dialog with a persistent note warning that other models were intentionally not checked. They are not labelled failed. The six-model automatic scan remains the exhaustive option. When a native recognizer returns conflicting textual content between its complete string and iterated lines, recognition preserves its existing best text and requests explicit review instead of silently certifying the result; whitespace-only differences and a truly longer superset do not produce false warnings. Both warning reasons are versioned for offline draft recovery. Tests cover Japanese, Kazakh, false positives and saved notes. Actual model accuracy is still not measured on physical photos.

**Retry and UI regression:** The previous CI run failed because a five-character Japanese text mismatch was wrongly ignored by the native line/full-text discrepancy guard; the guard now includes three-to-five-character meaningful differences with regression cases for Japanese and short noise. A same-photo OCR retry begins with the user's edited text rather than overwriting it with stale raw OCR, and a blank reviewed draft blocks retry. Navigation errors after successfully persisting a note clear the pending OCR draft even if the camera route has unmounted. Camera OCR controls now scroll on short/foldable screens when multiple languages are selected. These changes are subject to build and Android acceptance.

**Large OCR page safety:** Spatial line fusion has a conservative 350-line budget because candidate overlap resolution otherwise performs quadratic comparisons and can stall WebView. When this threshold is exceeded, the application keeps distinct full native readings from recognized scripts without costly geometry fusion, marks their order/duplication uncertain, and asks for explicit user review. The partial-results path uses the same bounded merge, avoiding another freeze on a model timeout. Offline draft recovery understands the additional warning type. Deterministic tests cover the limit, mixed Cyrillic/Japanese content and duplicate model outputs. No physical-device speedup measurement is claimed.

**Native text differences visible during review:** If the ML Kit aggregate text disagrees with its own line iterator, the review dialog shows both original readings as separate 2000-character Unicode-safe excerpts. It never replaces text from other languages automatically. These excerpts are stored only in the bounded local pending OCR draft, validated and restored after an app restart. No image data or external transmission is added. TypeScript and pure tests cover alternate glyphs, truncation and malformed data.

**Long OCR draft recovery / autosave races (2026-10-29):** The serialized draft size bound now accounts for both 100,000-character editable/scanned fields and up to six 2,000-codepoint pairs of native comparison excerpts. Cold restart validation still checks every field and retains strict per-field limits. A generation-token write gate stops delayed auto-save callbacks from an earlier scan writing into a newer scan, even after the gate has been rearmed; regression tests cover both. No image data or remote service is added. Physical process-kill remains unverified.

**OCR storage failures and backgrounding (2026-10-29):** A completely recognized photo no longer loses its text if the local notes store rejects saving. The exact text becomes an explicit, retryable local draft and the user can save it again without rerunning any language model; it is not falsely labelled as an incomplete OCR result. If the independent backup draft write fails because local storage is unavailable or full, the UI warns that the draft may not survive a restart. Active text corrections are flushed on WebView `visibilitychange`/`pagehide`, not just after the 350ms typing debounce. Previously chosen script combinations persist locally with strict validation, while a fresh installation still defaults to all-script automatic mode. Pure tests cover exact save retry, cold draft recovery, corrupt model preferences, and deterministic model order. Real Android process-kill tests remain pending.

**Persistent Chinese/Japanese alternatives (2026-10-29):** Both conflicting Han recognizer readings are now preserved as individually bounded 2000-codepoint previews in the offline review draft. Restarting the app restores both side-by-side readings with the full editable merged text, rather than leaving the ambiguity warning without the comparison. Strict save/read validation rejects malformed or oversized alternatives and prevents unbounded WebView storage. Unicode regression tests cover Han glyphs, trimming, persistence and corruption. This does not claim recognition accuracy without real-camera validation.

**Native OCR scalability:** When the user requests only Russian or Kazakh, the first scan extracts/verifies only that selected APK-bundled Tesseract model, whereas combined Cyrillic scans still verify both. Native textline geometry is limited to 350 valid rectangles; on truncation the complete native text is preserved and flagged for manual review rather than silently treated as a correctly ordered document. Unit and Android instrumentation tests cover selected model routing, corrupt boxes, and truncation. No downloads or external APIs are involved; speed changes still require physical testing.
