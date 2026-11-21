/** Classify native Google UMP and Mobile Ads failures without inventing success.
 * The diagnostic is local only; no notes, identifiers, or logs are uploaded.
 */
export type AdFailureStage = "bridge" | "consent" | "form" | "sdk" | "native";
export type AdFailure = {
  label: string;
  advice: string;
  retryable: boolean;
  code: string;
};

function detail(error: unknown): { message: string; numericCode?: number } {
  if (error && typeof error === "object") {
    const obj = error as {message?: unknown; code?: unknown};
    const message = typeof obj.message === "string" ? obj.message : String(error);
    const value = typeof obj.code === "number" ? obj.code :
      typeof obj.code === "string" && /^\d+$/.test(obj.code) ? Number(obj.code) : undefined;
    return { message, numericCode: value };
  }
  return { message: String(error) };
}

export function classifyAdMobFailure(error: unknown, stage: AdFailureStage): AdFailure {
  const { message, numericCode } = detail(error);
  const text = message.toLowerCase();
  if (/no form\(s\) configured|no forms configured|publisher misconfiguration|failed to read publisher.s account configuration/.test(text)) {
    return {
      label: "Google UMP не нашёл опубликованную форму согласия",
      advice: "В AdMob форма Wave Notes опубликована. Проверьте ID приложения; обновление Google может распространиться не сразу. Повторите проверку позже.",
      code: "UMP_FORM_NOT_READY", retryable: false,
    };
  }
  if (stage === "consent" || stage === "form") {
    if (/network|internet|connection|timeout|timed out|unreachable/.test(text) || numericCode === 2) {
      return { label: "Не удалось связаться с Google для проверки согласия",
        advice: "Проверьте подключение к интернету и повторите запрос.", code: "UMP_NETWORK", retryable: true };
    }
    return { label: "Не удалось проверить согласие Google",
      advice: "Реклама не запрашивается до разрешения Google. Нажмите «Повторить» позже.",
      code: "UMP_ERROR", retryable: false };
  }
  if (stage === "bridge") {
    return {label:"Нативный плагин AdMob не подключён",
      advice:"Проверьте, что установлена новая Android-сборка Wave Notes.", code:"BRIDGE_ERROR", retryable:true};
  }
  if (stage === "native") {
    if (numericCode === 3 || /no fill|no ad to show|no ads available/.test(text)) {
      return {label:"Google пока не предоставил объявление",
        advice:"Это отсутствие рекламы, а не поломка приложения. Повторите позже.",
        code:"AD_NO_FILL", retryable:false};
    }
    if (numericCode === 2 || /network|internet|connection|timeout|timed out/.test(text)) {
      return {label:"Ошибка сети при загрузке объявления",
        advice:"Проверьте интернет. Повторите загрузку позже.", code:"AD_NETWORK", retryable:true};
    }
    if (numericCode === 1 || /invalid request|invalid ad unit|invalid.*adid|missing ad id/.test(text)) {
      return {label:"Google отклонил настройки рекламного блока",
        advice:"Проверьте идентификатор рекламного блока и статус приложения в AdMob.",
        code:"AD_CONFIGURATION", retryable:false};
    }
  }
  if (/network|internet|connection|timeout|timed out/.test(text)) {
    return {label:stage==="sdk"?"Не удалось запустить Google Mobile Ads из-за сети":"Ошибка подключения Google",
      advice:"Проверьте интернет и повторите попытку.", code:"NETWORK",retryable:true};
  }
  return {label:stage==="sdk"?"Не удалось запустить Google Mobile Ads":"Ошибка загрузки нативной рекламы",
    advice:"Технические подробности сохранены ниже. Нажмите «Повторить», если ошибка сохраняется.",
    code:stage==="sdk"?"ADS_SDK_ERROR":"NATIVE_AD_ERROR",retryable:stage==="sdk"};
}
