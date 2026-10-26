#!/usr/bin/env python3
"""Image-based smoke benchmark for the pinned offline Russian/Kazakh data.

This runs desktop Tesseract with the *same traineddata* bundled in the APK.
It does not test ML Kit, Android camera, or Android Tesseract4Android.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CASES = [
    ("russian", "Привет мир\nЭто тест распознавания", 0.10),
    ("kazakh", "Қазақ тілі\nСәлем әлем", 0.12),
    ("mixed-cyrillic", "Привет мир\nСәлем әлем\nМосква 2026", 0.25),
]

def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.casefold()).strip()

def cer(reference: str, actual: str) -> float:
    """Unicode character error rate (Levenshtein distance / expected length)."""
    a, b = normalize(reference), normalize(actual)
    previous = list(range(len(b) + 1))
    for row, letter in enumerate(a, 1):
        current = [row] + [0] * len(b)
        for column, target in enumerate(b, 1):
            current[column] = min(previous[column] + 1, current[column - 1] + 1,
                                  previous[column - 1] + (letter != target))
        previous = current
    return previous[-1] / max(1, len(a))

def run(tessdata: str, font_path: str, output_dir: str) -> None:
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype(font_path, 48)
    rows = []
    for name, expected, threshold in CASES:
        image = Image.new("RGB", (1400, 350), "white")
        ImageDraw.Draw(image).multiline_text((60, 60), expected, font=font,
                                             fill="black", spacing=28)
        image_path = output / f"{name}.png"
        image.save(image_path)
        command = ["tesseract", str(image_path), "stdout"]
        if tessdata:
            command += ["--tessdata-dir", tessdata]
        command += ["-l", "rus+kaz", "--psm", "6"]
        result = subprocess.run(command, capture_output=True, text=True,
                                timeout=30, check=True)
        score = cer(expected, result.stdout)
        rows.append({"case": name, "expected": expected,
                     "recognized": result.stdout.strip(),
                     "cer": round(score, 4), "max_cer": threshold,
                     "passed": score <= threshold})
    (output / "results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2),
                                         encoding="utf-8")
    for row in rows:
        print(f"{row['case']}: CER={row['cer']:.1%}, limit={row['max_cer']:.1%}, "
              f"{'PASS' if row['passed'] else 'FAIL'}: {row['recognized']!r}")
    if not all(row["passed"] for row in rows):
        raise SystemExit("Image-based offline OCR quality regression detected")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tessdata", required=True)
    parser.add_argument("--font", default="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    parser.add_argument("--out", default="ocr-quality-results")
    args = parser.parse_args()
    run(args.tessdata, args.font, args.out)
