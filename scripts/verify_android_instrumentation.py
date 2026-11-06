#!/usr/bin/env python3
"""Verify real AndroidJUnitRunner output and emit conservative JUnit results.

Only used for API 24's adb --no-streaming install workaround. A booted
emulator, an 'OK' string without recorded tests, or an instrumentation error
must NEVER count as test success.
"""
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET


def verify(output: str, destination: Path) -> int:
    count_match = re.search(r"(?m)^\s*OK\s+\((\d+)\s+tests?\)", output)
    total = int(count_match.group(1)) if count_match else 0
    if total <= 0 or not re.search(r"(?m)^INSTRUMENTATION_CODE:\s*-1\s*$", output):
        print("WAVE_INSTRUMENTATION_FAILURE: missing completed, nonempty AndroidJUnitRunner run")
        return 1
    if "FAILURES!!!" in output or "INSTRUMENTATION_FAILED" in output:
        print("WAVE_INSTRUMENTATION_FAILURE: Android instrumentation reported failures")
        return 1
    current_class = ""
    current_test = ""
    completed = {}
    failed = False
    for line in output.splitlines():
        if line.startswith("INSTRUMENTATION_STATUS: class="):
            current_class = line.partition("=")[2].strip()
        elif line.startswith("INSTRUMENTATION_STATUS: test="):
            current_test = line.partition("=")[2].strip()
        elif line.startswith("INSTRUMENTATION_STATUS_CODE:"):
            try:
                status = int(line.rsplit(":", 1)[1].strip())
            except ValueError:
                failed = True
                continue
            if status in (0, -1, -2):
                if not current_class or not current_test:
                    failed = True
                else:
                    completed[(current_class, current_test)] = status
                if status != 0:
                    failed = True
    # The suite summary and actual test statuses must agree; no synthetic
    # successes are created to reach the expected count.
    if failed or len(completed) != total:
        print(f"WAVE_INSTRUMENTATION_FAILURE: summary={total}, individual_results={len(completed)}, failures={failed}")
        return 1
    destination.mkdir(parents=True, exist_ok=True)
    suite = ET.Element("testsuite", {
        "name": "API24LegacyAndroidJUnitRunner",
        "tests": str(total), "failures": "0", "errors": "0", "skipped": "0",
    })
    for (cls, test), _ in sorted(completed.items()):
        ET.SubElement(suite, "testcase", {"classname": cls, "name": test})
    ET.ElementTree(suite).write(destination / "TEST-api24-legacy.xml", encoding="utf-8", xml_declaration=True)
    print(f"WAVE_API24_INSTRUMENTATION_PASS: {total} actual tests completed, 0 failures")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: verify-android-instrumentation.py raw-output-file junit-output-directory")
    raise SystemExit(verify(Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace"), Path(sys.argv[2])))
