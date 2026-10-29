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
import org.json.JSONObject;
import org.json.JSONTokener;

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
            // Report independent measurements instead of a single opaque
            // boolean. This distinguishes an actual overlap from CSS width
            // overflow or an old WebView viewport-coordinate discrepancy.
            // Full Tailwind styles must load on old WebViews (not just React).
            // evaluateJavascript serializes JS strings as JSON (including quotes).
            assertEquals("fixed", new org.json.JSONTokener(evaluate(web,
                "getComputedStyle(document.querySelector('.wave-bottom-nav')).position")).nextValue());
            assertEquals("0px", new org.json.JSONTokener(evaluate(web,
                "getComputedStyle(document.body).marginLeft")).nextValue());
            String raw = evaluate(web, "(function(){var n=document.querySelector('.wave-bottom-nav');var r=n.getBoundingClientRect();var f=document.querySelector('.wave-app-frame').getBoundingClientRect();return JSON.stringify({top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight,documentWidth:document.documentElement.scrollWidth,frameTop:f.top,frameBottom:f.bottom,frameHeight:f.height})})()");
            JSONObject geometry = new JSONObject((String) new JSONTokener(raw).nextValue());
            String details = geometry.toString();
            System.out.println("WAVE_LAYOUT_METRICS " + details);
            assertTrue("Bottom navigation has no height: " + details,
                geometry.getDouble("height") > 0);
            assertTrue("Bottom navigation is above the visible viewport: " + details,
                geometry.getDouble("top") >= -2);
            assertTrue("Bottom navigation extends below viewport: " + details,
                geometry.getDouble("bottom") <= geometry.getDouble("viewportHeight") + 2);
            assertTrue("Bottom navigation extends beyond screen width: " + details,
                geometry.getDouble("left") >= -2 &&
                geometry.getDouble("right") <= geometry.getDouble("viewportWidth") + 2);
            assertTrue("Document content overflows horizontally: " + details,
                geometry.getDouble("documentWidth") <= geometry.getDouble("viewportWidth") + 2);
        }
    }

}
