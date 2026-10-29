import {
  OcrAmbiguousHanError, OcrCombinedReviewError,
  OcrIncompleteScanError, OcrLargeLayoutReviewError,
  OcrLimitedSelectionReviewError, OcrMixedLayoutReviewError,
  OcrNativeTextReviewError, OcrOmittedScriptReviewError,
} from "./ocr-partial";

/** Readable OCR text is a note; internal uncertainty is never a UI task. */
export function usableTextFromOcrWarning(error:unknown):string|null {
  if(error instanceof OcrIncompleteScanError)
    return error.partialText.trim()?error.partialText:null;
  if(error instanceof OcrCombinedReviewError ||
     error instanceof OcrAmbiguousHanError ||
     error instanceof OcrMixedLayoutReviewError ||
     error instanceof OcrLimitedSelectionReviewError ||
     error instanceof OcrNativeTextReviewError ||
     error instanceof OcrLargeLayoutReviewError ||
     error instanceof OcrOmittedScriptReviewError)
    return error.recognizedText.trim()?error.recognizedText:null;
  return null;
}

/** Remove only known prefixes historically inserted by the application.
 * Never rewrite the user's Japanese, Kazakh, Chinese or other OCR content.
 */
export function plainOcrNoteText(input:string):string {
  const oldPrefixes=[
    "⚠️ В тексте найден короткий фрагмент другого языка",
    "⚠️ Китайский и японский текст могли быть распознаны неоднозначно",
    "⚠️ Языки распознаны, но расположение строк на фотографии",
    "⚠️ Проверены только выбранные языки",
    "⚠️ Полный текст и отдельные строки распознавания",
    "⚠️ На фотографии слишком много распознанных строк",
    "⚠️ Текст восстановлен несколькими проверками одной фотографии",
    "⚠️ Не завершены проверки",
  ];
  const boundary=input.indexOf("\n\n");
  if(boundary<0||boundary>450)return input;
  const banner=input.slice(0,boundary);
  return oldPrefixes.some(prefix=>banner.startsWith(prefix))
    ? input.slice(boundary+2) : input;
}
