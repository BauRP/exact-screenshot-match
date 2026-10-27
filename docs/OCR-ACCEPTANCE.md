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
