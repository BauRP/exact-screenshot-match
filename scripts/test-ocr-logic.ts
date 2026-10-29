import { strict as assert } from "node:assert";
import { ocrTextToEditorHtml, buildOcrNoteDraft, truncateOcrTitle } from "../src/lib/ocr-note";
import { composeRecognizedText, hasConflictingNativeOcrText, extractNativeTextAlternative, recoverNativeFullTextForReview } from "../src/lib/ocr-text";
import { ocrScanPlan, selectedOcrScanPlan, readOcrScanPreferences, saveOcrScanPreferences, AUTO_SCAN_ORDER, prioritizeRemainingOcrScripts, confidentOcrPrimaryScript, cyrillicLanguageForScan, CYRILLIC_OCR_LANGUAGES } from "../src/lib/ocr-plan";
import { linesFromMlKit, linesFromMlKitBounded, mlKitReportedLanguages } from "../src/lib/ocr-geometry";
import { OcrSessionGate } from "../src/lib/ocr-session";
import { OcrScanCoverage } from "../src/lib/ocr-coverage";
import { OcrIncompleteScanError, markIncompleteOcrText, OCR_SCRIPT_LABELS, hanAlternativesFromCandidates, previewHanAlternatives, cyrillicTextWithLineFallback } from "../src/lib/ocr-partial";
import { chooseLocalOcrImagePath, reusableOcrImagePath, safeLocalOcrPreviewUrl } from "../src/lib/ocr-input";
import { OcrTimeBudget, withOcrDeadline, startOcrWithinBudget } from "../src/lib/ocr-budget";
import { isLocalOcrImagePath } from "../src/lib/ocr-input";
import { isCameraCancellation, readableOcrFailure } from "../src/lib/ocr-errors";
import { lineScore, mergeOcrCandidates, exceedsOcrSpatialBudget, mergeOversizedOcrForReview, restoreOmittedOcrScriptTextForReview, OCR_SPATIAL_LINE_LIMIT, hasAmbiguousHanCandidates, hasUncertainMixedScriptLayout, type OcrCandidate } from "../src/lib/ocr-merge";

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
assert.deepEqual(ocrScanPlan(["japanese","korean"]),["japanese","korean"]);
assert.deepEqual(ocrScanPlan(["cyrillic"]),["cyrillic"]);
assert.throws(()=>ocrScanPlan([]),/Invalid OCR scan plan/);
assert.throws(()=>ocrScanPlan(["japanese","japanese"]),/Invalid OCR scan plan/);
assert.throws(()=>ocrScanPlan(["bogus" as never]),/Invalid OCR scan plan/);

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
// Real multilingual line: a script recognizer can recognize only its own
// word while another engine returns the full phrase. Keep the full text once.
const completeMixedLine: OcrCandidate = {
  script:"cyrillic",text:"Сәлем Hello",
  lines:[{text:"Сәлем Hello",script:"cyrillic",left:.10,right:.81,top:.20,bottom:.27}]
};
const englishFragment: OcrCandidate = {
  script:"latin",text:"Hello",
  lines:[{text:"Hello",script:"latin",left:.57,right:.81,top:.20,bottom:.27}]
};
assert.equal(mergeOcrCandidates([englishFragment,completeMixedLine]),"Сәлем Hello");
assert.equal(mergeOcrCandidates([completeMixedLine,englishFragment]),"Сәлем Hello");
const partialCyrillic: OcrCandidate = {
  script:"cyrillic",text:"Сәлем",
  lines:[{text:"Сәлем",script:"cyrillic",left:.10,right:.40,top:.20,bottom:.27}]
};
assert.equal(mergeOcrCandidates([partialCyrillic,completeMixedLine]),"Сәлем Hello");
// Do not mistake matching text in separate columns or lines for duplicates.
const separateEnglishColumn: OcrCandidate = {
  script:"latin",text:"Hello",
  lines:[{text:"Hello",script:"latin",left:.85,right:.98,top:.20,bottom:.27}]
};
assert.equal(mergeOcrCandidates([completeMixedLine,separateEnglishColumn]),"Сәлем Hello\nHello");
const nextRow: OcrCandidate = {
  script:"latin",text:"Hello",
  lines:[{text:"Hello",script:"latin",left:.57,right:.81,top:.32,bottom:.39}]
};
assert.equal(mergeOcrCandidates([completeMixedLine,nextRow]),"Сәлем Hello\nHello");
// Single digits inside larger receipt values are NOT whole-word duplicates.
const receiptShort: OcrCandidate = {
  script:"latin",text:"7",
  lines:[{text:"7",script:"latin",left:.40,right:.45,top:.50,bottom:.54}]
};
const receiptLong: OcrCandidate = {
  script:"latin",text:"70",
  lines:[{text:"70",script:"latin",left:.40,right:.55,top:.50,bottom:.54}]
};
assert.equal(mergeOcrCandidates([receiptShort,receiptLong]),"70\n7");
// Two located scripts plus a third spatially unlocated script must not
// lose an entire recognized paragraph (nor append duplicated page text).
const twoLocated: OcrCandidate[] = [
  {script:"cyrillic",text:"Қазақ тілі",lines:[line("Қазақ тілі","cyrillic",.12)]},
  {script:"korean",text:"한국어 문장",lines:[line("한국어 문장","korean",.35)]},
];
const longEnglish: OcrCandidate = {script:"latin",
  text:"Complete English instructions printed at the bottom",lines:[]};
