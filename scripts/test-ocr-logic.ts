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
const japanese: OcrCandidate = {script:"japanese",text:"こんにちは日本語",lines:[line("こんにちは日本語","japanese",.6)]};
const chinese: OcrCandidate = {script:"chinese",text:"中文测试文字",lines:[line("中文测试文字","chinese",.8)]};
assert.equal(mergeOcrCandidates([russian, korean, japanese, chinese]), "Привет мир\n\n한국어 문장\n\nこんにちは日本語\n\n中文测试文字");
const unlocatedNoise: OcrCandidate = {script:"latin",text:"abc",lines:[]};
assert.equal(mergeOcrCandidates([russian,korean,unlocatedNoise]), "Привет мир\n\n한국어 문장");
assert.equal(mergeOcrCandidates([japanese,japanese]), "こんにちは日本語");
const mixed: OcrCandidate[] = [
  { script:"cyrillic", text:"Қазақ тіліндегі мәтін", lines:[line("Қазақ тіліндегі мәтін","cyrillic",.1)] },
  { script:"latin", text:"English language", lines:[line("English language","latin",.24)] },
  { script:"japanese", text:"日本語の文章", lines:[line("日本語の文章","japanese",.38)] },
];
assert.equal(mergeOcrCandidates(mixed), "Қазақ тіліндегі мәтін\n\nEnglish language\n\n日本語の文章");
assert.equal(mergeOcrCandidates([{script:"cyrillic",text:"Тест",lines:[line("Тест","cyrillic",.1)]}]), "Тест");
console.log("OCR selection/merge logic: assertions passed.");
