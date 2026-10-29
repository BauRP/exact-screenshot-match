/**
 * A user leaving the camera or gallery is not an OCR failure.
 * Capacitor's legacy getPhoto API returns human-readable messages; the
 * newer camera methods may return the documented OS-PLUG-CAMR codes.
 * Restrict matching to explicit cancellations, never permission failures.
 */
export function isCameraCancellation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return typeof error === "string" && /user cancel(?:led|ed)|operation (?:was )?cancel(?:led|ed)/i.test(error);
  }
  const item = error as { code?: unknown; message?: unknown };
  if (item.code === "OS-PLUG-CAMR-0006" || item.code === "OS-PLUG-CAMR-0020") return true;
  const message = typeof item.message === "string" ? item.message : "";
  return /user cancel(?:led|ed)|user (?:dismissed|closed)|(?:photo|image|process|operation|selection) (?:was )?cancel(?:led|ed)|no image (?:was )?selected/i.test(message);
}

export function readableOcrFailure(error: unknown): string {
  // A persisted note can fail even though OCR recognized text successfully.
  const detail = error instanceof Error ? error.message : "";
  if (/Unable to save notes|Notes storage has an error|Storage write failed|quota.exceeded|local notes storage is unavailable/i.test(detail)) {
    return "Текст распознан, но заметку сохранить не удалось. Проверьте свободное место и состояние хранилища.";
  }
  if (error instanceof Error && error.message === "OCR_NOTE_SAVED_EDITOR_NOT_OPENED") {
    return "Текст успешно сохранён в заметках, но редактор не открылся. Откройте сохранённую заметку из списка. Повторно сканировать фотографию не нужно.";
  }
  if (error instanceof Error && error.message === "OCR_SAVED_NOTE_NOT_FOUND") {
    return "Сохранённая заметка больше не найдена. Проверьте список заметок.";
  }
  if (error instanceof Error && error.message === "OCR_NOTE_SAVE_FAILED") {
    return "Не удалось подтвердить сохранение заметки. Проверьте хранилище и повторите попытку.";
  }
  if (error instanceof Error && error.message === "OCR_SCAN_BUSY") {
    return "Предыдущее сканирование ещё завершается. Повторите попытку после его окончания.";
  }
  if (error instanceof Error && error.message === "OCR_COMBINED_REVIEW") {
    return "Текст распознан, но несколько проверок требуют внимания. " +
      "Проверьте исходную фотографию, оба варианта иероглифов и возможные пропущенные строки перед сохранением.";
  }
  if (error instanceof Error && error.message === "OCR_SCRIPT_OMISSION_REVIEW") {
    return "Обнаружена короткая надпись на другом языке, которая могла исчезнуть при объединении строк. Найденный фрагмент сохранён для проверки перед созданием заметки.";
  }
  if (error instanceof Error && error.message === "OCR_LARGE_LAYOUT_REVIEW") {
    return "Обнаружен большой документ. Чтобы избежать зависания, результаты языковых моделей сохранены раздельно для проверки порядка строк.";
  }
  if (error instanceof Error && error.message === "OCR_LIMITED_LANGUAGE_SELECTION") {
    return "Проверены только выбранные языки. Проверьте результат и подтвердите сохранение.";
  }
  if (error instanceof Error && error.message === "OCR_NATIVE_TEXT_CONFLICT") {
    return "Распознаватель вернул разные символы в полном тексте и отдельных строках. Проверьте результат перед сохранением.";
  }
  if (error instanceof Error && error.message === "OCR_MIXED_LAYOUT_REVIEW") {
    return "На фотографии есть несколько языков, но порядок строк ненадёжен. Проверьте текст перед сохранением.";
  }
  if (error instanceof Error && error.message === "OCR_HAN_LANGUAGE_AMBIGUITY") {
    return "Китайский и японский распознаватели получили разные иероглифы. Текст сохранится только после вашего подтверждения; проверьте его или выберите язык вручную.";
  }
  if (error instanceof Error && error.message === "OCR_INCOMPLETE_WITH_TEXT") {
    return "Часть текста распознана, но не все языки проверены. Можно сохранить найденное с пометкой «неполное» или повторить сканирование.";
  }
  if (error instanceof Error && error.message === "OCR_MODELS_INCOMPLETE") {
    return "Не все языковые модели смогли завершить распознавание. Неполная заметка не сохранена. Выберите язык вручную и повторите сканирование.";
  }
  if (error instanceof Error && error.message === "OCR timed out") {
    return "Сканирование заняло слишком много времени. Попробуйте выбрать язык вручную или другое фото.";
  }
  const message = error && typeof error === "object" &&
    "message" in error && typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message : "";
  if (/permission|denied|not authorized|access wasn't provided/i.test(message)) {
    return "Нет доступа к камере или галерее. Проверьте разрешения приложения.";
  }
  if (/invalid image|unreadable|cannot decode|could not prepare the photo|no readable local path/i.test(message)) {
    return "Фотография не читается. Выберите другое изображение.";
  }
  if (/not enough memory|outofmemory|out of memory|insufficient memory|allocation/i.test(message)) {
    return "Не хватило памяти для обработки фотографии. Попробуйте снимок меньшего размера.";
  }
  return "Не удалось распознать текст. Попробуйте другое фото или укажите язык вручную.";
}
