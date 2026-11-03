package app.lovable.supernotes;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import javax.net.ssl.HttpsURLConnection;

@CapacitorPlugin(name = "TelegramFeedback")
public final class TelegramFeedbackPlugin extends Plugin {

    private static final long GROUP_ID = -5591888667L;

    // Telegram-бот Tengri Studio Feedback
    private static final String BOT_TOKEN = "9182440482:AAEa10MIKzQNCXOmY14MR7j2Rn_8nqr3NAA";

    private static final int MAX_TOPIC = 200;
    private static final int MAX_TEXT = 3000;
    private static final int CONNECT_TIMEOUT_MS = 8000;
    private static final int READ_TIMEOUT_MS = 12000;

    private JSObject failure(
        String kind,
        int status,
        int retryAfter,
        boolean uncertain
    ) {
        JSObject out = new JSObject();
        out.put("ok", false);
        out.put("kind", kind);
        out.put("status", status);
        out.put("retryAfter", retryAfter);
        out.put("uncertain", uncertain);
        return out;
    }

    private JSObject success(int messageId) {
        JSObject out = new JSObject();
        out.put("ok", true);
        out.put("messageId", messageId);
        return out;
    }

    private static String readLimited(InputStream input)
        throws Exception {

        if (input == null) return "";

        try (
            InputStream stream = input;
            ByteArrayOutputStream output =
                new ByteArrayOutputStream()
        ) {
            byte[] buffer = new byte[1024];
            int count;

            while ((count = stream.read(buffer)) != -1) {
                if (output.size() + count > 16384) {
                    throw new Exception("Response too large");
                }
                output.write(buffer, 0, count);
            }

            return output.toString("UTF-8");
        }
    }

    private String createMessage(String topic, String text) {
        return "💡 Новое пожелание Wave Notes\n\n" +
            "Тема: " + topic + "\n\n" +
            "Сообщение пользователя:\n" + text;
    }

    private JSObject deliverDirect(
        String topic,
        String text
    ) {
        HttpsURLConnection connection = null;

        try {
            URL url = new URL(
                "https://api.telegram.org/bot" +
                BOT_TOKEN +
                "/sendMessage"
            );

            connection =
                (HttpsURLConnection) url.openConnection();

            connection.setRequestMethod("POST");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setDoOutput(true);
            connection.setInstanceFollowRedirects(false);

            connection.setRequestProperty(
                "Content-Type",
                "application/json; charset=utf-8"
            );

            JSONObject payload = new JSONObject();

            payload.put("chat_id", GROUP_ID);
            payload.put("text", createMessage(topic, text));

            byte[] body = payload.toString()
                .getBytes(StandardCharsets.UTF_8);

            connection.setFixedLengthStreamingMode(
                body.length
            );

            try (
                OutputStream output =
                    connection.getOutputStream()
            ) {
                output.write(body);
            }

            int status = connection.getResponseCode();

            if (status >= 300 && status < 400) {
                return failure(
                    "rejected", status, 0, false
                );
            }

            String response = readLimited(
                status >= 200 && status < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream()
            );

            JSONObject telegram = new JSONObject(response);

            if (
                status == 200 &&
                telegram.optBoolean("ok", false)
            ) {
                JSONObject sent =
                    telegram.optJSONObject("result");

                JSONObject chat = sent == null
                    ? null
                    : sent.optJSONObject("chat");

                int messageId = sent == null
                    ? 0
                    : sent.optInt("message_id", 0);

                if (
                    chat != null &&
                    chat.optLong("id", 0) == GROUP_ID &&
                    messageId > 0
                ) {
                    return success(messageId);
                }

                return failure(
                    "unconfirmed", status, 0, true
                );
            }

            JSONObject parameters =
                telegram.optJSONObject("parameters");

            int retryAfter = parameters == null
                ? 0
                : Math.min(
                    3600,
                    Math.max(
                        0,
                        parameters.optInt("retry_after", 0)
                    )
                );

            if (status == 429) {
                return failure(
                    "rate_limit", status, retryAfter, false
                );
            }

            if (status == 401) {
                return failure(
                    "unauthorized", status, 0, false
                );
            }

            if (status == 403) {
                return failure(
                    "forbidden", status, 0, false
                );
            }

            if (status == 400) {
                return failure(
                    "request", status, 0, false
                );
            }

            if (status >= 500) {
                return failure(
                    "server", status, 0, true
                );
            }

            return failure(
                "rejected", status, 0, false
            );

        } catch (UnknownHostException error) {
            return failure(
                "offline", 0, 0, false
            );

        } catch (SocketTimeoutException error) {
            return failure(
                "timeout", 0, 0, true
            );

        } catch (Exception error) {
            return failure(
                "network", 0, 0, true
            );

        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    @PluginMethod
    public void send(PluginCall call) {

        String topic = call.getString("topic", "");
        String text = call.getString("text", "");

        if (
            topic == null ||
            text == null ||
            topic.trim().isEmpty() ||
            text.trim().isEmpty() ||
            topic.length() > MAX_TOPIC ||
            text.length() > MAX_TEXT
        ) {
            call.resolve(
                failure("invalid", 0, 0, false)
            );
            return;
        }

        if (
            BOT_TOKEN.isEmpty() ||
            BOT_TOKEN.equals("ВСТАВЬ_РЕАЛЬНЫЙ_ТОКЕН")
        ) {
            call.resolve(
                failure("setup", 0, 0, false)
            );
            return;
        }

        final String cleanTopic = topic.trim();
        final String cleanText = text.trim();

        // Не блокировать главный поток Android.
        new Thread(
            () -> call.resolve(
                deliverDirect(cleanTopic, cleanText)
            ),
            "wave-feedback-http"
        ).start();
    }
}
