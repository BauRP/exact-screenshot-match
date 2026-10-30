#!/usr/bin/env bash
# Offline regression test for the SDK retry script. No Android tools needed.
set -Eeuo pipefail
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/bin" "$work/sdk"
cat >"$work/bin/sdkmanager" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
: "${WAVE_MOCK_COUNTER:?}"
count=0
if [[ -f "$WAVE_MOCK_COUNTER" ]]; then read -r count < "$WAVE_MOCK_COUNTER"; fi
count=$((count+1))
echo "$count" > "$WAVE_MOCK_COUNTER"
if (( count <= ${WAVE_MOCK_FAILS:-0} )); then
  echo "Error reading Zip content from a SeekableByteChannel" >&2
  exit 1
fi
# sdkmanager reports success without needing to start an emulator CLI.
exit 0
MOCK
chmod +x "$work/bin/sdkmanager"
export PATH="$work/bin:$PATH"
export ANDROID_SDK_ROOT="$work/sdk"
export WAVE_EMULATOR_SDK_RETRY_DELAY=0
export WAVE_MOCK_COUNTER="$work/counter"
export WAVE_MOCK_FAILS=0
rm -f "$WAVE_MOCK_COUNTER"
bash scripts/prepare-android-emulator.sh
[[ "$(cat "$WAVE_MOCK_COUNTER")" == "1" ]]
export WAVE_MOCK_FAILS=2
rm -f "$WAVE_MOCK_COUNTER"
mkdir -p "$work/sdk/.temp" "$work/sdk/.downloadIntermediates" "$work/sdk/emulator"
touch "$work/sdk/.temp/bad" "$work/sdk/.downloadIntermediates/bad" "$work/sdk/emulator/bad"
bash scripts/prepare-android-emulator.sh
[[ "$(cat "$WAVE_MOCK_COUNTER")" == "3" ]]
[[ ! -e "$work/sdk/.temp/bad" && ! -e "$work/sdk/emulator/bad" && ! -e "$work/sdk/.downloadIntermediates/bad" ]]
export WAVE_MOCK_FAILS=10
rm -f "$WAVE_MOCK_COUNTER"
if bash scripts/prepare-android-emulator.sh; then
  echo "Exhausted retries incorrectly marked green" >&2
  exit 1
fi
[[ "$(cat "$WAVE_MOCK_COUNTER")" == "4" ]]
echo "SDK retry regression: three scenarios passed"