assert.equal(mergeOcrCandidates([...twoLocated,longEnglish]),
  "Қазақ тілі\n\n한국어 문장\n\nComplete English instructions printed at the bottom");
assert.equal(mergeOcrCandidates([longEnglish,...twoLocated]),
  "Қазақ тілі\n\n한국어 문장\n\nComplete English instructions printed at the bottom");
assert.equal(mergeOcrCandidates([...twoLocated,longEnglish,longEnglish]),
  "Қазақ тілі\n\n한국어 문장\n\nComplete English instructions printed at the bottom");
const irrelevantLatin: OcrCandidate={script:"latin",text:"Hello",lines:[]};
assert.equal(mergeOcrCandidates([...twoLocated,irrelevantLatin]),
  "Қазақ тілі\n\n한국어 문장");
const locatedLatin: OcrCandidate={script:"latin",text:"Saved English section",
  lines:[line("Saved English section","latin",.64)]};
assert.equal(mergeOcrCandidates([...twoLocated,locatedLatin,longEnglish]),
  "Қазақ тілі\n\n한국어 문장\n\nSaved English section");
// Distinct Chinese/Japanese Han-only blocks should NOT be added as duplicate.
const japaneseLocated: OcrCandidate = {script:"japanese",text:"日本語の文章",
  lines:[line("日本語の文章","japanese",.61)]};
const chineseUnknown: OcrCandidate = {script:"chinese",
  text:"中文汉字的完整一段话中文汉字的完整一段话中文汉字",lines:[]};
assert.equal(mergeOcrCandidates([...twoLocated,japaneseLocated,chineseUnknown]),
  "Қазақ тілі\n\n한국어 문장\n\n日本語の文章");
// When ALL recognizers omit boxes, do not discard entire independent
// Cyrillic, Korean, Latin and Devanagari paragraphs.
const noBoxesCyr: OcrCandidate={script:"cyrillic",
  text:"Қазақ тіліндегі маңызды ұзын мәтін",lines:[]};
const noBoxesLatin: OcrCandidate={script:"latin",
  text:"Important independent English information in this document",lines:[]};
const noBoxesKorean: OcrCandidate={script:"korean",
  text:"한국어 문서에는 중요한 설명이 포함되어 있습니다",lines:[]};
const noBoxesHindi: OcrCandidate={script:"devanagari",
  text:"हिन्दी भाषा में एक विस्तृत स्वतंत्र जानकारी",lines:[]};
const geometryFreeResult=mergeOcrCandidates([
  noBoxesCyr,noBoxesLatin,noBoxesKorean,noBoxesHindi,
]);
for(const part of [noBoxesCyr,noBoxesLatin,noBoxesKorean,noBoxesHindi]){
  assert.equal(geometryFreeResult.split(part.text).length,2);
}
assert.equal(geometryFreeResult.split("\n\n").length,4);
assert.equal(mergeOcrCandidates([noBoxesCyr,noBoxesCyr]),noBoxesCyr.text);
const noBoxesShortNoise: OcrCandidate={script:"latin",text:"abc",lines:[]};
assert.equal(mergeOcrCandidates([noBoxesCyr,noBoxesShortNoise]),noBoxesCyr.text);
const noBoxesWrongScript: OcrCandidate={script:"chinese",text:"This is actually Latin text",lines:[]};
assert.equal(mergeOcrCandidates([noBoxesCyr,noBoxesWrongScript]),noBoxesCyr.text);
// An all-Han Japanese/Chinese pair cannot prove two separate languages.
const noBoxesHanJp: OcrCandidate={script:"japanese",
  text:"日本語文書東京大阪京都漢字本文詳解",lines:[]};
const noBoxesHanZh: OcrCandidate={script:"chinese",
  text:"中文文档北京上海南京汉字文字详细说明",lines:[]};
assert.equal(mergeOcrCandidates([noBoxesHanJp,noBoxesHanZh]).split("\n\n").length,1);
const partialCoverage = new OcrScanCoverage(ocrScanPlan("auto"));
partialCoverage.markCompleted("latin");
partialCoverage.markCompleted("cyrillic");
assert.equal(partialCoverage.isComplete(),false);
assert.equal(partialCoverage.missingScripts().length,4);
const incomplete=new OcrIncompleteScanError("Қазақ тілі",partialCoverage.missingScripts());
assert.equal(incomplete.partialText,"Қазақ тілі");
assert.match(readableOcrFailure(incomplete),/не все языки/);
assert.ok(markIncompleteOcrText(incomplete.partialText).startsWith("⚠️ Неполное распознавание"));
assert.throws(() => markIncompleteOcrText("  "),/OCR_EMPTY_TEXT/);
assert.equal(chooseLocalOcrImagePath({path:"/DCIM/photo.jpg",webPath:"https://example.org"}),"/DCIM/photo.jpg");
assert.equal(chooseLocalOcrImagePath({path:"https://example.org",webPath:"content://media/external/5"}),"content://media/external/5");
assert.throws(()=>chooseLocalOcrImagePath({path:"https://example.org",webPath:"blob:photo"}),/no readable local path/);
assert.equal(reusableOcrImagePath("content://media/external/images/5"),
  "content://media/external/images/5");
