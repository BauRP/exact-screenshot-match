import { strict as assert } from "node:assert";
import { ocrTextToEditorHtml, buildOcrNoteDraft, truncateOcrTitle } from "../src/lib/ocr-note";
import { composeRecognizedText } from "../src/lib/ocr-text";
import { ocrScanPlan, CYRILLIC_OCR_LANGUAGES } from "../src/lib/ocr-plan";
import { linesFromMlKit } from "../src/lib/ocr-geometry";
import { OcrSessionGate } from "../src/lib/ocr-session";
import { OcrScanCoverage } from "../src/lib/ocr-coverage";
import { OcrTimeBudget, withOcrDeadline, startOcrWithinBudget } from "../src/lib/ocr-budget";
import { isLocalOcrImagePath } from "../src/lib/ocr-input";
import { isCameraCancellation, readableOcrFailure } from "../src/lib/ocr-errors";
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
assert.equal(mergeOcrCandidates([russian,noFrames]), "Привет мир\n\nLong full scanned English text");
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
const mlkitPixels = linesFromMlKit({
  blocks: [{ lines: [
    {text:"Қазақша", recognizedLanguage:"kk", boundingBox:{left:100,top:50,right:800,bottom:130}},
    {text:"日本語", recognizedLanguage:"ja", boundingBox:{left:100,top:250,right:600,bottom:330}},
  ]}],
}, "latin", 1000, 1000);
assert.equal(mlkitPixels.length, 2);
assert.equal(mlkitPixels[0].left, 0.1);
assert.equal(mlkitPixels[0].right, 0.8);
assert.equal(mlkitPixels[0].language, "kk");
assert.equal(mlkitPixels[1].top, 0.25);
assert.equal(linesFromMlKit({blocks:[{lines:[{text:"Bad",boundingBox:{left:Infinity,top:1,right:200,bottom:50}}]}]},"latin",1000,1000).length,0);
assert.equal(linesFromMlKit({blocks:[{lines:[{text:"Bad",boundingBox:{left:10,top:10,right:0,bottom:0}}]}]},"latin",1000,1000).length,0);
assert.equal(linesFromMlKit({blocks:[]},"latin",0,1000).length,0);
assert.ok(lineScore("Привет", "latin") < 0);
assert.ok(lineScore("Hello", "chinese") < 0);
assert.ok(lineScore("日本語の文章", "japanese", "ja") > lineScore("日本語の文章", "chinese"));
assert.ok(lineScore("ქართული", "cyrillic") < 0);
assert.ok(lineScore("A", "latin") > 20);
const wrongAlphabet: OcrCandidate = {script:"japanese",text:"Prive",lines:[line("Prive","japanese",.2)]};
assert.equal(mergeOcrCandidates([russian, wrongAlphabet]), "Привет мир");
const adjacentCyrillic: OcrCandidate = {script:"cyrillic",text:"Сәлем",lines:[{
  text:"Сәлем",script:"cyrillic",left:.10,top:.44,right:.43,bottom:.49,
}]};
const adjacentLatin: OcrCandidate = {script:"latin",text:"Hello",lines:[{
  text:"Hello",script:"latin",left:.52,top:.44,right:.82,bottom:.49,
}]};
assert.equal(mergeOcrCandidates([adjacentLatin,adjacentCyrillic]), "Сәлем\nHello");
const hanResult: OcrCandidate = {script:"japanese",text:"学校",lines:[{
  text:"学校",script:"japanese",left:.1,top:.66,right:.8,bottom:.71,language:"ja",
}]};
const chineseResult: OcrCandidate = {script:"chinese",text:"学枚",lines:[{
  text:"学枚",script:"chinese",left:.1,top:.66,right:.8,bottom:.71,
}]};
assert.equal(mergeOcrCandidates([hanResult,chineseResult]), "学校");
// A false-script model must never create a garbage-only note.
assert.equal(mergeOcrCandidates([{
  script:"japanese", text:"Hello stranger",
  lines:[],
}]), "");
assert.equal(mergeOcrCandidates([{
  script:"korean", text:"English",
  lines:[line("English","korean",.15)],
}]), "");
// Scans may include two genuinely adjacent words in the same row.
// Broad bounding boxes must not consume a narrower second language.
const firstColumn: OcrCandidate = {script:"latin",text:"English",lines:[{
 text:"English",script:"latin",left:.12,right:.42,top:.55,bottom:.60,
}]};
const secondColumn: OcrCandidate = {script:"cyrillic",text:"Русский",lines:[{
 text:"Русский",script:"cyrillic",left:.38,right:.75,top:.55,bottom:.60,
}]};
assert.equal(mergeOcrCandidates([firstColumn,secondColumn]),"English\nРусский");
assert.equal(mergeOcrCandidates([duplicate,duplicate,duplicate]),"Hello");
const noGeometryWrong: OcrCandidate = {script:"chinese",text:"Hello",lines:[]};
assert.equal(mergeOcrCandidates([russian,noGeometryWrong]),"Привет мир");
// Canceling the system picker is not a failure or a reason to create a note.
assert.equal(isCameraCancellation(new Error("User cancelled photos app")), true);
assert.equal(isCameraCancellation({code:"OS-PLUG-CAMR-0006",message:"Canceled"}), true);
assert.equal(isCameraCancellation({code:"OS-PLUG-CAMR-0020",message:"Canceled"}), true);
assert.equal(isCameraCancellation(new Error("Camera permission denied")), false);
assert.equal(isCameraCancellation({code:"OS-PLUG-CAMR-0003",message:"Camera unavailable"}), false);
assert.match(readableOcrFailure(new Error("OCR timed out")), /времени/);
assert.match(readableOcrFailure(new Error("Permission denied")), /доступа/);
assert.match(readableOcrFailure(new Error("Cannot decode selected image")), /Фотография/);
const scanGate = new OcrSessionGate();
assert.equal(scanGate.busy, false);
const releaseGate = scanGate.enter();
assert.equal(scanGate.busy, true);
assert.throws(() => scanGate.enter(), /OCR_SCAN_BUSY/);
assert.match(readableOcrFailure(new Error("OCR_SCAN_BUSY")), /Предыдущее/);
releaseGate();
releaseGate();
assert.equal(scanGate.busy, false);
scanGate.enter()();
assert.match(readableOcrFailure(new Error("Unable to save notes: QuotaExceededError")), /сохранить/);
assert.match(readableOcrFailure(new Error("Notes storage has an error")), /хранилища/);
assert.deepEqual(ocrScanPlan("auto"),["latin","cyrillic","japanese","chinese","korean","devanagari"]);
assert.deepEqual(ocrScanPlan("cyrillic"),["cyrillic"]);
assert.deepEqual(ocrScanPlan("japanese"),["japanese"]);
assert.equal(composeRecognizedText({text:"Привет мир",blocks:[]}),"Привет мир");
assert.equal(composeRecognizedText({text:"Привет мир",blocks:[{lines:[]}]}),"Привет мир");
assert.equal(composeRecognizedText({text:"Казахский\nEnglish\n日本語",blocks:[{lines:[{text:"Казахский"}]}]}),"Казахский\nEnglish\n日本語");
assert.equal(composeRecognizedText({text:"one\r\ntwo",blocks:[]}),"one\ntwo");
assert.equal(composeRecognizedText({text:"first second",blocks:[{lines:[{text:"first"},{text:"second"}]}]}),"first\nsecond");
assert.equal(composeRecognizedText({text:"A B",blocks:[{lines:[{text:"A"}]}]}),"A B");
assert.equal(composeRecognizedText({text:"Сәлем Hello",blocks:[{lines:[{text:"Сәлем"}]}]}),"Сәлем Hello");
assert.equal(composeRecognizedText({text:"А 123",blocks:[{lines:[{text:"А"}]}]}),"А 123");
assert.equal(composeRecognizedText({text:"новая строка",blocks:[{lines:[{text:"новая строка"}]}]}),"новая строка");
// A slow phone gets a total OCR time cap, not six independent 15s waits.
const budget = new OcrTimeBudget(60000, 1000);
assert.equal(budget.remaining(15000, 1000), 15000);
assert.equal(budget.remaining(15000, 55000), 6000);
assert.equal(budget.remaining(18000, 60999), 1);
assert.throws(() => budget.remaining(15000, 61000), /OCR timed out/);
assert.throws(() => new OcrTimeBudget(0, 0), /Invalid OCR budget/);
assert.match(readableOcrFailure(new Error("Insufficient memory for offline Russian/Kazakh OCR")), /памяти/);
assert.equal(linesFromMlKit({blocks:[{lines:[{
  text:"outside", boundingBox:{left:1200,top:1200,right:1300,bottom:1300}
}]}]},"latin",1000,1000).length,0);
assert.equal(linesFromMlKit({blocks:[{lines:[{
  text:"partly visible", boundingBox:{left:-10,top:20,right:50,bottom:80}
}]}]},"latin",1000,1000)[0].left,0);
const wideText: OcrCandidate = {script:"latin",text:"Hello",
  lines:[{text:"Hello",script:"latin",left:.05,right:.92,top:.50,bottom:.54}]};
