package app.lovable.supernotes;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Open links only in external applications. No in-app WebView. */
@CapacitorPlugin(name = "ExternalNoteLink")
public class ExternalNoteLinkPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String raw = call.getString("url", "");
        try {
            if (raw == null || raw.isEmpty() || raw.length() > 2048) {
                call.reject("Недопустимая ссылка");
                return;
            }
            for (int i = 0; i < raw.length(); i++) {
                char c = raw.charAt(i);
                if (c <= 0x20 || c == 0x7f) {
                    call.reject("Недопустимая ссылка");
                    return;
                }
            }
            Uri target = Uri.parse(raw);
            String scheme = target.getScheme();
            Intent intent;
            if (("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) &&
                target.getHost() != null && !target.getHost().isEmpty() &&
                target.getUserInfo() == null) {
                intent = new Intent(Intent.ACTION_VIEW, target);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
            } else if (raw.matches("(?i)^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$") &&
                       raw.length() <= 261) {
                intent = new Intent(Intent.ACTION_SENDTO, target);
            } else if (raw.matches("(?i)^tel:\\+?[0-9().-]+$")) {
                int digits = raw.replaceAll("[^0-9]", "").length();
                if (digits < 7 || digits > 20) {
                    call.reject("Неподдерживаемый номер");
                    return;
                }
                intent = new Intent(Intent.ACTION_DIAL, target);
            } else {
                call.reject("Неподдерживаемая ссылка");
                return;
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception exception) {
            call.reject("Не удалось открыть внешнее приложение", exception);
        }
    }
}
