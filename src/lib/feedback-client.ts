import { Capacitor, registerPlugin } from "@capacitor/core";

export type FeedbackResult =
  | { ok: true; messageId?: number }
  | { ok: false; kind: string; status?: number; retryAfter?: number; uncertain?: boolean };

const native = registerPlugin<{
  send(values: { topic: string; text: string }): Promise<FeedbackResult>;
}>("TelegramFeedback");

export function validateFeedback(topic: string, text: string): string | null {
  if (!topic.trim() || !text.trim()) return "Укажите тему и напишите сообщение.";
  if (topic.length > 200) return "Тема слишком длинная (максимум 200 символов).";
  if (text.length > 3000) return "Сообщение слишком длинное (максимум 3000 символов).";
  return null;
}

export function feedbackFailureMessage(result: FeedbackResult): string {
  if (result.ok) return "";
  if (result.uncertain) {
    return "Не удалось подтвердить доставку. Сообщение могло прийти. Перед повтором проверьте Telegram, чтобы не отправить дубликат.";
  }
  switch (result.kind) {
    case "setup": return "Разработчик ещё не подключил Telegram к этой сборке приложения.";
    case "offline": return "Нет интернета. Сообщение сохранено как черновик.";
    case "rate_limit": return result.retryAfter
      ? \`Telegram временно ограничил отправку. Попробуйте через \${result.retryAfter} секунд.\`
      : "Telegram временно ограничил отправку. Попробуйте позже.";
    case "unauthorized": return "Telegram отклонил ключ бота. Сообщите разработчику.";
    case "forbidden": return "У бота нет права отправлять сообщения в группу.";
    case "invalid": return "Проверьте тему и длину сообщения.";
    case "request": return "Telegram отклонил сообщение. Проверьте его длину.";
    case "server": return "Telegram временно недоступен. Сообщение осталось черновиком.";
    default: return "Не удалось отправить. Сообщение осталось черновиком.";
  }
}

export async function sendNativeFeedback(topic: string, text: string): Promise<FeedbackResult> {
  const error = validateFeedback(topic, text);
  if (error) return {ok:false,kind:"invalid",uncertain:false};
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return {ok:false,kind:"setup",uncertain:false};
  }
  try {
    return await native.send({topic: topic.trim(), text: text.trim()});
  } catch {
    // The Capacitor bridge may have lost the response after Telegram received
    // the request. Preserve draft and show an uncertainty warning.
    return {ok:false,kind:"unconfirmed",uncertain:true};
  }
}

export const FEEDBACK_DRAFT_KEY = "wave.feedback.draft.v1";
export function saveFeedbackDraft(topic: string, text: string): void {
  try { localStorage.setItem(FEEDBACK_DRAFT_KEY, JSON.stringify({topic,text})); } catch {}
}
export function loadFeedbackDraft(): {topic:string;text:string} {
  try {
    const value = JSON.parse(localStorage.getItem(FEEDBACK_DRAFT_KEY) || "{}");
    return {topic:typeof value.topic==="string"?value.topic.slice(0,200):"",
      text:typeof value.text==="string"?value.text.slice(0,3000):""};
  } catch { return {topic:"",text:""}; }
}
export function clearFeedbackDraft(): void {
  try { localStorage.removeItem(FEEDBACK_DRAFT_KEY); } catch {}
}
