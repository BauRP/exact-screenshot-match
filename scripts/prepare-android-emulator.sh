#!/usr/bin/env bash
# This runs only in a disposable GitHub Actions VM; not in the Wave Notes APK.
set -Eeuo pipefail
sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [[ -z "$sdk_root" || ! -d "$sdk_root" ]]; then
  echo "::error::Android SDK root is unavailable"; exit 1
fi
command -v sdkmanager >/dev/null || {
  echo "::error::sdkmanager is missing"; exit 1
}
for ((attempt=1; attempt<=4; attempt++)); do
  echo "Installing Android emulator SDK package, attempt $attempt/4"
  if sdkmanager --install emulator --channel=0; then
    if [[ -x "$sdk_root/emulator/emulator" ]] &&
       "$sdk_root/emulator/emulator" -version >/dev/null 2>&1; then
      echo "Verified Android Emulator executable"; exit 0
    fi
    echo "::warning::SDK downloaded but emulator executable cannot run"
  else
    echo "::warning::Android Emulator SDK download failed (attempt $attempt)"
  fi
  if ((attempt==4)); then
    echo "::error::Unable to verify Android Emulator SDK. No app tests were run."; exit 1
  fi
  # A partially downloaded ZIP can corrupt the next SDK installation attempt.
  [[ ! -d "$sdk_root/.temp" ]] || rm -rf -- "$sdk_root/.temp"
  if [[ -d "$sdk_root/emulator" ]]; then
    if [[ ! -x "$sdk_root/emulator/emulator" ]] ||
       ! "$sdk_root/emulator/emulator" -version >/dev/null 2>&1; then
      rm -rf -- "$sdk_root/emulator"
    fi
  fi
  sleep $((attempt * 7))
done
