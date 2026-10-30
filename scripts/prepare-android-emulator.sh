#!/usr/bin/env bash
# Retry SDK ZIP downloads only. Emulator Runner performs actual boot validation.
# This file runs on ephemeral GitHub Actions runners, not in Wave Notes APK.
set -Eeuo pipefail
sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [[ -z "$sdk_root" || ! -d "$sdk_root" ]]; then
  echo "::error::Android SDK root missing"; exit 1
fi
command -v sdkmanager >/dev/null 2>&1 || {
  echo "::error::sdkmanager not found"; exit 1
}
max_attempts=4
retry_delay="${WAVE_EMULATOR_SDK_RETRY_DELAY:-7}"
for ((attempt=1; attempt<=max_attempts; attempt++)); do
  echo "Installing emulator SDK package: attempt $attempt/$max_attempts"
  # An SDK download is successful when sdkmanager exits zero.
  # Do NOT require running 'emulator -version' here before AVD configuration;
  # it produced seven false negatives in the previous workflow.
  if sdkmanager --install emulator --channel=0; then
    echo "Android Emulator SDK download completed; emulator-runner will validate device boot"
    if [[ ! -f "$sdk_root/emulator/emulator" ]]; then
      echo "::notice::Emulator executable is not visible yet; deferring definitive verification to emulator-runner"
    fi
    exit 0
  fi
  echo "::warning::SDK archive download or installation failed on attempt $attempt"
  if ((attempt == max_attempts)); then
    echo "::error::Emulator SDK download failed after $max_attempts attempts; no app tests were run"
    exit 1
  fi
  # Only erase partial SDK packages on the disposable CI runner after failure.
  for partial in "$sdk_root/.temp" "$sdk_root/.downloadIntermediates" "$sdk_root/emulator"; do
    [[ ! -d "$partial" ]] || rm -rf -- "$partial"
  done
  sleep "$((attempt * retry_delay))"
done
