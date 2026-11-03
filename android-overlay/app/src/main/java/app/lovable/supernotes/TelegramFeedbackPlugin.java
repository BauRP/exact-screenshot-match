package app.lovable.supernotes;

import android.content.pm.PackageInfo;
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
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import javax.net.ssl.HttpsURLConnection;

/**
 * One-way Telegram feedback from the offline Android APK. The token is passed
 * only at compile time through a private Gradle environment variable.
 *
 * IMPORTANT: A public APK cannot securely conceal this token. A token-bearing
 * test build must only be made available through an unpublished draft release.
 * Never print the connection URL, token, user text, or HTTP response body.
 */
@CapacitorPlugin(name = "TelegramFeedback")
public final class TelegramFeedbackPlugin extends Plugin {
    private static final long GROUP_ID = -5591888667L;
    private static final int MAX_TOPIC = 200;
    private static final int MAX_TEXT = 3000;
    private static final int CONNECT_TIMEOUT_MS = 8000;
    private static final int READ_TIMEOUT_MS = 12000;

    private JSObject failure(String kind, int status, int retryAfter, boolean uncertain) {
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

    private static String appLabel(android.content.Context context) {
        return context.getApplicationInfo().loadLabel(context.getPackageManager()).toString();
    }

    private String realVersion() {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            return info.versionName == null ? "неизвестна" : info.versionName;
        } catch (Exception ignored) {
            return "неизвестна";
        }
    }

    /** Plain text only; never use Telegram HTML/Markdown parse_mode. */
    private String message(String topic, String text) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss z", Locale.ROOT);
        format.setTimeZone(TimeZone.getDefault());
        return "💡 Новое пожелание — " + appLabel(getContext()) + "\n\n" +
            "Тип: Пожелание\n" +
            "Тема: " + topic + "\n" +
            "Версия приложения: " + realVersion() + "\n" +
            "Дата: " + format.format(new Date()) + "\n\n" +
            "Сообщение пользователя:\n" + text;
    }

    private static String readLimited(InputStream input) throws Exception {
        if (input == null) return "";
        try (InputStream stream = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[1024];
            int count;
            while ((count = stream.read(buffer)) != -1) {
                if (out.size() + count > 16384) throw new Exception("Telegram response too large");
                out.write(buffer, 0, count);
            }
            return out.toString("UTF-8");
        }
    }

    private JSObject deliver(String token, String topic, String text) {
        HttpsURLConnection connection = null;
        try {
            URL url = new URL("https://api.telegram.org/bot" + token + "/sendMessage");
            connection = (HttpsURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setDoOutput(true);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");

            JSONObject payload = new JSONObject();
            payload.put("chat_id", GROUP_ID);
            payload.put("text", message(topic, text));
            payload.put("disable_web_page_preview", true);
            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body);
            }
            int status = connection.getResponseCode();
            String response = readLimited(status >= 200 && status < 300
                ? connection.getInputStream() : connection.getErrorStream());
            JSONObject telegram = new JSONObject(response);
            if (status == 200 && telegram.optBoolean("ok", false)) {
                JSONObject sent = telegram.optJSONObject("result");
                JSONObject chat = sent == null ? null : sent.optJSONObject("chat");
                int messageId = sent == null ? 0 : sent.optInt("message_id", 0);
                if (chat != null && chat.optLong("id", 0) == GROUP_ID && messageId > 0) {
                    return success(messageId);
                }
                return failure("unconfirmed", status, 0, true);
            }
            JSONObject parameters = telegram.optJSONObject("parameters");
            int retryAfter = parameters == null ? 0
                : Math.min(3600, Math.max(0, parameters.optInt("retry_after", 0)));
            if (status == 429) return failure("rate_limit", status, retryAfter, false);
            if (status == 400) return failure("request", status, 0, false);
            if (status == 401) return failure("unauthorized", status, 0, false);
            if (status == 403) return failure("forbidden", status, 0, false);
            if (status >= 500) return failure("server", status, 0, true);
            return failure("rejected", status, 0, false);
        } catch (UnknownHostException error) {
            return failure("offline", 0, 0, false);
        } catch (SocketTimeoutException error) {
            // Telegram may have delivered the message even if the response timed out.
            // Never retry automatically because Bot API sendMessage has no dedupe key.
            return failure("timeout", 0, 0, true);
        } catch (Exception error) {
            return failure("network", 0, 0, true);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        String topic = call.getString("topic", "");
        String text = call.getString("text", "");
        if (topic == null || text == null || topic.trim().isEmpty() ||
            text.trim().isEmpty() || topic.length() > MAX_TOPIC ||
            text.length() > MAX_TEXT) {
            call.resolve(failure("invalid", 0, 0, false));
            return;
        }
        String token = BuildConfig.WAVE_FEEDBACK_BOT_TOKEN;
        if (token == null || token.isEmpty()) {
            call.resolve(failure("setup", 0, 0, false));
            return;
        }
        // Network I/O must never block the Android main thread.
        new Thread(() -> call.resolve(deliver(token, topic.trim(), text.trim())),
            "wave-feedback-http").start();
    }
}