assert.equal(mergeOcrCandidates([wideText,duplicate]),"Hello");
const otherRow: OcrCandidate = {script:"latin",text:"Hello",
  lines:[{text:"Hello",script:"latin",left:.05,right:.92,top:.60,bottom:.64}]};
assert.equal(mergeOcrCandidates([wideText,otherRow]),"Hello\nHello");
assert.equal(CYRILLIC_OCR_LANGUAGES,"kaz+rus");
assert.deepEqual(buildOcrNoteDraft("Сәлем әлем\nHello & <World>", "Сканирование"), {
  title:"Сәлем әлем", body:"<p>Сәлем әлем</p><p>Hello &amp; &lt;World&gt;</p>"
});
assert.throws(() => buildOcrNoteDraft(" \n  ", "Сканирование"), /OCR_EMPTY_TEXT/);
assert.equal(buildOcrNoteDraft("X".repeat(110), "Scan").title.length,80);
const confirmedCyr: OcrCandidate = {script:"cyrillic",text:"Привет мир",lines:[line("Привет мир","cyrillic",.12)]};
const confirmedEng: OcrCandidate = {script:"latin",text:"Hello world",lines:[line("Hello world","latin",.26)]};
const fullUnlocated: OcrCandidate = {
  script:"japanese",text:"Привет мир\nHello world\n日本語の説明",lines:[],
};
assert.equal(mergeOcrCandidates([confirmedCyr,confirmedEng,fullUnlocated]),fullUnlocated.text);
const incompleteUnlocated: OcrCandidate = {
  script:"japanese",text:"Привет мир\n日本語の説明",lines:[],
};
assert.equal(mergeOcrCandidates([confirmedCyr,confirmedEng,incompleteUnlocated]),"Привет мир\n\nHello world");
const reorderedUnlocated: OcrCandidate = {
  script:"japanese",text:"Hello world\nПривет мир\n日本語の説明",lines:[],
};
assert.equal(mergeOcrCandidates([confirmedCyr,confirmedEng,reorderedUnlocated]),"Привет мир\n\nHello world");
const copiedPage: OcrCandidate = {
  script:"latin",text:"Привет мир\nHello world",lines:[],
};
assert.equal(mergeOcrCandidates([confirmedCyr,confirmedEng,copiedPage]),"Привет мир\n\nHello world");

