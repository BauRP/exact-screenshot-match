
import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";

import {
  validateFeedback,
  feedbackFailureMessage,
  saveFeedbackDraft,
  loadFeedbackDraft,
  clearFeedbackDraft
} from "../src/lib/feedback-client";

const memory = new Map<string, string>();

(globalThis as any).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  }
};

// Проверка формы отзывов
assert.equal(
  validateFeedback(
    "Пожелание",
    "Здравствуйте! Қазақша 🇰🇿"
  ),
  null
);

assert.equal(
  validateFeedback("Feedback", "Emoji 🤖 ✅ <&>"),
  null
);

assert.ok(validateFeedback("", "hello"));
assert.ok(validateFeedback("Topic", ""));
assert.ok(validateFeedback("x".repeat(201), "hello"));
assert.ok(validateFeedback("Topic", "x".repeat(3001)));

assert.equal(
  validateFeedback("Topic", "x".repeat(3000)),
  null
);

// Проверка сохранения черновика
saveFeedbackDraft("Тема", "Сообщение 🎉");

assert.deepEqual(
  loadFeedbackDraft(),
  {
    topic: "Тема",
    text: "Сообщение 🎉"
  }
);

clearFeedbackDraft();

assert.deepEqual(
  loadFeedbackDraft(),
  {
    topic: "",
    text: ""
  }
);

// Проверка сообщений об ошибках
assert.match(
  feedbackFailureMessage({
    ok: false,
    kind: "offline"
  }),
  /интернет/i
);

assert.match(
  feedbackFailureMessage({
    ok: false,
    kind: "rate_limit",
    retryAfter: 19
  }),
  /19/
);

assert.match(
  feedbackFailureMessage({
    ok: false,
    kind: "timeout",
    uncertain: true
  }),
  /могло прийти/i
);

// Проверка Android-кода
const java = readFileSync(
  "android-overlay/app/src/main/java/app/lovable/supernotes/TelegramFeedbackPlugin.java",
  "utf8"
);

const settings = readFileSync(
  "src/routes/settings.tsx",
  "utf8"
);

const main = readFileSync(
  "android-overlay/app/src/main/java/app/lovable/supernotes/MainActivity.java",
  "utf8"
);

// Проверка подключения плагина
assert.ok(
  main.includes(
    "registerPlugin(TelegramFeedbackPlugin.class)"
  )
);

// Проверка отправки напрямую в Telegram
const markers = [
  "HttpsURLConnection",
  'setRequestMethod("POST")',
  "getOutputStream()",
  "getResponseCode()",
  'optBoolean("ok", false)',
  'optLong("id", 0) == GROUP_ID',
  "messageId > 0",
  "READ_TIMEOUT_MS",
  "CONNECT_TIMEOUT_MS",
  "UnknownHostException",
  "SocketTimeoutException",
  "new Thread(",
  "deliverDirect(",
  "api.telegram.org/bot",
  'payload.put("chat_id", GROUP_ID)',
  "createMessage(topic, text)"
];

for (const marker of markers) {
  assert.ok(
    java.includes(marker),
    `Missing Android marker: ${marker}`
  );
}

// Правильная Telegram-группа
assert.ok(
  java.includes("GROUP_ID = -5591888667L")
);

// Токен должен присутствовать в настройке Java.
// Значение токена в тестах и логах не печатается.
const tokenDeclaration = java.match(
  /private static final String BOT_TOKEN\s*=\s*"([^"]+)";/
);

assert.ok(
  tokenDeclaration,
  "BOT_TOKEN declaration is missing"
);

assert.ok(
  /^\d{6,12}:[A-Za-z0-9_-]{25,}$/.test(
    tokenDeclaration[1]
  ),
  "Telegram token is missing or has an invalid format"
);

// When an HTTPS Worker URL is configured, use it instead of a direct
// Telegram request. No automatic legacy fallback on uncertain delivery.
assert.ok(java.includes('private JSObject deliverViaRelay(String topic, String text)'));
assert.ok(java.includes('BuildConfig.WAVE_FEEDBACK_RELAY_URL'));

// Проверка формы в настройках
assert.ok(
  settings.includes(
    "saveFeedbackDraft(fbTopic,fbText)"
  )
);

assert.ok(
  settings.includes(
    "clearFeedbackDraft()"
  )
);

assert.ok(
  settings.includes(
    "Ваше сообщение будет отправлено разработчику"
  )
);

assert.ok(
  !settings.includes('FeedbackEmail"'),
  "Feedback must not fall back to email in Android"
);

console.log(
  "Telegram feedback structure and direct Bot API configuration checked"
);

// The existing direct path stays available to preserve prior debug builds;
// when WAVE_FEEDBACK_RELAY_URL is configured, HTTPS relay always wins, and
// there is no direct fallback even for uncertain delivery outcomes.
for(const marker of [
 "BuildConfig.WAVE_FEEDBACK_RELAY_URL",
 'private JSObject deliverViaRelay(String topic, String text)',
 '!"https".equals(url.getProtocol())',
 '"/feedback".equals(url.getPath())',
 'payload.put("topic", topic)',
 'payload.put("text", text)',
 'relayUrl.isEmpty()',
 '? deliverDirect(cleanTopic, cleanText)',
 ': deliverViaRelay(cleanTopic, cleanText)',
 'deliveredChat.optLong("id", 0) == GROUP_ID',
 'return failure("unconfirmed", status, 0, true)'
])assert.ok(java.includes(marker),"Missing relay safety contract: "+marker);
const relayMethod = java.slice(java.indexOf("private JSObject deliverViaRelay("), java.indexOf("private JSObject deliverDirect("));
assert.ok(relayMethod.includes('deliveredChat.optLong("id", 0) == GROUP_ID'), "Relay must verify Telegram destination group");
assert.ok(relayMethod.includes('return failure("unconfirmed", status, 0, true)'), "Ambiguous HTTP 200 must preserve draft");
const relayBranch=java.substring(java.indexOf('final String relayUrl ='),java.indexOf('"wave-feedback-http"'));
assert.ok(relayBranch.includes('relayUrl.isEmpty()'));
assert.ok(!relayBranch.includes('deliverDirect(cleanTopic, cleanText)\n                    : deliverDirect'),"No direct fallback on relay errors");
