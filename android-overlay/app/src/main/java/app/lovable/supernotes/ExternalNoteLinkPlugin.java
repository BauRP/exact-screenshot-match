package app.lovable.supernotes;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Launches only http(s) links in the user's default external browser.
 * No in-app WebView and no implicit intents for unsafe custom schemes.
 */
@CapacitorPlugin(name = "ExternalNoteLink")
public class ExternalNoteLinkPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String raw=call.getString("url", "");
        try {
            Uri target=Uri.parse(raw);
            String scheme=target.getScheme();
            if((!"https".equalsIgnoreCase(scheme)&&!"http".equalsIgnoreCase(scheme))||
                target.getHost()==null||target.getHost().isEmpty()){
                call.reject("Поддерживаются только ссылки http и https");
                return;
            }
            Intent intent=new Intent(Intent.ACTION_VIEW,target);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch(Exception exception) {
            call.reject("Не удалось открыть ссылку во внешнем браузере",exception);
        }
    }
}