const badPaths: unknown[] = [
 "", " ", "https://example.com/image.jpg", "http://example.com/i.png",
 "javascript:alert(1)", "data:image/png;base64,AAAA", "blob:local/image",
 "file://", "file://remote.example/image.jpg", "content://",
 "/\n", "//server/share", " file:///storage/emulated/0/pic.jpg ",
];
for (const path of badPaths) {
  assert.equal(isLocalOcrImagePath(path),false,"Must refuse untrusted/non-local path: "+String(path));
}
for (const path of ["/storage/emulated/0/DCIM/camera.jpg",
  "file:///data/user/0/app/cache/photo.jpg",
  "content://media/external/images/media/5"]) {
  assert.equal(isLocalOcrImagePath(path),true,"Must allow provider path: "+path);
}
assert.deepEqual(ocrScanPlan("chinese"),["chinese"]);
assert.deepEqual(ocrScanPlan("korean"),["korean"]);
assert.deepEqual(ocrScanPlan("devanagari"),["devanagari"]);
const devanagariLine: OcrCandidate = {script:"devanagari",text:"हिन्दी भाषा",
  lines:[line("हिन्दी भाषा","devanagari",.73)]};
const koreanLine: OcrCandidate = {script:"korean",text:"한국어",
  lines:[line("한국어","korean",.44)]};