assert.equal(reusableOcrImagePath("/data/user/0/app/cache/photo.jpg"),
  "/data/user/0/app/cache/photo.jpg");
assert.throws(()=>reusableOcrImagePath("https://example.org/photo.jpg"),/no readable local path/);
assert.equal(OCR_SCRIPT_LABELS.cyrillic,"Русский и казахский");
assert.equal(new OcrIncompleteScanError("Қазақ",["japanese","japanese"]).missingScripts.length,1);
assert.ok(markIncompleteOcrText("Қазақ",["chinese","korean"]).includes("Не завершены проверки: Китайский, Корейский."));
assert.equal(markIncompleteOcrText("Қазақ",[]).includes("Не завершены проверки:"),false);

// Conflicting Chinese/Japanese Han-only readings must be shown for review.
// Identical glyphs need no warning; independent locations do not conflict.
const hanLine = (text: string, script: "japanese" | "chinese", top: number) => ({
  script, text, lines:[{text,script,left:.12,top,right:.87,bottom:top+.07}],
});
assert.equal(hasAmbiguousHanCandidates([
  hanLine("日本語学校", "japanese", .32),hanLine("日本語学枚", "chinese", .32),
]), true);
assert.equal(hasAmbiguousHanCandidates([
  hanLine("日本語学校", "japanese", .32),hanLine("日本語学校", "chinese", .32),
]), false);
assert.equal(hasAmbiguousHanCandidates([
  hanLine("日本語学校", "japanese", .12),hanLine("中文文章", "chinese", .72),
]), false);
assert.equal(hasAmbiguousHanCandidates([
  hanLine("こんにちは世界", "japanese", .32),hanLine("中文文章", "chinese", .32),
]), false);
assert.equal(hasAmbiguousHanCandidates([
  {script:"japanese",text:"日本語学校",lines:[]},
  {script:"chinese",text:"日本語学枚",lines:[]},
]), true);
console.log("OCR Han-only ambiguity detection: passed.");
console.log("OCR text fallback, scan order, geometry, cancellation, budget, session gate, note safety: passed.");

// Every enabled model still runs, but an observed script is checked sooner.
assert.deepEqual(prioritizeRemainingOcrScripts(["japanese","chinese","korean","devanagari"],"한글 한국어"),
  ["korean","japanese","chinese","devanagari"]);
assert.deepEqual(prioritizeRemainingOcrScripts(["chinese","japanese","korean"],"かな日本語"),
  ["japanese","chinese","korean"]);
assert.deepEqual(prioritizeRemainingOcrScripts(["japanese","chinese","korean"],"中文汉字"),
  ["japanese","chinese","korean"]);
assert.deepEqual(prioritizeRemainingOcrScripts(["japanese","chinese","devanagari"],"हिन्दी नमस्ते"),
  ["devanagari","japanese","chinese"]);
const rotatedCorners = linesFromMlKit({blocks:[{lines:[{text:"Қазақ",cornerPoints:[
  {x:300,y:65},{x:790,y:85},{x:780,y:170},{x:295,y:145}
]}]}]}, "cyrillic", 1000, 500);
assert.equal(rotatedCorners.length,1);
assert.equal(rotatedCorners[0].left,.295);
assert.equal(rotatedCorners[0].bottom,.34);
assert.equal(linesFromMlKit({blocks:[{lines:[{text:"abc",cornerPoints:[
  {x:NaN,y:10},{x:100,y:20},{x:110,y:50},{x:10,y:40}
]}]}]},"latin",1000,500).length,0);
assert.equal(cyrillicTextWithLineFallback({text:"",lines:[{text:"Қазақ"},{text:"Русский"}]}),
  "Қазақ\nРусский");
assert.equal(cyrillicTextWithLineFallback({text:"Нақты",lines:[{text:"другое"}]}),"Нақты");
assert.deepEqual(hanAlternativesFromCandidates([
  {script:"japanese",text:"日本語学校"},{script:"chinese",text:"日本学枚"}
]),{japanese:"日本語学校",chinese:"日本学枚"});
assert.equal(hanAlternativesFromCandidates([
  {script:"japanese",text:"学校"},{script:"chinese",text:"学校"}
]),null);
console.log("All-script scheduling, rotated geometry, Cyrillic fallback and Han alternatives: passed.");

