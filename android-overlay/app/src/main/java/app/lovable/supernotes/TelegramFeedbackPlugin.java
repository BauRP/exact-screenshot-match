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
import java.net.URI;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;

/**
 * One-way HTTPS feedback for the Android APK. The Telegram bot credential
 * exists only on the private relay, not in Android BuildConfig or the APK.
 * Never log the user's message or the HTTP response payload.
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

    /**
     * Production sends to an independently deployed HTTPS relay. The bot token
     * stays in the relay environment and must never be shipped in a public APK.
     */
    private JSObject deliverViaRelay(String relayUrl, String topic, String text) {
        HttpsURLConnection connection = null;
        try {
            URI uri = new URI(relayUrl);
            if (!"https".equalsIgnoreCase(uri.getScheme()) ||
                uri.getUserInfo() != null || uri.getHost() == null ||
                uri.getFragment() != null || uri.getQuery() != null ||
                !"/feedback".equals(uri.getPath())) {
                return failure("setup", 0, 0, false);
            }
            URL url = uri.toURL();
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
            try (OutputStream output = connection.getOutputStream()) { output.write(body); }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) return failure("rejected", status, 0, false);
            String response = readLimited(status >= 200 && status < 300
                ? connection.getInputStream() : connection.getErrorStream());
            JSONObject confirmation = new JSONObject(response);
            if (status == 200 && confirmation.optBoolean("ok", false)) {
                JSONObject result = confirmation.optJSONObject("result");
                JSONObject chat = result == null ? null : result.optJSONObject("chat");
                int messageId = result == null ? 0 : result.optInt("message_id", 0);
                if (chat != null && chat.optLong("id", 0) == GROUP_ID && messageId > 0)
                    return success(messageId);
                return failure("unconfirmed", status, 0, true);
            }
            int retry = Math.min(3600, Math.max(0, confirmation.optInt("retryAfter", 0)));
            String kind = confirmation.optString("kind", "");
            boolean uncertain = confirmation.optBoolean("uncertain", status >= 500);
            if ("rate_limit".equals(kind)) return failure("rate_limit", status, retry, false);
            if ("invalid".equals(kind)) return failure("invalid", status, 0, false);
            if ("unauthorized".equals(kind) || "forbidden".equals(kind) ||
                "request".equals(kind) || "server".equals(kind) ||
                "setup".equals(kind) || "unconfirmed".equals(kind) ||
                "timeout".equals(kind)) return failure(kind, status, 0, uncertain);
            return failure("rejected", status, 0, uncertain);
        } catch (UnknownHostException error) {
            return failure("offline", 0, 0, false);
        } catch (SocketTimeoutException error) {
            return failure("timeout", 0, 0, true);
        } catch (Exception error) {
            return failure("network", 0, 0, true);
        } finally { if (connection != null) connection.disconnect(); }
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
        String relayUrl = BuildConfig.WAVE_FEEDBACK_RELAY_URL;
        if (relayUrl == null || relayUrl.isEmpty()) {
            call.resolve(failure("setup", 0, 0, false));
            return;
        }
        // Network I/O must never block the Android main thread.
        new Thread(() -> call.resolve(deliverViaRelay(relayUrl, topic.trim(), text.trim())),
            "wave-feedback-http").start();
    }
}
