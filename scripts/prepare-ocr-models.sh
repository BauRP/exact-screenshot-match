#!/usr/bin/env bash
# Download only while BUILDING the APK; Wave Notes never downloads OCR models at runtime.
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
  curl --fail --location --retry 3 --connect-timeout 15 --max-time 180 --silent --show-error \
    "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/$REV/$language.traineddata" -o "$file"
  actual="$(git hash-object "$file")"
  if [ "$actual" != "$sha" ]; then
    echo "Error: bundled $language OCR model failed the pinned Git content check" >&2
    exit 1
  fi
  echo "Verified bundled $language OCR model: $(wc -c < "$file") bytes"
done