// Manual Cyrillic OCR must use only the chosen bundled language, while auto
// and recovery preserve the pinned mixed Russian/Kazakh recognizer.
assert.deepEqual(ocrScanPlan("russian"), ["cyrillic"]);
assert.deepEqual(ocrScanPlan("kazakh"), ["cyrillic"]);
assert.equal(cyrillicLanguageForScan("russian"), "rus");
assert.equal(cyrillicLanguageForScan("kazakh"), "kaz");
assert.equal(cyrillicLanguageForScan("auto"), CYRILLIC_OCR_LANGUAGES);
assert.equal(cyrillicLanguageForScan(["cyrillic"]), CYRILLIC_OCR_LANGUAGES);
console.log("Separate bundled Russian/Kazakh modes and mixed automatic recovery: passed.");


const missingGeometryMultiscript: OcrCandidate[] = [
  {script:"cyrillic",text:"Қазақ тіліндегі маңызды мәтін",
    lines:[{text:"Қазақ тіліндегі маңызды мәтін",script:"cyrillic",left:.05,top:.1,right:.9,bottom:.16}]},
  {script:"korean",text:"한국어 문서 안내 정보",lines:[]},
];
assert.equal(hasUncertainMixedScriptLayout(missingGeometryMultiscript),true);
assert.equal(hasUncertainMixedScriptLayout([missingGeometryMultiscript[0]]),false);
assert.equal(hasUncertainMixedScriptLayout([
  missingGeometryMultiscript[0],
  {script:"korean",text:"한국어 문서 안내 정보",
    lines:[{text:"한국어 문서 안내 정보",script:"korean",left:.1,top:.5,right:.9,bottom:.6}]}
]),false);
assert.equal(hasUncertainMixedScriptLayout([
  missingGeometryMultiscript[0],{script:"latin",text:"abc",lines:[]}
]),false);
assert.equal(hasUncertainMixedScriptLayout([
  {script:"japanese",text:"日本語文書東京大阪京都漢字本文詳解",lines:[]},
  {script:"chinese",text:"中文文档北京上海南京汉字文字详细说明",lines:[]}
]),false);
console.log("Uncertain multilingual geometry is referred to review without dropping text: passed.");


// Offline multilingual selection uses only bundled models, with stable order
// even when the checkbox sequence differs. Missing/duplicated models fail.
assert.deepEqual(selectedOcrScanPlan(["korean","latin","cyrillic"]),
  ["latin","cyrillic","korean"]);
assert.deepEqual(selectedOcrScanPlan(["devanagari","chinese"]),
  ["chinese","devanagari"]);
assert.deepEqual(selectedOcrScanPlan([...AUTO_SCAN_ORDER]),ocrScanPlan("auto"));
assert.deepEqual(ocrScanPlan(selectedOcrScanPlan(["korean","japanese"])),
  ["japanese","korean"]);
assert.throws(()=>selectedOcrScanPlan([]),/Invalid OCR scan plan/);
assert.throws(()=>selectedOcrScanPlan(["latin","latin"]),/Invalid OCR scan plan/);
assert.throws(()=>selectedOcrScanPlan(["unsupported" as never]),/Invalid OCR scan plan/);
console.log("Offline custom multilingual selection and stable six-script scan plan: passed.");


// A native full-text/blocks discrepancy can corrupt Chinese, Japanese,
// Korean and Cyrillic text even when every bundled recognizer returned success.
assert.equal(hasConflictingNativeOcrText({text:"日本語学校",blocks:[
  {lines:[{text:"日本語学校"}]}
]}),false);
assert.equal(hasConflictingNativeOcrText({text:"日本語学校 大阪",blocks:[
  {lines:[{text:"日本語学校"}]}
]}),false);
assert.equal(hasConflictingNativeOcrText({
  text:"Қазақ тіліндегі мәтін\n日本語の文章",
  blocks:[{lines:[{text:"Қазақ тіліндегі мәтін"}]}],
}),true);
assert.equal(hasConflictingNativeOcrText({
  text:"The complete scanned document",
  blocks:[{lines:[{text:"The complete"}]}],
}),true);
assert.equal(hasConflictingNativeOcrText({
  text:"Платёж 2026 №7",blocks:[{lines:[{text:"Платёж 2026"}]}],
}),false);
assert.equal(hasConflictingNativeOcrText({text:"日本語学校",blocks:[
  {lines:[{text:"日本語学枚"}]}
]}),true);
assert.equal(hasConflictingNativeOcrText({text:"Қазақ тіліндегі мәтін",blocks:[
  {lines:[{text:"Қазақ тіліндегі мətin"}]}
]}),true);
assert.equal(hasConflictingNativeOcrText({text:"text",blocks:[
  {lines:[{text:"tast"}]}
]}),true);
assert.equal(hasConflictingNativeOcrText({text:"A",blocks:[{lines:[{text:"B"}]}]}),false);
assert.equal(hasConflictingNativeOcrText({text:"日本語",blocks:[{lines:[{text:"日本学"}]}]}),true);
assert.equal(hasConflictingNativeOcrText({text:"日本語学校",blocks:[]}),false);
console.log("Native OCR text/line conflicts require review rather than silent glyph changes: passed.");


