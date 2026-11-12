#!/usr/bin/env python3
from pathlib import Path
from tempfile import TemporaryDirectory
from verify_android_instrumentation import verify

def transcript(count=2):
    out = []
    for i in range(count):
        out.extend([
            "INSTRUMENTATION_STATUS: class=app.lovable.supernotes.AndroidShellInstrumentedTest",
            f"INSTRUMENTATION_STATUS: test=case{i}",
            "INSTRUMENTATION_STATUS_CODE: 1",
            "INSTRUMENTATION_STATUS: class=app.lovable.supernotes.AndroidShellInstrumentedTest",
            f"INSTRUMENTATION_STATUS: test=case{i}",
            "INSTRUMENTATION_STATUS_CODE: 0",
        ])
    return "\n".join(out + [f"OK ({count} tests)", "INSTRUMENTATION_CODE: -1"]) + "\n"

with TemporaryDirectory() as tmp:
    target = Path(tmp)
    assert verify(transcript(), target) == 0
    assert list(target.rglob("*.xml"))
    assert verify("OK (0 tests)\nINSTRUMENTATION_CODE: -1", target) != 0
    assert verify(transcript().replace("INSTRUMENTATION_CODE: -1", ""), target) != 0
    assert verify(transcript().replace("OK (2 tests)", "OK (3 tests)"), target) != 0
    assert verify(transcript().replace("INSTRUMENTATION_STATUS_CODE: 0", "INSTRUMENTATION_STATUS_CODE: -2", 1), target) != 0
    assert verify(transcript() + "FAILURES!!!\n", target) != 0
# API 24 uses manual adb install of BOTH APKs. The app APK is not
# guaranteed to exist after only assembleDebugAndroidTest.
workflow = Path(".github/workflows/android-ocr-emulator.yml").read_text(encoding="utf-8")
runner = Path("scripts/run-android-emulator-tests.sh").read_text(encoding="utf-8")
assert "run: ./gradlew assembleDebug assembleDebugAndroidTest" in workflow
assert "test -s android/app/build/outputs/apk/debug/app-debug.apk" in runner
assert "test -s android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk" in runner
print("API 24 legacy instrumentation parser rejects missing, incomplete and failing test runs")
