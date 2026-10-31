import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const FeedbackInput = z.object({
  topic: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(4000),
});

const CHAT_ID = "8345856853";

export const sendFeedback = createServerFn({ method: "POST" })
  .validator((data) => FeedbackInput.parse(data))
  .handler(async ({ data }) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN is not configured");
      return { ok: false } as const;
    }

    const message =
      `💡 Новая идея:\n\n` +
      `Тема: ${data.topic}\n` +
      `Что улучшить: ${data.text}`;

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            text: message,
            disable_web_page_preview: true,
          }),
        },
      );
      // Success is reported ONLY on an explicit 200 OK response.
      if (res.status !== 200) {
        console.error("Telegram sendMessage failed", res.status, await res.text());
        return { ok: false, status: res.status } as const;
      }
      return { ok: true, status: 200 } as const;
    } catch (err) {
      console.error("Telegram sendMessage error", err);
      return { ok: false, status: 0 } as const;
    }
  });