// Very dense OCR pages must not put the WebView into quadratic spatial
// line matching. Every distinct native full-text reading remains available.
const denseText = "Қазақ тілі 123456789\n".repeat(370);
const denseCyrillic: OcrCandidate = {
  script:"cyrillic", text:denseText,
  lines:Array.from({length:OCR_SPATIAL_LINE_LIMIT+1},(_,i)=>({
    script:"cyrillic" as const,text:"Қазақ тілі 123456789",
    left:.05,top:i/1000,right:.9,bottom:i/1000+.0007,
  })),
};
const denseJapanese: OcrCandidate={
  script:"japanese",text:"日本語の長い文章を正しく確認してください",lines:[],
};
assert.equal(exceedsOcrSpatialBudget([denseCyrillic,denseJapanese]),true);
assert.equal(exceedsOcrSpatialBudget([{
  ...denseCyrillic,lines:denseCyrillic.lines.slice(0,OCR_SPATIAL_LINE_LIMIT)
}]),false);
const denseReview=mergeOversizedOcrForReview([denseCyrillic,denseJapanese,denseJapanese]);
assert.ok(denseReview.includes("Қазақ тілі"));
assert.ok(denseReview.includes("日本語"));
assert.equal(denseReview.match(/日本語の長い文章/g)?.length,1);
assert.equal(mergeOversizedOcrForReview([]),"");
console.log("Large-photo OCR geometry safely falls back without dropping language readings: passed.");


// The user can inspect both conflicting ML Kit readings without losing
// Cyrillic/Japanese text from any other selected model.
const pair=extractNativeTextAlternative("japanese",{
 text:"日本語学校",blocks:[{lines:[{text:"日本語学枚"}]}],
});
assert.equal(pair?.script,"japanese");
assert.equal(pair?.complete,"日本語学校");
assert.equal(pair?.lines,"日本語学枚");
assert.equal(extractNativeTextAlternative("korean",{
 text:"한국어 문서",blocks:[{lines:[{text:"한국어 문서"}]}],
}),null);
assert.ok(Array.from(extractNativeTextAlternative("japanese",{
 text:"日本語".repeat(1200),blocks:[{lines:[{text:"日本学".repeat(1200)}]}],
})?.complete ?? "").length <= 2000);
console.log("Native OCR alternatives remain visible for manual glyph review: passed.");


// A user-selected offline model combination persists, while a new install
// still scans every script automatically. Malformed preferences fail closed.
const prefData = new Map<string,string>();
const prefStore={
  getItem:(key:string)=>prefData.get(key)??null,
  setItem:(key:string,value:string)=>{prefData.set(key,value);},
};
assert.deepEqual(readOcrScanPreferences(prefStore),{
  mode:"auto",scripts:["latin","cyrillic"],
});
assert.equal(saveOcrScanPreferences({
  mode:"custom",scripts:["korean","cyrillic","latin"],
},prefStore),true);
assert.deepEqual(readOcrScanPreferences(prefStore),{
  mode:"custom",scripts:["latin","cyrillic","korean"],
});
assert.equal(saveOcrScanPreferences({
  mode:"unknown" as never,scripts:["latin"],
},prefStore),false);
assert.equal(saveOcrScanPreferences({
  mode:"custom",scripts:[],
},prefStore),false);
assert.deepEqual(readOcrScanPreferences({
  getItem:()=>"{corrupted",
  setItem:()=>undefined,
}),{mode:"auto",scripts:["latin","cyrillic"]});
console.log("Offline language selection persists without changing first-install auto defaults: passed.");

assert.deepEqual(previewHanAlternatives({japanese:"日本語",chinese:"中文"}),{
 japanese:"日本語",chinese:"中文",
});
assert.equal(previewHanAlternatives({japanese:"日本語",chinese:"中文"},0),null);
console.log("Han result previews preserve exact original glyphs: passed.");


// When the native Tesseract iterator truncates its geometry, do not mistake
// 350 visible lines for a complete physical document layout.
assert.equal(exceedsOcrSpatialBudget([],true),true);
assert.equal(exceedsOcrSpatialBudget([{script:"cyrillic",text:"Қазақ тілі",lines:[]}],false),false);
assert.equal(exceedsOcrSpatialBudget([{script:"cyrillic",text:"Қазақ тілі",lines:[]}],true),true);
console.log("Native geometry truncation forces full-text manual review: passed.");