const japaneseLine: OcrCandidate = {script:"japanese",text:"かな",
  lines:[line("かな","japanese",.20)]};
assert.equal(mergeOcrCandidates([koreanLine,devanagariLine,japaneseLine]),
  "かな\n\n한국어\n\nहिन्दी भाषा");
assert.ok(lineScore("हिन्दी","devanagari") > lineScore("हिन्दी","latin"));
assert.ok(lineScore("かな","japanese") > lineScore("かな","chinese"));
const testGate = new OcrSessionGate();
const hold = testGate.enter();
assert.throws(() => testGate.enter(),/OCR_SCAN_BUSY/);
hold();
assert.equal(testGate.busy,false);
assert.equal(await withOcrDeadline(Promise.resolve("done"),200),"done");
await assert.rejects(() => withOcrDeadline(new Promise<void>(()=>{}),8),/OCR timed out/);
await assert.rejects(() => withOcrDeadline(Promise.resolve("done"),0),/Invalid OCR limit/);
assert.equal(readableOcrFailure(new Error("Selected image has no readable local path.")),
  "Фотография не читается. Выберите другое изображение.");
// A one-letter/digit loss is still unacceptable, even below the former 12% cutoff.
assert.equal(composeRecognizedText({
  text:"Платёж 2026 №7",blocks:[{lines:[{text:"Платёж 2026"}]}],
}),"Платёж 2026 №7");
assert.equal(composeRecognizedText({
  text:"Сәлем! Hello",blocks:[{lines:[{text:"Сәлем"},{text:"Hello"}]}],
}),"Сәлем! Hello");
assert.equal(composeRecognizedText({
  text:"first small middle last",blocks:[{lines:[{text:"first"},{text:"last"}]}],
}),"first small middle last");
// A structurally inconsistent full text must not overwrite reliable block text.
assert.equal(composeRecognizedText({
  text:"last and first, another paragraph",blocks:[{lines:[{text:"first"},{text:"last"}]}],
}),"first\nlast");
// The photo must not be saved as complete if ANY selected OCR engine fails.
const fullScan = new OcrScanCoverage(["latin","cyrillic","japanese"]);
fullScan.markCompleted("latin");
fullScan.markCompleted("cyrillic");
assert.throws(() => fullScan.ensureComplete(),/OCR_MODELS_INCOMPLETE/);
fullScan.markFailed("japanese");
assert.throws(() => fullScan.ensureComplete(),/OCR_MODELS_INCOMPLETE/);
assert.match(readableOcrFailure(new Error("OCR_MODELS_INCOMPLETE")),/Неполная заметка не сохранена/);
fullScan.markCompleted("japanese");
fullScan.ensureComplete();
fullScan.markFailed("latin");
assert.throws(() => fullScan.ensureComplete(),/OCR_MODELS_INCOMPLETE/);
fullScan.markCompleted("latin");
fullScan.ensureComplete();
assert.throws(() => fullScan.markCompleted("korean"),/Unexpected OCR script/);
assert.throws(() => new OcrScanCoverage([]),/Invalid OCR scan plan/);
assert.throws(() => new OcrScanCoverage(["latin","latin"]),/Invalid OCR scan plan/);
const manualScan = new OcrScanCoverage(["cyrillic"]);
manualScan.markCompleted("cyrillic"); // Empty result still completes the engine.
manualScan.ensureComplete();
// 80 code points should never leave an unmatched UTF-16 surrogate.
const emojiTitle = "A".repeat(79) + "📷" + " after the limit";
assert.equal(buildOcrNoteDraft(emojiTitle, "OCR").title, "A".repeat(79) + "📷");
assert.equal(Array.from(buildOcrNoteDraft(emojiTitle,"OCR").title).length,80);
const manyEmojiTitle = "📷".repeat(100);
assert.equal(buildOcrNoteDraft(manyEmojiTitle,"OCR").title, "📷".repeat(80));
assert.equal(buildOcrNoteDraft("\n\n日本語 Title\nrest","OCR").title,"日本語 Title");
// Formatting must not silently collapse photographed indentation or tab columns.
assert.equal(ocrTextToEditorHtml("  Таблица\nA\t2500\n Итого "),"<p>&nbsp;&nbsp;Таблица</p><p>A&nbsp;&nbsp;&nbsp;&nbsp;2500</p><p>&nbsp;Итого&nbsp;</p>");
assert.equal(ocrTextToEditorHtml("A\t\tB"),"<p>A&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;B</p>");
assert.equal(ocrTextToEditorHtml("<b>\tИтого & 5"),
  "<p>&lt;b&gt;&nbsp;&nbsp;&nbsp;&nbsp;Итого &amp; 5</p>");
