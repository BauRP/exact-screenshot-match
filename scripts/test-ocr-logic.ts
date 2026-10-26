import { strict as assert } from "node:assert";
import { ocrTextToEditorHtml } from "../src/lib/ocr-note";
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
// Important single-symbol, numeric and receipt lines must survive selection.
const receiptNumbers: OcrCandidate = {
  script: "latin", text: "2026\n1590\n7", lines: [
    line("2026", "latin", .10),
    line("1590", "latin", .22),
    line("7", "latin", .34),
  ],
};
assert.equal(mergeOcrCandidates([receiptNumbers]), "2026\n\n1590\n\n7");
const singleHan: OcrCandidate = { script: "chinese", text: "年", lines: [line("年", "chinese", .15)] };
assert.equal(mergeOcrCandidates([singleHan]), "年");
assert.ok(lineScore("7", "latin") > 20);
assert.ok(lineScore("年", "chinese") > 20);
assert.ok(lineScore("▒", "latin") < 0);
assert.equal(ocrTextToEditorHtml("Привет\nҚазақша\n日本語"), "<p>Привет</p><p>Қазақша</p><p>日本語</p>");
assert.equal(ocrTextToEditorHtml("A < B & C > D"), "<p>A &lt; B &amp; C &gt; D</p>");
assert.equal(ocrTextToEditorHtml("<img src=x onerror=alert(1)>"), "<p>&lt;img src=x onerror=alert(1)&gt;</p>");
assert.equal(ocrTextToEditorHtml("first\n\nsecond"), "<p>first</p><p><br></p><p>second</p>");
assert.equal(ocrTextToEditorHtml("x\r\ny"), "<p>x</p><p>y</p>");
assert.equal(ocrTextToEditorHtml("a  b"), "<p>a&nbsp;&nbsp;b</p>");
console.log("OCR selection/merge and safe note persistence: assertions passed.");