// A real ML Kit result can contain thousands of lines. Without bounding,
// the WebView builds thousands of JS objects and performs quadratic matching.
// All text must still be retained in the native complete-text result.
const manyMlKitLines = Array.from({length:OCR_SPATIAL_LINE_LIMIT + 40},(_,i)=>({
  text:"日本語の文章",
  boundingBox:{left:10,top:10+i*3,right:240,bottom:12+i*3},
}));
const hugeMlKitResult={blocks:[{lines:manyMlKitLines}]};
const boundedMlKit=linesFromMlKitBounded(hugeMlKitResult,"japanese",320,2000);
assert.equal(boundedMlKit.lines.length,OCR_SPATIAL_LINE_LIMIT);
assert.equal(boundedMlKit.truncated,true);
assert.equal(linesFromMlKit(hugeMlKitResult,"japanese",320,2000).length,OCR_SPATIAL_LINE_LIMIT);
assert.ok(boundedMlKit.lines.every(line=>line.script==="japanese"));
const exactMlKit=linesFromMlKitBounded({blocks:[{
  lines:manyMlKitLines.slice(0,OCR_SPATIAL_LINE_LIMIT)
}]},"japanese",320,2000);
assert.equal(exactMlKit.truncated,false);
const oneBadBeforeCap=linesFromMlKitBounded({blocks:[{
  lines:[{text:"invalid",boundingBox:{left:NaN,top:0,right:10,bottom:20}},
    ...manyMlKitLines.slice(0,OCR_SPATIAL_LINE_LIMIT)]
}]},"japanese",320,2000);
assert.equal(oneBadBeforeCap.truncated,false);
assert.equal(oneBadBeforeCap.lines.length,OCR_SPATIAL_LINE_LIMIT);
const overMultipleBlocks=linesFromMlKitBounded({blocks:[
  {lines:manyMlKitLines.slice(0,200)},
  {lines:manyMlKitLines.slice(0,200)}
]},"japanese",320,2000);
assert.equal(overMultipleBlocks.truncated,true);
assert.equal(overMultipleBlocks.lines.length,OCR_SPATIAL_LINE_LIMIT);
assert.deepEqual(linesFromMlKitBounded(hugeMlKitResult,"japanese",0,2000),
  {lines:[],truncated:false});
console.log("All ML Kit recognizers now bound expensive text geometry before fusion: passed.");


// Language evidence returned by already-completed bundled recognizers changes
// only the order, NOT which script models run. Han characters alone cannot
// select Chinese vs Japanese. Unsupported and malformed hints are ignored.
assert.deepEqual(prioritizeRemainingOcrScripts(
  ["japanese","chinese","korean","devanagari"],"上海中文漢字",["zh-Hant"]),
  ["chinese","japanese","korean","devanagari"]);
assert.deepEqual(prioritizeRemainingOcrScripts(
  ["chinese","japanese","korean"],"学校日本語",["ja-JP"]),
  ["japanese","chinese","korean"]);
assert.deepEqual(prioritizeRemainingOcrScripts(
  ["japanese","chinese","korean","devanagari"],"韓國文章",["ko-KR"]),
  ["korean","japanese","chinese","devanagari"]);
assert.deepEqual(prioritizeRemainingOcrScripts(
  ["korean","japanese","devanagari"],"नमस्ते",["hi-IN"]),
  ["devanagari","korean","japanese"]);
assert.deepEqual(prioritizeRemainingOcrScripts(
  ["japanese","chinese","korean"],"漢字",[ "und","unknown","invalid",
  "x".repeat(100)]),["japanese","chinese","korean"]);
assert.deepEqual(prioritizeRemainingOcrScripts(
  ["japanese","chinese","korean"],"漢字",["zh"]),["chinese","japanese","korean"]);
const reported=mlKitReportedLanguages({blocks:[{lines:[
  {text:"",recognizedLanguage:"ja-JP"},
  {text:"abc",recognizedLanguage:"und"},
  {text:"한국어",recognizedLanguage:"ko-KR"},
  {text:"",recognizedLanguage:"ja-JP"},
  {text:"",recognizedLanguage:"".padEnd(33,"x")}
]}]});
assert.deepEqual(reported,["ja-jp","ko-kr"]);
assert.deepEqual(mlKitReportedLanguages({blocks:[{lines:[]},{}]}),[]);
for (const hinted of ["ja-JP","zh-CN","ko-KR","hi-IN","ru-RU","en-US"]) {
  const result=prioritizeRemainingOcrScripts(AUTO_SCAN_ORDER,"", [hinted]);
  assert.equal(result.length,6);
  assert.deepEqual(new Set(result),new Set(AUTO_SCAN_ORDER));
}
console.log("Native language hints prioritize offline models without dropping any scripts: passed.");


// Previously, the full-text fallback could omit a SHORT independent alphabet
// because its 24/30-character threshold is designed against hallucinations.
const shortKazakh = {script:"cyrillic" as const,text:"Қазақ тіліндегі мәтін",
  lines:[{script:"cyrillic" as const,text:"Қазақ тіліндегі мәтін",
    left:.04,right:.92,top:.1,bottom:.16}]};
const shortJapanese = {script:"japanese" as const,text:"こんにちは",lines:[]};
const shortKorean = {script:"korean" as const,text:"한국어",lines:[]};
const mergedShort = mergeOcrCandidates([shortKazakh,shortJapanese,shortKorean]);
const reviewedShort = restoreOmittedOcrScriptTextForReview(
  mergedShort,[shortKazakh,shortJapanese,shortKorean]);
assert.ok(reviewedShort.includes("Қазақ тіліндегі мәтін"));
assert.ok(reviewedShort.includes("こんにちは"));
assert.ok(reviewedShort.includes("한국어"));
assert.equal(reviewedShort.match(/こんにちは/gu)?.length,1);
assert.equal(restoreOmittedOcrScriptTextForReview(
  reviewedShort,[shortKazakh,shortJapanese,shortKorean]),reviewedShort);
