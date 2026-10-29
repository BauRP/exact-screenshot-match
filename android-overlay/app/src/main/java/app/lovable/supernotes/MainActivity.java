package app.lovable.supernotes;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * One inset owner for the complete Capacitor WebView, including Notes, PDF,
 * Camera, Settings, modal portals and the fixed bottom navigation bar.
 *
 * Works on API 24+ with both three-button and gesture navigation. Android
 * 15/16/17 enforce edge-to-edge; older versions use the same policy rather
 * than a different set of guessed padding constants.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfPrinterPlugin.class);
        registerPlugin(PrivacyLinkPlugin.class);
        registerPlugin(FeedbackEmailPlugin.class);
        registerPlugin(OfflineCyrillicOcrPlugin.class);
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(),getWindow().getDecorView());
        // Wave Notes uses a dark system-bar surface. Icons must be light.
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);

        if(getBridge()==null)return;
        WebView webView=getBridge().getWebView();
        if(webView==null)return;
        final boolean[] lastImeVisible={false};
        ViewCompat.setOnApplyWindowInsetsListener(webView,(view,windowInsets)->{
            Insets bars=windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            Insets cutout=windowInsets.getInsets(WindowInsetsCompat.Type.displayCutout());
            boolean imeVisible=windowInsets.isVisible(WindowInsetsCompat.Type.ime());
            Insets ime=windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            Insets safe=SystemUiInsets.resolve(bars,cutout,ime,imeVisible);
            if(view.getPaddingLeft()!=safe.left||view.getPaddingTop()!=safe.top||
               view.getPaddingRight()!=safe.right||view.getPaddingBottom()!=safe.bottom){
                view.setPadding(safe.left,safe.top,safe.right,safe.bottom);
            }
            if(lastImeVisible[0]!=imeVisible){
                lastImeVisible[0]=imeVisible;
                webView.evaluateJavascript(
                    "document.documentElement.classList.toggle('wave-ime-open',"+
                    imeVisible+");",null);
            }
            // Do not consume: other Android views and plugins need insets too.
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
