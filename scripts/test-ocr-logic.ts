import { strict as assert } from "node:assert";
import { lineScore, mergeOcrCandidates, type OcrCandidate } from "../src/lib/ocr-merge";

const line = (text: string, script: OcrCandidate["script"], top: number) =>
  ({ text, script, left: .1, top, right: .85, bottom: top + .04 });

assert.ok(lineScore("こんにちは日本語", "japanese") > lineScore("こんにちは日本語", "chinese"));
assert.ok(lineScore("한국어 문장", "korean") > lineScore("한국어 문장", "latin"));
assert.ok(lineScore("Қазақ тілі", "cyrillic") > lineScore("Қазақ тілі", "latin"));
assert.equal(mergeOcrCandidates([]), "");
const russian: OcrCandidate = { script: "cyrillic", text: "Привет мир", lines: [line("Привет мир", "cyrillic", .1)] };
const korean: OcrCandidate = { script: "korean", text: "한국어 문장", lines: [line("한국어 문장", "korean", .3)] };
assert.equal(mergeOcrCandidates([russian, korean]), "Привет мир\n\n한국어 문장");
const duplicate: OcrCandidate = {script:"latin",text:"Hello",lines:[line("Hello","latin",.5)]};
assert.equal(mergeOcrCandidates([duplicate,duplicate]), "Hello");
const noFrames: OcrCandidate = {script:"latin",text:"Long full scanned English text",lines:[]};
assert.equal(mergeOcrCandidates([russian,noFrames]), "Long full scanned English text");
console.log("OCR selection/merge logic: assertions passed.");
