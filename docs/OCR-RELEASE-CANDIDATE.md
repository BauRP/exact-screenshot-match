# Wave Notes — OCR release-candidate exit criteria

This document distinguishes a buildable test APK from an approved public release. Implementation estimates are NOT measured recognition accuracy.

## Confirmed by automated checks

- The GitHub APK workflow runs TypeScript, OCR safety and persistence tests before publishing the debug APK.
- Bundled Tesseract Russian/Kazakh and five ML Kit recognizers passed synthetic-image tests on Android 10/API 29 and Android 14/API 34 (22 tests per version at the latest confirmed matrix run).
- Android decoder tests cover JPEG, PNG, MediaStore content URIs, EXIF orientation, malformed input and downsampling. They do not simulate tapping the system picker.
- The new integrated logic test checks six recognizer-shaped results through merge, persistent storage, editor-navigation callback and reopening the SAME note without duplication.
- OCR language models are bundled; no runtime downloads should be needed. Native in-feed ads and PDF character formatting must remain unchanged.

## Physical Android acceptance — required before public release

| Check | User action | Pass criterion |
| --- | --- | --- |
| Offline first run | Install APK, turn off mobile data and Wi-Fi, then scan | OCR works without downloading models |
| Real camera | Photograph Russian and Kazakh text | Actual letters saved and editor opens |
| Gallery | Choose JPEG and PNG, including portrait | Correct orientation and readable saved note |
| Other languages | Scan Latin, Chinese, Japanese, Korean, Devanagari | No internet needed; useful readable text |
| Mixed-language photo | Auto scan several scripts | No major lost or duplicated sections |
| Restart | Save multiple OCR notes, force-close app, reopen | Notes persist and remain editable |
| Routing recovery | If editor fails, reopen saved note | Original saved note opens; no duplicates |
| Slow device | Large image, cancel picker, deny permission, retry | No hard freeze or partial note treated as complete |
| Upgrade | Back up important notes; upgrade test APK | Existing notes remain accessible |

## Release decision

- **Test APK:** may be shared after the current GitHub APK workflow succeeds.
- **Public/Play release:** not approved until on-device checks above have recorded results.

Automated test success alone cannot prove accuracy on real photos or reliability across physical devices. Do not increase completion percentages just because more tests were added.

## Faster, stricter CI

- The pinned model SHA hashes are verified before use; build jobs now reuse cached files and never download languages at application runtime. A corrupted cache entry is rejected and replaced atomically.
- Android/Gradle caches are reused across successful GitHub Actions runs, which can reduce repeated compilation time; actual speed depends on cache hits.
- Changes to OCR TypeScript, camera route, or note persistence now trigger the two-version Android emulator matrix, avoiding silently untested OCR changes.
- Every published debug APK logs its source commit and SHA-256 checksum in the workflow summary.

## Bundled model integrity

The APK contains pinned `rus` and `kaz` assets. On Android the first copy to app-private storage and all existing copies are checked against the exact build-pinned Git-blob content hash, not only the byte size. Corrupt copies are restored from the APK itself without an internet download. Android instrumentation includes same-size corruption tests on both supported emulator versions. This verifies Cyrillic model integrity, not recognition accuracy on real photos.

**User-consented incomplete results:** a partial multilingual OCR result is not saved automatically; the camera screen offers an explicit action to save available text with a persistent warning in its note. CI exercises the real storage and navigation handoff for the incomplete case.
**Native compressed JPEG:** all five bundled ML Kit text recognizers now have Android instrumented compressed-JPEG test cases (Latin, Korean, Chinese, Japanese and Devanagari). Offline emulators test model execution, not quality on physical camera photos.

**Same-photo manual retry:** after an incomplete or failed native scan, users may choose one model and reprocess the exact same local photo without reopening the camera or gallery. Cached file paths are validated against local-only URI rules; closing the scan page drops the retained path. A partial note includes an enduring explanation identifying which script models failed. Real-device picker persistence remains unverified.

## Resuming partial OCR on the same local photo

