import assert from "node:assert/strict";
import relay from "../feedback-relay/index.mjs";

let calls = 0;
const previousFetch = globalThis.fetch;
let targetReply = {ok: true, result: {message_id: 17, chat: {id: -5591888667}}};
let targetStatus = 200;
globalThis.fetch = async (url, opts) => {
  calls++;
  assert.match(String(url), /^https:\/\/api\.telegram\.org\/bot/);
  assert.equal(opts.method, "POST");
  const payload = JSON.parse(opts.body);
  assert.equal(payload.chat_id, "-5591888667");
  assert.match(payload.text, /Тема: Тест/);
  return new Response(JSON.stringify(targetReply), {status: targetStatus});
};
const env = {TELEGRAM_BOT_TOKEN: "test_token_never_real",
  FEEDBACK_LIMITER: {limit: async () => ({success: true})}};
const req = (payload, url = "https://example.workers.dev/feedback", overrides = {}) =>
  new Request(url, {method: "POST", headers: {"content-type": "application/json",
    "cf-connecting-ip": "203.0.113.42", ...overrides},
    body: JSON.stringify(payload)});
try {
  let response = await relay.fetch(req({topic:"Тест",text:"Проверка"}), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.message_id, 17);
  assert.equal(calls, 1);
  response = await relay.fetch(req({topic:"",text:"Hi"}), env);
  assert.equal(response.status, 400); assert.equal(calls, 1);
  response = await relay.fetch(req({topic:"Тест",text:"x".repeat(3001)}), env);
  assert.equal(response.status, 400); assert.equal(calls, 1);
  response = await relay.fetch(req({topic:"Тест",text:"a".repeat(9000)}), env);
  assert.equal(response.status, 400); assert.equal(calls, 1);
  response = await relay.fetch(req({topic:"Тест",text:"Проверка"}), {...env,TELEGRAM_BOT_TOKEN:""});
  assert.equal(response.status, 503); assert.equal(calls, 1);
  response = await relay.fetch(req({topic:"Тест",text:"Проверка"}), {...env,FEEDBACK_LIMITER:{limit: async () => ({success:false})}});
  assert.equal(response.status, 429); assert.equal((await response.json()).kind,"rate_limit");
  assert.equal(calls, 1);
  // Reject malformed MIME, missing/invalid Cloudflare identity, and oversized request.
  response = await relay.fetch(req({topic:"Тест",text:"Проверка"}, undefined, {"content-type":"application/json-extra"}), env);
  assert.equal(response.status, 415); assert.equal(calls, 1);
  response = await relay.fetch(req({topic:"Тест",text:"Проверка"}, undefined, {"content-type":"application/json; charset=UTF-8"}), env);
  assert.equal(response.status, 200); assert.equal(calls, 2);
  response = await relay.fetch(req({topic:"Тест",text:"Проверка"}, undefined, {"cf-connecting-ip":""}), env);
  assert.equal(response.status, 403); assert.equal(calls, 2);
  response = await relay.fetch(req({topic:"Тест",text:"Проверка"}, undefined, {"content-length":"9000"}), env);
  assert.equal(response.status, 400); assert.equal(calls, 2);
  // Telegram's retry_after must survive the relay so Android can show an accurate message.
  targetStatus = 429;
  targetReply = {ok:false,error_code:429,parameters:{retry_after:83}};
  response = await relay.fetch(req({topic:"Тест",text:"Проверка"}),env);
  assert.equal(response.status,429); assert.equal((await response.json()).retryAfter,83);
  assert.equal(calls,3);
  targetStatus = 200;
  targetReply = {ok: true, result:{message_id:55,chat:{id:-1}}};
  response = await relay.fetch(req({topic:"Тест",text:"Проверка"}),env);
  assert.equal(response.status,502); assert.equal((await response.json()).uncertain,true);
  response = await relay.fetch(new Request("https://example.workers.dev/health"),env);
  assert.equal(response.status,200); assert.equal((await response.json()).ready,true);
  console.log("Feedback HTTPS relay: validation, rate limiting, private bot key and delivery confirmation checked");
} finally {globalThis.fetch = previousFetch;}
