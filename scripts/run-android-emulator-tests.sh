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
echo WAVE_DEVICE_PROPERTIES
adb shell getprop ro.build.version.release || true
adb shell getprop ro.build.version.sdk || true
adb shell getprop ro.product.cpu.abi || true
adb shell dumpsys package com.google.android.webview 2>/dev/null | grep -m 1 versionName || true

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

# The Android 7 (API 24) emulator repeatedly failed BEFORE executing
# tests: AGP's Ddmlib SplitApkInstaller timed out on install-write while 6
# other emulator versions passed. Use a normal local adb install and real
# AndroidJUnitRunner instrumentation rather than marking the job green.
# Gradle still assembles both APKs before this emulator script is called.
if [[ "$api" == "24" ]]; then
  echo WAVE_API24_LEGACY_INSTALL_BEGIN
  test -s android/app/build/outputs/apk/debug/app-debug.apk
  test -s android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
  # --no-streaming uses the older push+PackageManager installation path.
  adb install --no-streaming -r -t android/app/build/outputs/apk/debug/app-debug.apk
  adb install --no-streaming -r -t android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
  if ! adb shell pm list packages app.lovable.supernotes.test | tr -d '\r' | grep -q '^package:app.lovable.supernotes.test$'; then
    echo "::error::Android 7 test package was not installed"
    exit 1
  fi
  echo WAVE_API24_REAL_INSTRUMENTATION_BEGIN
  legacy_output="android-test-diagnostics/instrumentation-api24.txt"
  set +e
  adb shell am instrument -w -r app.lovable.supernotes.test/androidx.test.runner.AndroidJUnitRunner >"$legacy_output" 2>&1
  runner_result=$?
  set -e
  cat "$legacy_output"
  set +e
  python3 scripts/verify_android_instrumentation.py "$legacy_output" android/app/build/outputs/androidTest-results/legacy-api24
  result=$?
  set -e
  if (( runner_result != 0 )); then
    echo "Android 7 instrumentation command failed: $runner_result"
    result=1
  fi
else
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
fi
stop_logger
trap - EXIT

if (( result != 0 )); then
  echo "WAVE_ANDROID_FAILURE_DIAGNOSTICS status=${result} api=${api}"
  echo "--- Emulator connectivity at failure ---"
  adb devices -l || true
  ps -ef | grep -E '[e]mulator|[q]emu-system' | tail -n 16 || true
  echo "--- Final logcat messages (even if emulator died before shutdown) ---"
  tail -n 125 "$logfile" || true
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
