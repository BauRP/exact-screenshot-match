package app.lovable.supernotes;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfPrinterPlugin.class);
        super.onCreate(savedInstanceState);

        // Android 15+ may enforce edge-to-edge even when status bar overlay is off.
        // Padding on the WebView reserves actual system-bar space, including cutouts.
        if (Build.VERSION.SDK_INT >= 35 && getBridge() != null) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
                    Insets insets = windowInsets.getInsets(
                        WindowInsetsCompat.Type.systemBars() |
                        WindowInsetsCompat.Type.displayCutout());
                    view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
                    return windowInsets;
                });
                ViewCompat.requestApplyInsets(webView);
            }
        }
    }
}
