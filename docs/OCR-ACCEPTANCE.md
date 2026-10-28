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
