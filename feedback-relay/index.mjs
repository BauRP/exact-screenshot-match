// Wave Notes HTTPS feedback relay. Secrets stay on the server, never in the APK.
// No CORS: only the native Android HTTP client uses this endpoint.
const CHAT_ID = "-5591888667";
const MAX_BODY_BYTES = 8192;
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i;
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store", "x-content-type-options": "nosniff"
  } });
}
function fail(kind, status, retryAfter = 0, uncertain = false) {
  return json({ok: false, kind, retryAfter, uncertain}, status);
}
async function readJson(request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
    throw new Error("invalid length");
  }
  if (!request.body) throw new Error("empty");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("large");
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
}
export default {
  async fetch(request, env) {
    const {pathname, search} = new URL(request.url);
    if (pathname === "/health" && request.method === "GET") {
      return json({ready: Boolean(env.TELEGRAM_BOT_TOKEN && env.FEEDBACK_LIMITER)}, env.TELEGRAM_BOT_TOKEN && env.FEEDBACK_LIMITER ? 200 : 503);
    }
    if (pathname !== "/feedback" || search) return fail("not_found", 404);
    if (request.method !== "POST") return fail("method", 405);
    if (!env.TELEGRAM_BOT_TOKEN || !env.FEEDBACK_LIMITER) return fail("setup", 503);
    if (!JSON_CONTENT_TYPE.test((request.headers.get("content-type") || "").trim())) return fail("invalid", 415);

    let content;
    try { content = await readJson(request); }
    catch { return fail("invalid", 400); }
    const topic = typeof content?.topic === "string" ? content.topic.trim() : "";
    const text = typeof content?.text === "string" ? content.text.trim() : "";
    if (!topic || !text || topic.length > 200 || text.length > 3000) return fail("invalid", 400);

    // Cloudflare provides this header. Do not trust X-Forwarded-For.
    // Approximate, per-location limit; high-volume global abuse requires additional protection.
    const ip = request.headers.get("cf-connecting-ip");
    if (!ip || ip.length > 64) return fail("invalid", 403);
    try {
      const allowed = await env.FEEDBACK_LIMITER.limit({key: ip});
      if (!allowed.success) return fail("rate_limit", 429, 60);
    } catch { return fail("server", 503); }

    const message = "💡 Новое пожелание — Wave Notes\n\nТема: " + topic +
      "\nДата (UTC): " + new Date().toISOString() + "\n\nСообщение пользователя:\n" + text;
    let response;
    try {
      response = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({chat_id: CHAT_ID, text: message, disable_web_page_preview: true}),
        signal: AbortSignal.timeout(12000)
      });
    } catch { return fail("timeout", 504, 0, true); }
    if (response.status === 429) {
      let retryAfter = 60;
      try {
        const body = await response.json();
        const seconds = body?.parameters?.retry_after;
        if (Number.isInteger(seconds) && seconds > 0) retryAfter = Math.min(3600, seconds);
      } catch { /* Rate-limit responses can be empty; keep a safe default. */ }
      return fail("rate_limit", 429, retryAfter);
    }
    if (response.status === 401) return fail("unauthorized", 502);
    if (response.status === 403) return fail("forbidden", 502);
    if (response.status === 400) return fail("request", 400);
    if (response.status >= 500) return fail("server", 502, 0, true);
    if (!response.ok) return fail("rejected", 502);
    let result;
    try { result = await response.json(); }
    catch { return fail("unconfirmed", 502, 0, true); }
    if (result?.ok === true && String(result.result?.chat?.id) === CHAT_ID &&
      Number.isInteger(result.result?.message_id) && result.result.message_id > 0) {
      return json({ok: true, result: {message_id: result.result.message_id, chat: {id: Number(CHAT_ID)}}});
    }
    return fail("unconfirmed", 502, 0, true);
  }
};