assert.equal(truncateOcrTitle("x".repeat(79)+"👩‍💻"+"z",80),"x".repeat(79)+"👩‍💻");
assert.equal(truncateOcrTitle("x".repeat(79)+"🇰🇿"+"z",80),"x".repeat(79)+"🇰🇿");
assert.equal(truncateOcrTitle("x".repeat(79)+"e\u0301"+"z",80),"x".repeat(79)+"e\u0301");
assert.throws(() => truncateOcrTitle("abc",-1),/Invalid OCR title limit/);
// Expired budgets MUST NOT start a native recognizer at all.
let startedNative = 0;
let trackedNative = 0;
assert.throws(() => startOcrWithinBudget(new OcrTimeBudget(10,0),18000,
  () => { startedNative++; return Promise.resolve("wrong"); },
  () => { trackedNative++; }), /OCR timed out/);
assert.equal(startedNative,0);
assert.equal(trackedNative,0);
assert.equal(await startOcrWithinBudget(new OcrTimeBudget(3000,Date.now()),1000,
  () => { startedNative++; return Promise.resolve("ok"); },
  () => { trackedNative++; }),"ok");
assert.equal(startedNative,1);
assert.equal(trackedNative,1);
assert.throws(() => startOcrWithinBudget(new OcrTimeBudget(5000,Date.now()),0,
  () => { startedNative++; return Promise.resolve("wrong"); },
  () => { trackedNative++; }),/Invalid OCR limit/);
assert.equal(startedNative,1);
// OCR providers emit several newline conventions; each is a real text line.
assert.equal(ocrTextToEditorHtml("Первая\rВторая\u2028Третья\u2029Четвёртая"),"<p>Первая</p><p>Вторая</p><p>Третья</p><p>Четвёртая</p>");
assert.equal(buildOcrNoteDraft("\r\n\u2028Қазақ тілі\u2029English", "OCR").title,"Қазақ тілі");
assert.equal(ocrTextToEditorHtml("A\r\n\rB"),"<p>A</p><p><br></p><p>B</p>");
const anchoredKaz: OcrCandidate = {script:"cyrillic",text:"Қазақ тілі",lines:[line("Қазақ тілі","cyrillic",.1)]};
const unlocatedEnglish: OcrCandidate = {script:"latin",text:"Complete English paragraph on the same photo",lines:[]};
assert.equal(mergeOcrCandidates([anchoredKaz,unlocatedEnglish]),"Қазақ тілі\n\nComplete English paragraph on the same photo");
assert.equal(mergeOcrCandidates([unlocatedEnglish,anchoredKaz]),"Қазақ тілі\n\nComplete English paragraph on the same photo");
assert.equal(mergeOcrCandidates([anchoredKaz,{script:"cyrillic",text:"Қазақ тілі 2026",lines:[]}]),"Қазақ тілі 2026");
assert.equal(mergeOcrCandidates([anchoredKaz,{script:"latin",text:"Hi",lines:[]}]),"Қазақ тілі");
console.log("OCR text fallback, scan order, geometry, cancellation, budget, session gate, note safety: passed.");