- A failed multi-script scan retains the recognized text in memory and tracks which script checks did not complete.
- A dedicated recovery action rechecks **only missing scripts in one image-preparation session**, while manual single-script retry remains available. This reduces unnecessary reprocessing, not model installation or network use.
- New results are merged conservatively with previously recognized lines; exact normalized duplicates are not appended. This does not guarantee correct page reading order or removal of visually similar OCR errors.
- A model removed from the missing list must finish successfully; a timed-out/failed model remains missing. Repeated attempts do not erase the earlier partial text.
- Once all missing scripts have completed, the combined multi-pass text still requires explicit user confirmation before saving, with a permanent note warning that line order may be wrong. A still-incomplete note also requires consent and identifies the missing scripts.
- The real notes store receives only one draft on user-confirmed save; navigation failures preserve the original saved note ID. CI covers these pure logic and storage flows.
- Physical Android picker, repeated scans and realistic multi-column documents remain necessary acceptance checks.

## Conservative recognition and review

- A completed recognizer can return **zero** characters. This is no longer treated as a failed model during same-photo recovery: the model's check is marked completed, earlier text stays available, and the user still confirms saving.
- Multi-pass duplicate removal respects occurrence counts; a second printed price or repeated heading must not disappear simply because an identical line was seen once before. The original line text is preserved, and distinct NFC glyphs are not conflated.
- When Chinese and Japanese models disagree on Han-only readings at an overlapping location (or positions are missing), automatic creation pauses for explicit user review. The same photo can be rerun with a chosen model; any saved note keeps a warning about possible character ambiguity. This is not a reliable automatic Chinese/Japanese language identification system.
- GitHub logic tests exercise empty passes, repeated lines, conflicting/nonconflicting Han examples and correct saved-note warning. Real camera images, low-light documents and physical-device constraints still need verification.
\n## Editable review before saving uncertain OCR\n\n- Ambiguous Han and partially recovered scans now offer an editable, scrollable review screen BEFORE any note is created. Users can fix Japanese/Chinese letters, spacing and line order in the retained text.\n- The complete draft is stored only after the user explicitly presses Save. Empty/whitespace-only drafts cannot be saved; back returns to the same photo and retry actions without creating duplicate notes.\n- Source language warnings are applied after user edits: missing scripts remain disclosed, and ambiguous Han retains its caution. The on-device OCR and other note/PDF/ads flows are unchanged.\n- Automated checks validate the warning-preserving draft builder and saved note contents. Actual touch/keyboard and physical-device behavior are not established by these tests.\n
## Preserve all offline language checks and expose ambiguous Han readings

- Automatic OCR continues to process all bundled scripts; it may reorder remaining checks after discovering distinctive Kana, Hangul or Devanagari. Han glyphs alone never determine whether text is Chinese or Japanese.
- Disagreeing Chinese/Japanese recognizers expose both unmodified readings in the review screen, while the complete merged text stays editable. Selecting an Asian script must not discard Cyrillic, Latin or other page content.
- Tesseract Russian/Kazakh output falls back to iterated native lines if its aggregate string is unexpectedly blank.
- ML Kit geometry can use four valid corner points for skewed or rotated lines when a bounding rectangle is absent.
- Add automated tests for priority, all-model coverage, rotated geometry, fallback and both Han readings. These tests do not demonstrate real-phone OCR accuracy.

## Separate bundled Cyrillic modes and low-memory imports

- Camera/gallery OCR offers separate Russian-only and Kazakh-only modes alongside combined Cyrillic. These call the preinstalled rus and kaz models, without downloading anything to the phone. Automatic scans and multi-script recovery retain the combined pinned kaz+rus model.
- Native Android decoder now checks the device low-RAM classification before allocating photo bitmaps. On low-RAM devices, it downsamples to at most roughly 6 megapixels and 3200 pixels maximum edge (instead of the ordinary 12 megapixels / 4500 pixels). Actual decoded dimensions depend on power-of-two sampling. Reduced memory pressure may come at the cost of fine-print accuracy.
- Automated logic tests cover language routing; emulator workflows compile and exercise the native decoder. Physical-device performance and recognition accuracy remain unverified.