// Same-script noise, repeated existing paragraphs, numbers and short
// Latin hallucinations must not generate extra review paragraphs.
assert.equal(restoreOmittedOcrScriptTextForReview(
  "Қазақ тіліндегі мәтін",[shortKazakh,{script:"latin",text:"abc",lines:[]}]),
  "Қазақ тіліндегі мәтін");
assert.equal(restoreOmittedOcrScriptTextForReview(
  "学校",[]),"学校");
assert.equal(restoreOmittedOcrScriptTextForReview(
  "日本語学校",[{script:"chinese",text:"中文测试文字",lines:[]}]),"日本語学校");
assert.equal(restoreOmittedOcrScriptTextForReview(
  "Привет",[{script:"devanagari",text:"नमस्ते हिन्दी",lines:[]}]),
  "Привет\n\nनमस्ते हिन्दी");
assert.equal(restoreOmittedOcrScriptTextForReview("",[shortJapanese]),"");
console.log("Short independent language fragments survive multilingual fusion for review: passed.");


// Candidate iteration must be an actual readonly array, never a casted
// non-iterable fake. CJK texts can include several scripts on one line.
const mixedHanKana = [
  {script:"japanese" as const,text:"日本語こんにちは",lines:[]},
  {script:"chinese" as const,text:"日本語测试",lines:[]},
];
assert.equal(restoreOmittedOcrScriptTextForReview(
  "中文文章说明",mixedHanKana),"中文文章说明\n\n日本語こんにちは");
assert.equal(restoreOmittedOcrScriptTextForReview(
  "Hello world",[{script:"latin",text:"HELLO WORLD",lines:[]}]),
  "Hello world");
const devanagariPassage={script:"devanagari" as const,
  text:"मराठी भाषा",lines:[]};
const cjkAndDevanagari=restoreOmittedOcrScriptTextForReview(
  "こんにちは",[devanagariPassage]);
assert.equal(cjkAndDevanagari,"こんにちは\n\nमराठी भाषा");
console.log("OCR regression: actual arrays, mixed Han/Kana and Devanagari loss safeguards: passed.");


// Japanese routinely contains both Kana and Han (Kanji). An OCR fallback
// must not require a mostly-Kana sentence, nor invent Japanese on Han alone.
const combinedKanjiKana={script:"japanese" as const,
  text:"東京都へ行きます",lines:[]};
assert.equal(restoreOmittedOcrScriptTextForReview(
  "한국어 문서",[combinedKanjiKana]),"한국어 문서\n\n東京都へ行きます");
// Three isolated Kanji characters cannot establish Japanese versus Chinese.
assert.equal(restoreOmittedOcrScriptTextForReview(
  "한국어 문서",[{script:"japanese",text:"東京都",lines:[]}]),"한국어 문서");
// Four Han glyphs from a credible OCR engine may be preserved for REVIEW,
// never assigned a definitive Japanese/Chinese language identity.
assert.equal(restoreOmittedOcrScriptTextForReview(
  "한국어 문서",[{script:"japanese",text:"東京都庁",lines:[]}]),
  "한국어 문서\n\n東京都庁");
assert.equal(restoreOmittedOcrScriptTextForReview(
  "한국어 문서",[{script:"japanese",text:"あ北",lines:[]}]),"한국어 문서");
assert.equal(restoreOmittedOcrScriptTextForReview(
  "한국어 문서",[{script:"japanese",text:"あああ".repeat(8),lines:[]}]),
  "한국어 문서\n\n"+"あああ".repeat(8));
console.log("Japanese mixed Kana/Kanji review preserves meaningful short passages: passed.");


// A native recognizer's complete reading may contain another paragraph even
// when the geometric block/line iterator only provides a partial page.
// Keep both originals accessible for correction before saving.
const incompleteNativeBlocks = {
 text:"Қазақша мәтін\n日本語の文章",
 blocks:[{lines:[{text:"Қазақша мәтін"}]}],
};
const incompleteNativeComparison=extractNativeTextAlternative("japanese",incompleteNativeBlocks);
assert.equal(incompleteNativeComparison?.complete,"Қазақша мәтін\n日本語の文章");
assert.equal(incompleteNativeComparison?.lines,"Қазақша мәтін");
assert.equal(composeRecognizedText(incompleteNativeBlocks),"Қазақша мәтін\n日本語の文章");
assert.equal(extractNativeTextAlternative("latin",{
  text:"Hello world!",blocks:[{lines:[{text:"Hello world"}]}],
}),null);
console.log("Complete OCR readings with unlocated paragraphs require manual review: passed.");


// The spatial merge can omit a line despite the recognizer reporting it
// in full native text. Put genuinely absent lines into the editable review,
// not just the read-only 2000-character comparison preview.
const nativeFullPage = [
 {script:"japanese" as const,text:"日本語学校\n新しい文章"},
 {script:"cyrillic" as const,text:"Қазақ тілі"}
];
assert.equal(recoverNativeFullTextForReview(
  "Қазақ тілі\n\n日本語学校",nativeFullPage,["japanese"]),
  "Қазақ тілі\n\n日本語学校\n\n新しい文章");
