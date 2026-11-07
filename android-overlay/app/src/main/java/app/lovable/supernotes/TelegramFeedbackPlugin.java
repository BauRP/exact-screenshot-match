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
import java.util.concurrent.atomic.AtomicBoolean;

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

    // Prevent overlapping native sends even if the JavaScript button guard is bypassed.
    private final AtomicBoolean sending = new AtomicBoolean(false);

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

    /** Use the HTTPS Worker when its URL is explicitly configured in the APK.
     * The bot credential stays on the Worker. Never silently fall back to
     * direct Telegram on timeout/unconfirmed results: it could send twice. */
    private JSObject deliverViaRelay(String topic, String text) {
        HttpsURLConnection connection = null;
        try {
            String endpoint = BuildConfig.WAVE_FEEDBACK_RELAY_URL;
            URL url = new URL(endpoint);
            if (!"https".equals(url.getProtocol())
                || !"/feedback".equals(url.getPath())
                || url.getHost() == null
                || url.getHost().isEmpty()
                || (url.getPort() != -1 && url.getPort() != 443)
                || url.getUserInfo() != null
                || url.getQuery() != null
                || url.getRef() != null) {
                return failure("setup", 0, 0, false);
            }

            connection = (HttpsURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setDoOutput(true);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            JSONObject payload = new JSONObject();
            payload.put("topic", topic);
            payload.put("text", text);
            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body);
            }

            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) return failure("rejected", status, 0, false);
            String response = readLimited(
                status >= 200 && status < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream()
            );
            JSONObject result = new JSONObject(response);
            JSONObject delivered = result.optJSONObject("result");
            JSONObject deliveredChat = delivered == null ? null : delivered.optJSONObject("chat");
            int messageId = delivered == null ? 0 : delivered.optInt("message_id", 0);
            if (status == 200) {
                // A message ID alone does not prove delivery to our intended group.
                // A malformed 200 response is uncertain: never encourage automatic retry.
                if (result.optBoolean("ok", false) && messageId > 0
                    && deliveredChat != null && deliveredChat.optLong("id", 0) == GROUP_ID) {
                    return success(messageId);
                }
                return failure("unconfirmed", status, 0, true);
            }
            String kind = result.optString("kind", "rejected");
            int retryAfter = Math.min(3600, Math.max(0, result.optInt("retryAfter", 0)));
            boolean uncertain = result.optBoolean("uncertain", false);
            if (status >= 500 && !result.has("uncertain")) uncertain = true;
            return failure(kind, status, retryAfter, uncertain);

        } catch (UnknownHostException error) {
            return failure("offline", 0, 0, false);
        } catch (SocketTimeoutException error) {
            return failure("timeout", 0, 0, true);
        } catch (Exception error) {
            return failure("network", 0, 0, true);
        } finally {
            if (connection != null) connection.disconnect();
        }
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

        final String relayUrl = BuildConfig.WAVE_FEEDBACK_RELAY_URL;
        // The credential-bearing legacy route remains only for debug builds
        // that have no configured relay; do not disable working user feedback.
        if (relayUrl.isEmpty() && (
            BOT_TOKEN.isEmpty() ||
            BOT_TOKEN.equals("ВСТАВЬ_РЕАЛЬНЫЙ_ТОКЕН")
        )) {
            call.resolve(failure("setup", 0, 0, false));
            return;
        }

        final String cleanTopic = topic.trim();
        final String cleanText = text.trim();

        // Guard at the native boundary as well as in the React form.
        if (!sending.compareAndSet(false, true)) {
            call.resolve(failure("busy", 0, 0, false));
            return;
        }

        // Never hold the UI thread while talking to Telegram.
        try {
            new Thread(
                () -> {
                    JSObject result;
                    try {
                        result = relayUrl.isEmpty()
                            ? deliverDirect(cleanTopic, cleanText)
                            : deliverViaRelay(cleanTopic, cleanText);
                    } catch (RuntimeException error) {
                        result = failure("network", 0, 0, true);
                    } finally {
                        // Every network outcome, including timeouts, releases the guard.
                        sending.set(false);
                    }
                    call.resolve(result);
                },
                "wave-feedback-http"
            ).start();
        } catch (RuntimeException error) {
            // A failed thread start must not lock feedback until app restart.
            sending.set(false);
            call.resolve(failure("network", 0, 0, false));
        }
    }
}
