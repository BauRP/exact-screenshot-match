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
