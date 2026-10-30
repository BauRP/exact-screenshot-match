#!/usr/bin/env bash
# Keep the entire Gradle invocation and error handling in ONE shell process.
# reactivecircus/android-emulator-runner executes workflow 'script' lines
# separately, so multiline 'if' and saved '$?' do not work directly in YAML.
set -Eeuo pipefail

api="${1:?Missing Android API level}"
screen="${2:?Missing screen size}"
density="${3:?Missing screen density}"

echo "WAVE_API_${api}_BEGIN"
adb shell getprop ro.build.version.sdk
adb shell wm size "$screen"
adb shell wm density "$density"
echo WAVE_DISPLAY_PROFILE
adb shell wm size
adb shell wm density

# Stream diagnostics BEFORE launching the instrumentation test, since some
# problematic Android emulators can disconnect before post-failure adb calls.
mkdir -p android-test-diagnostics
logfile="android-test-diagnostics/logcat-api-${api}-${screen}.log"
adb logcat -c >/dev/null 2>&1 || true
adb logcat -v threadtime >"$logfile" 2>&1 &
logger_pid=$!
stop_logger() {
  if kill -0 "$logger_pid" 2>/dev/null; then
    kill "$logger_pid" 2>/dev/null || true
  fi
  wait "$logger_pid" 2>/dev/null || true
}
trap stop_logger EXIT

echo WAVE_GRADLE_BEGIN
set +e
(
  cd android
  test -x ./gradlew &&
    ./gradlew :app:connectedDebugAndroidTest \
      --no-daemon --no-parallel --max-workers=2 \
      -Dorg.gradle.jvmargs="-Xmx1536m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8" \
      --stacktrace
)
result=$?
set -e
stop_logger
trap - EXIT

if (( result != 0 )); then
  echo "WAVE_ANDROID_FAILURE_DIAGNOSTICS status=${result} api=${api}"
  echo "--- Android crash and WebView evidence (captured before emulator shutdown) ---"
  grep -aE -A 16 -B 4 \
    'FATAL EXCEPTION|AndroidRuntime|Process: app.lovable.supernotes|AssertionError|Unable to start activity|Caused by: java|WAVE_LAYOUT|WebView|INSTRUMENTATION_STATUS|am_crash' \
    "$logfile" | tail -n 260 || true
  echo "--- Android instrumentation JUnit failure details ---"
  python3 - <<'PY'
from pathlib import Path
from xml.etree import ElementTree

root = Path("android/app/build/outputs/androidTest-results")
files = sorted(root.rglob("*.xml")) if root.exists() else []
print(f"instrumentation_xml_count={len(files)}")
for file in files:
    try:
        tree = ElementTree.parse(file)
    except (OSError, ElementTree.ParseError) as exc:
        print(f"unreadable_xml={file}: {exc}")
        continue
    for case in tree.iter("testcase"):
        for tag in ("failure", "error"):
            for item in case.findall(tag):
                print(f"FAILED_TEST {case.get('classname')}#{case.get('name')}: {item.get('message')}")
                print((item.text or "")[:9000])
if not files:
    print("No XML results: inspect captured Android logcat for device disconnection.")
PY
fi

# Never turn real test errors into success. In particular, API 36 failed its
# first UI test in the previous run and must remain red until diagnosed.
exit "$result"
