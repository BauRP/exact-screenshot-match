#!/usr/bin/env bash
# Models are downloaded only on the CI/build host, NEVER by the Android app.
# SHA-pinned verified copies may be reused: no unnecessary network traffic.
set -euo pipefail
REV=87416418657359cb625c412a48b6e1d6d41c29bd
DEST=android-overlay/app/src/main/assets/tessdata
mkdir -p "$DEST"
for language in rus kaz; do
  case "$language" in
    rus) sha=b146cb2263acbc6383f8e92ea0ce759537687bb8 ;;
    kaz) sha=f889e2b8ffd093d4f2dff8ffca2fa0b73296c028 ;;
  esac
  file="$DEST/$language.traineddata"
  # Both a repo checkout and a CI restored cache are untrusted until hashed.
  if test -s "$file" && test "$(git hash-object "$file")" = "$sha"; then
    echo "Reused verified bundled $language OCR model: $(wc -c < "$file") bytes"
    continue
  fi
  tmp="$(mktemp "$DEST/$language.traineddata.XXXXXXXX")"
  if ! curl --fail --location --retry 3 --connect-timeout 15 --max-time 180 --silent --show-error \
      "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/$REV/$language.traineddata" -o "$tmp"; then
    rm -f "$tmp"
    echo "Error: could not fetch pinned $language build-time OCR model" >&2
    exit 1
  fi
  actual="$(git hash-object "$tmp")"
  if test "$actual" != "$sha"; then
    rm -f "$tmp"
    echo "Error: bundled $language OCR model failed the pinned Git content check" >&2
    exit 1
  fi
  mv -f "$tmp" "$file"
  echo "Verified bundled $language OCR model: $(wc -c < "$file") bytes"
done