assert.equal(recoverNativeFullTextForReview(
  "Қазақ тілі\n\n日本語学校\n\n新しい文章",nativeFullPage,["japanese"]),
  "Қазақ тілі\n\n日本語学校\n\n新しい文章");
assert.equal(recoverNativeFullTextForReview(
  "Қазақ тілі",nativeFullPage,["cyrillic"]),"Қазақ тілі");
assert.equal(recoverNativeFullTextForReview(
  "Қазақ тілі",nativeFullPage,[]),"Қазақ тілі");
assert.equal(recoverNativeFullTextForReview(
  "Қазақ тілі",[{script:"japanese",text:"あ\n3\n日\n2026"}],["japanese"]),
  "Қазақ тілі\n\n2026");
assert.equal(recoverNativeFullTextForReview(
  "Қазақ тілі",[{script:"japanese",text:"日本語学校\n日本語学校\n新しい文章"}],
  ["japanese"]),"Қазақ тілі\n\n日本語学校\n新しい文章");
assert.equal(recoverNativeFullTextForReview(
  "",nativeFullPage,["japanese"]),"");
console.log("Native full-text gaps become editable review lines without losing earlier scripts: passed.");


// A native recognizer can return a FULL different reading but the composer
// selects only block/line text when its content is inconsistent. Real raw
// native data must be kept independently; the existing processed candidate
// alone cannot recover this lost paragraph.
const inconsistentNative={
  text:"last and first\n日本語の文章",
  blocks:[{lines:[{text:"first"},{text:"last"}]}],
};
assert.equal(composeRecognizedText(inconsistentNative),"first\nlast");
const nativeDisagreement=extractNativeTextAlternative("japanese",inconsistentNative);
assert.ok(nativeDisagreement);
const edited= recoverNativeFullTextForReview(
  "Қазақша мәтін\n\nfirst\nlast",
  [{script:"japanese",text:composeRecognizedText(inconsistentNative)},
   {script:"japanese",text:inconsistentNative.text}],
  ["japanese"]);
assert.ok(edited.includes("日本語の文章"));
assert.ok(edited.includes("Қазақша мәтін"));
assert.ok(edited.includes("first\nlast"));
assert.equal(edited.match(/日本語の文章/g)?.length,1);
console.log("Original native full readings survive disagreement with block-only OCR: passed.");


// The review image must be rendered by the device's local WebView bridge.
// Never convert a remote image URL, and never leak it to a remote HTTP origin.
assert.equal(safeLocalOcrPreviewUrl("content://media/external/images/media/7",
  () => "http://localhost/_capacitor_content_/media/7"),
  "http://localhost/_capacitor_content_/media/7");
assert.equal(safeLocalOcrPreviewUrl("file:///data/user/0/wave/photo.jpg",
  () => "https://localhost/_capacitor_file_/wave/photo.jpg"),
  "https://localhost/_capacitor_file_/wave/photo.jpg");
assert.equal(safeLocalOcrPreviewUrl("https://example.com/photo.jpg",
  () => {throw new Error("Remote conversion must not execute");}),null);
assert.equal(safeLocalOcrPreviewUrl("content://media/external/images/media/7",
  () => "https://images.example.com/photo.jpg"),null);
assert.equal(safeLocalOcrPreviewUrl("/data/user/0/wave/photo.jpg",
  () => {throw new Error("Photo unavailable");}),null);
console.log("Local-only camera/photo review is safe and cannot fetch external images: passed.");


const strongRussian="Это достаточно длинный русский текст для проверки языка. ".repeat(4);
const strongEnglish="This document contains several correctly written English words and sentences. ".repeat(4);
assert.equal(confidentOcrPrimaryScript([
  {script:"latin",text:""},
  {script:"cyrillic",text:strongRussian,confidence:78},
]),"cyrillic");
assert.equal(confidentOcrPrimaryScript([
  {script:"latin",text:strongEnglish},
]),null); // Cyrillic detection must have run before Latin early stop.
assert.equal(confidentOcrPrimaryScript([
  {script:"latin",text:strongEnglish},
  {script:"cyrillic",text:""},
]),"latin");
assert.equal(confidentOcrPrimaryScript([
  {script:"latin",text:strongEnglish},
  {script:"cyrillic",text:strongRussian},
]),null);
assert.equal(confidentOcrPrimaryScript([
  {script:"latin",text:""},
  {script:"cyrillic",text:""},
  {script:"japanese",text:"こんにちは日本語の文章を読みます。".repeat(3)},
]),"japanese");
assert.equal(confidentOcrPrimaryScript([
  {script:"latin",text:""},
  {script:"cyrillic",text:""},
  {script:"japanese",text:"漢字漢字漢字漢字"},
]),null);
assert.equal(confidentOcrPrimaryScript([
  {script:"latin",text:"1434\n14:35"},
  {script:"cyrillic",text:"Всё"},
]),null);
console.log("Automatic OCR fast path stops only with strong single-script evidence: passed.");
