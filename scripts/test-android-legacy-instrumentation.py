#!/usr/bin/env python3
from pathlib import Path
from tempfile import TemporaryDirectory
from scripts.verify_android_instrumentation import verify

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
print("API 24 legacy instrumentation parser rejects missing, incomplete and failing test runs")
