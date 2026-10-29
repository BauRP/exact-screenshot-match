package app.lovable.supernotes;

import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Rect;
import android.view.View;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.core.app.ActivityScenario;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Real Activity/WebView layout smoke tests, not just inset math tests. */
@RunWith(AndroidJUnit4.class)
public class AndroidShellInstrumentedTest {
    private static String evaluate(WebView web, String javascript) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        web.post(() -> web.evaluateJavascript(javascript, value -> {
            result.set(value);
            done.countDown();
        }));
        assertTrue("WebView JavaScript callback timed out", done.await(20, TimeUnit.SECONDS));
        return result.get();
    }

    @Test public void appStartsAndNavigationRemainsInsideSystemBars() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<WebView> webRef = new AtomicReference<>();
            scenario.onActivity(activity -> {
                assertNotNull(activity.getBridge());
                WebView web = activity.getBridge().getWebView();
                assertNotNull(web);
                webRef.set(web);
            });
            WebView web = webRef.get();
            assertNotNull(web);
            // Android 8 WebView may take a moment to mount its React root.
            boolean loaded = false;
            for (int i = 0; i < 30; i++) {
                if ("true".equals(evaluate(web,
                    "(function(){return !!document.querySelector('.wave-app-frame') && !!document.querySelector('.wave-bottom-nav')})()"))) {
                    loaded = true;
                    break;
                }
                Thread.sleep(500);
            }
            assertTrue("Home screen and bottom navigation did not mount", loaded);
            scenario.onActivity(activity -> {
                Rect visible = new Rect();
                assertTrue("WebView not visible", web.getGlobalVisibleRect(visible));
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(web);
                assertNotNull("WindowInsets not dispatched", insets);
                // Padding alone is NOT the actual safe area: on Android 8-14
                // decor may position the entire WebView below the status bar.
                // On edge-to-edge devices it may instead start at y=0 and
                // receive native padding. Test physical CONTENT coordinates.
                android.graphics.Point screen = new android.graphics.Point();
                activity.getWindowManager().getDefaultDisplay().getRealSize(screen);
                int[] webPosition = new int[2];
                web.getLocationOnScreen(webPosition);
                androidx.core.graphics.Insets bars =
                    insets.getInsets(WindowInsetsCompat.Type.systemBars());
                androidx.core.graphics.Insets cutout =
                    insets.getInsets(WindowInsetsCompat.Type.displayCutout());
                int safeTop = Math.max(bars.top, cutout.top);
                int safeBottom = Math.max(bars.bottom, cutout.bottom);
                int contentTop = webPosition[1] + web.getPaddingTop();
                int contentBottom = webPosition[1] + web.getHeight() - web.getPaddingBottom();
                assertTrue("Status bar overlaps app content: top=" + contentTop
                    + " safeTop=" + safeTop + " viewY=" + webPosition[1]
                    + " padding=" + web.getPaddingTop(), contentTop + 1 >= safeTop);
                assertTrue("System navigation overlaps app content: bottom=" + contentBottom
                    + " safeBottom=" + (screen.y - safeBottom)
                    + " padding=" + web.getPaddingBottom(),
                    contentBottom <= screen.y - safeBottom + 1);
            });
            assertEquals("true", evaluate(web,
                "(function(){var n=document.querySelector('.wave-bottom-nav');var r=n.getBoundingClientRect();return r.height>0 && r.bottom<=innerHeight+2 && r.top>=0 && document.documentElement.scrollWidth<=innerWidth+2})()"));
        }
    }

}
