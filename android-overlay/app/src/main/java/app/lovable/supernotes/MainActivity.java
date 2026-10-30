package app.lovable.supernotes;

import android.os.Bundle;
import android.webkit.WebView;
import android.view.ViewGroup;
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
        // The WebView viewport must be INSIDE the safe window, not merely
        // padded: CSS position:fixed (the three bottom tabs) does not reliably
        // respect WebView padding on every OEM and Chromium version.
        // Keep initial layout margins so repeated insets never accumulate.
        final ViewGroup.LayoutParams initial=webView.getLayoutParams();
        if(!(initial instanceof ViewGroup.MarginLayoutParams)){
            throw new IllegalStateException("Wave Notes WebView requires margin-capable layout parameters");
        }
        final ViewGroup.MarginLayoutParams base=(ViewGroup.MarginLayoutParams)initial;
        final int baseLeft=base.leftMargin, baseTop=base.topMargin;
        final int baseRight=base.rightMargin, baseBottom=base.bottomMargin;
        final boolean[] lastImeVisible={false};
        ViewCompat.setOnApplyWindowInsetsListener(webView,(view,windowInsets)->{
            Insets bars=windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            Insets cutout=windowInsets.getInsets(WindowInsetsCompat.Type.displayCutout());

            // IME is handled by adjustResize / WebView visual viewport and the
            // wave-ime-open class. Adding IME as a view margin double-shrinks
            // content on OEM implementations, including three-button phones.
            boolean imeVisible=windowInsets.isVisible(WindowInsetsCompat.Type.ime());
            Insets safe=SystemUiInsets.resolve(bars,cutout,Insets.NONE,false);
            ViewGroup.LayoutParams current=view.getLayoutParams();
            if(current instanceof ViewGroup.MarginLayoutParams){
                ViewGroup.MarginLayoutParams params=(ViewGroup.MarginLayoutParams)current;
                int l=baseLeft+safe.left, t=baseTop+safe.top;
                int r=baseRight+safe.right, b=baseBottom+safe.bottom;
                if(params.leftMargin!=l||params.topMargin!=t||
                   params.rightMargin!=r||params.bottomMargin!=b){
                    params.setMargins(l,t,r,b);
                    view.setLayoutParams(params);
                }
            }
            // Remove leftover padding from the earlier implementation.
            // Fixed elements must use the clipped WebView viewport.
            if(view.getPaddingLeft()!=0||view.getPaddingTop()!=0||
               view.getPaddingRight()!=0||view.getPaddingBottom()!=0){
                view.setPadding(0,0,0,0);
            }
            if(lastImeVisible[0]!=imeVisible){
                lastImeVisible[0]=imeVisible;
                final String script="document.documentElement.classList.toggle('wave-ime-open',"+imeVisible+");";
                webView.post(()->webView.evaluateJavascript(script,null));
            }

            // Android WebView M144+ supplies env(safe-area-inset-*) itself.
            // We already used these insets to position the whole WebView, so
            // ZERO them before forwarding; otherwise some versions add them
            // a second time inside the page. Keep IME untouched for resizing.
            return new WindowInsetsCompat.Builder(windowInsets)
                .setInsets(WindowInsetsCompat.Type.systemBars(),Insets.NONE)
                .setInsets(WindowInsetsCompat.Type.displayCutout(),Insets.NONE)
                .build();
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
