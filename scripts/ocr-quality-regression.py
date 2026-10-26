#!/usr/bin/env python3
"""Reproducible, image-based OCR benchmark using EXACT bundled rus/kaz traineddata.

This tests desktop Tesseract on deterministic rendered images, NOT ML Kit,
native Android camera/gallery, or Android Tesseract4Android.
"""
import argparse
import io
import json
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# name, reference text, font size, photo simulation, maximum character error rate
CASES = [
    ("russian", "Привет мир\nЭто тест распознавания", 48, "clean", .10),
    ("kazakh", "Қазақ тілі\nСәлем әлем", 48, "clean", .10),
    ("russian_kazakh", "Привет мир\nСәлем әлем\nМосква 2026", 48, "clean", .10),
    ("kazakh_letters", "Әңгіме, ғарыш, қыран\nҮлкен өңір, ілім, һау", 48, "clean", .10),
    ("kazakh_prices", "Бағасы 2500 теңге\nКүні: 27.10.2026", 48, "clean", .10),
    ("mixed_paragraph", "Бүгін ауа райы жақсы.\nСегодня хорошая погода.\nБірнеше тілдегі мәтін.", 44, "clean", .12),
    ("receipt", "Шот № 7653\nБарлығы 48 250 теңге\nДата 21.10.2026", 44, "clean", .12),
    ("reduced_photo", "Бағасы 2500 теңге\nКүні: 27.10.2026", 48, "small", .16),
    ("rotated_photo", "Қазақ тілі\nСәлем әлем\nМосква 2026", 44, "rotated", .18),
    ("compressed_photo", "Әңгіме, ғарыш, қыран\nСегодня хорошая погода.", 48, "jpeg", .15),
    ("faded_photo", "Қазақ тілі\nСәлем әлем", 48, "faded", .15),
]

def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.casefold()).strip()

def character_error_rate(reference: str, recognized: str) -> float:
    """Unicode Levenshtein distance / expected characters, insensitive to spacing."""
    a, b = normalize(reference), normalize(recognized)
    row = list(range(len(b) + 1))
    for index, char in enumerate(a, 1):
        next_row = [index]
        for column, other in enumerate(b, 1):
            next_row.append(min(row[column] + 1, next_row[-1] + 1,
                                row[column - 1] + (char != other)))
        row = next_row
    return row[-1] / max(1, len(a))

def make_image(text: str, font: ImageFont.FreeTypeFont, kind: str) -> Image.Image:
    image = Image.new("RGB", (1450, 350), "white")
    ImageDraw.Draw(image).multiline_text((60, 55), text, font=font,
                                        fill="black", spacing=26)
    if kind == "small":
        image = image.resize((725, 175), Image.Resampling.LANCZOS)
    elif kind == "rotated":
        image = image.rotate(2, expand=True, fillcolor="white")
    elif kind == "jpeg":
        data = io.BytesIO()
        image.save(data, format="JPEG", quality=58)
        data.seek(0)
        image = Image.open(data).copy()
    elif kind == "faded":
        image = Image.blend(image, Image.new("RGB", image.size, "white"), .44)
    return image

def recognize(image_path: Path, tessdata: str, language: str) -> str:
    result = subprocess.run(
        ["tesseract", str(image_path), "stdout", "--tessdata-dir",
         tessdata, "-l", language, "--psm", "6"],
        capture_output=True, check=True, text=True, timeout=30,
    )
    return result.stdout.strip()

def run(tessdata: str, font_path: str, output_dir: str) -> None:
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    for name, expected, font_size, variant, threshold in CASES:
        font = ImageFont.truetype(font_path, font_size)
        image = make_image(expected, font, variant)
        image_path = output / f"{name}.png"
        image.save(image_path)
        recognized = recognize(image_path, tessdata, "kaz+rus")
        old_result = recognize(image_path, tessdata, "rus+kaz")
        error_rate = character_error_rate(expected, recognized)
        baseline_rate = character_error_rate(expected, old_result)
        passed = error_rate <= threshold
        rows.append({
            "case": name,
            "kind": variant,
            "reference": expected,
            "recognized": recognized,
            "cer": round(error_rate, 4),
            "baseline_rus_first_cer": round(baseline_rate, 4),
            "max_cer": threshold,
            "passed": passed,
        })
        print(f"{name}: kaz+rus CER={error_rate:.1%}, rus+kaz CER={baseline_rate:.1%}, "
              f"limit={threshold:.0%}, {'PASS' if passed else 'FAIL'}")
    mean = sum(row["cer"] for row in rows) / len(rows)
    baseline_mean = sum(row["baseline_rus_first_cer"] for row in rows) / len(rows)
    # Guard against silent regressions in the newly prioritized Kazakh mode.
    passed = all(row["passed"] for row in rows) and mean <= .06 and mean <= baseline_mean + .01
    report = {"model_order": "kaz+rus", "cases": len(rows),
              "mean_cer": round(mean, 4),
              "previous_order_mean_cer": round(baseline_mean, 4),
              "passed": passed, "results": rows}
    (output / "results.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    markdown = [
        "### Offline OCR image benchmark — desktop Tesseract only",
        "| Image case | kaz+rus CER | Previous rus+kaz CER | Limit | Result |",
        "|---|---:|---:|---:|---|",
    ]
    for row in rows:
        markdown.append(
            f"| {row['case']} | {row['cer']:.1%} | "
            f"{row['baseline_rus_first_cer']:.1%} | {row['max_cer']:.0%} | "
            f"{'PASS' if row['passed'] else 'FAIL'} |"
        )
    markdown.extend([
        f"**Mean CER:** {mean:.2%}, previously {baseline_mean:.2%}. "
        f"**Overall:** {'PASS' if passed else 'FAIL'}.",
        "Note: synthetic test photos and desktop OCR, not proof of real-device quality.",
    ])
    (output / "summary.md").write_text("\n".join(markdown), encoding="utf-8")
    print(f"Mean CER: {mean:.2%}; previous model order: {baseline_mean:.2%}")
    if not passed:
        raise SystemExit("Image-based offline OCR quality regression detected")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tessdata", required=True)
    parser.add_argument("--font", default="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    parser.add_argument("--out", default="ocr-quality-results")
    args = parser.parse_args()
    run(args.tessdata, args.font, args.out)
