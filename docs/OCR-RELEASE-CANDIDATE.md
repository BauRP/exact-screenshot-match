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
