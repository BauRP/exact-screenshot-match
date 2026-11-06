package app.lovable.supernotes;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Offline app feedback uses the user's email client, never a hidden token. */
@CapacitorPlugin(name = "FeedbackEmail")
public class FeedbackEmailPlugin extends Plugin {
    @PluginMethod
    public void compose(PluginCall call) {
        String subject = call.getString("subject");
        String message = call.getString("message");
        if (subject == null || subject.trim().isEmpty() ||
            message == null || message.trim().isEmpty() ||
            subject.length() > 200 || message.length() > 4000) {
            call.reject("Invalid feedback content");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_SENDTO);
                intent.setData(Uri.parse("mailto:trivo.support@proton.me"));
                intent.putExtra(Intent.EXTRA_EMAIL, new String[]{"trivo.support@proton.me"});
                intent.putExtra(Intent.EXTRA_SUBJECT, "Wave Notes: " + subject);
                intent.putExtra(Intent.EXTRA_TEXT, message);
                getActivity().startActivity(intent);
                call.resolve();
            } catch (ActivityNotFoundException e) {
                call.reject("На устройстве нет почтового приложения", e);
            } catch (Exception e) {
                call.reject("Не удалось открыть приложение почты", e);
            }
        });
    }
}
