import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const java=readFileSync("android-overlay/app/src/main/java/app/lovable/supernotes/TelegramFeedbackPlugin.java","utf8");
const gradle=readFileSync("android-overlay/app/build.gradle","utf8");
const worker=readFileSync("feedback-relay/index.mjs","utf8");
assert.ok(gradle.includes('buildConfigField "String", "WAVE_FEEDBACK_RELAY_URL"'));
assert.ok(gradle.includes('https:'));
assert.ok(java.includes("BuildConfig.WAVE_FEEDBACK_RELAY_URL"));
assert.ok(java.includes('private JSObject deliverViaRelay(String topic, String text)'));
const send=java.slice(java.indexOf("    @PluginMethod"));
assert.ok(send.includes('relayUrl.isEmpty()'));
assert.ok(send.includes('? deliverDirect(cleanTopic, cleanText)'));
assert.ok(send.includes(': deliverViaRelay(cleanTopic, cleanText)'));
assert.ok(!send.includes('deliverDirect(cleanTopic, cleanText) : deliverDirect'));
for(const marker of [
 'connection.setInstanceFollowRedirects(false)',
 'connection.setConnectTimeout(CONNECT_TIMEOUT_MS)',
 'connection.setReadTimeout(READ_TIMEOUT_MS)',
 'payload.put("topic", topic)',
 'payload.put("text", text)',
 '"https".equals(url.getProtocol())',
 'deliveredChat.optLong("id", 0) == GROUP_ID',
 'return failure("unconfirmed", status, 0, true)',
 'url.getHost().isEmpty()',
 'url.getPort() != 443'
])assert.ok(java.includes(marker),marker);
const relayMethod = java.slice(java.indexOf('private JSObject deliverViaRelay('),java.indexOf('private JSObject deliverDirect('));
assert.ok(relayMethod.includes('deliveredChat.optLong("id", 0) == GROUP_ID'),"Relay must verify destination group");
assert.ok(relayMethod.includes('return failure("unconfirmed", status, 0, true)'),"Invalid HTTP 200 is uncertain");
assert.ok(worker.includes('env.TELEGRAM_BOT_TOKEN'),"Worker must own Telegram credential");
assert.ok(worker.includes('env.FEEDBACK_LIMITER'),"Worker must limit untrusted requests");
assert.ok(!worker.includes('Access-Control-Allow-Origin'),"Keep worker native-only by default");
console.log("Configured HTTPS relay is preferred; direct debug feedback is not retried after relay failure");
