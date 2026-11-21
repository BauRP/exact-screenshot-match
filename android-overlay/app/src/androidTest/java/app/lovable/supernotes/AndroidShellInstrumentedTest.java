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
                // Query the real Android window, not the sanitized WebView insets.
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(activity.getWindow().getDecorView());
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
                // Native margins, not WebView internal padding, bound the
                // CSS viewport and fixed navigation bar on modern Android.
                int contentTop = webPosition[1];
                int contentBottom = webPosition[1] + web.getHeight();
                assertEquals("WebView top inset must not be double-applied",0,web.getPaddingTop());
                assertEquals("WebView bottom inset must not be double-applied",0,web.getPaddingBottom());
                assertTrue("Status bar overlaps app content: top=" + contentTop
                    + " safeTop=" + safeTop + " viewY=" + webPosition[1]
                    + " margin should reserve top inset", contentTop + 1 >= safeTop);
                assertTrue("System navigation overlaps app content: bottom=" + contentBottom
                    + " safeBottom=" + (screen.y - safeBottom)
                    + " margin should reserve bottom inset",
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
            // The Vivo X200 report is from Settings, not only the home page.
            // Verify that route changes do not drop the safe-area container.
            // A native TanStack route may expose relative, absolute or
            // slash-suffixed hrefs; locate the Settings tab by its path.
            String linksRaw=evaluate(web,
                "(function(){return JSON.stringify(Array.from(document.querySelectorAll('.wave-bottom-nav a')).map(a=>a.getAttribute('href')));})()");
            System.out.println("WAVE_BOTTOM_LINKS "+linksRaw);
            String clicked=evaluate(web,
                "(function(){var links=Array.from(document.querySelectorAll('.wave-bottom-nav a'));var a=links.find(x=>/settings/.test(x.getAttribute('href')||''));if(!a)return false;a.click();return true;})()");
            assertEquals("Cannot find settings in bottom tabs. hrefs="+linksRaw,
                "true",clicked);
            boolean settingsReady=false;
            for(int attempt=0;attempt<20;attempt++){
                if("true".equals(evaluate(web,
                    "(function(){var page=document.querySelector('[data-wave-settings-screen]');var main=page&&page.querySelector('[data-wave-settings-scroll]');var h=page&&page.querySelector('header');var hash=location.hash;return !!(main&&h&&/^#\\/settings(?:[/?#]|$)/.test(hash)&&h.getBoundingClientRect().height>0)})()"))){
                    settingsReady=true;break;
                }
                Thread.sleep(300);
            }
            assertTrue("Settings route failed to mount; location and header="+
                evaluate(web,"(function(){return JSON.stringify({path:location.pathname,hash:location.hash,headers:Array.from(document.querySelectorAll('header')).map(h=>({text:h.innerText.slice(0,80),height:h.getBoundingClientRect().height}))});})()"),
                settingsReady);
            String settingsRaw=evaluate(web,
                "(function(){var h=document.querySelector('[data-wave-settings-screen] header').getBoundingClientRect();var b=document.querySelector('.wave-bottom-nav').getBoundingClientRect();return JSON.stringify({headerTop:h.top,headerBottom:h.bottom,bottomTop:b.top,bottomEnd:b.bottom,viewportHeight:innerHeight});})()");
            JSONObject settings=new JSONObject((String)new JSONTokener(settingsRaw).nextValue());
            System.out.println("WAVE_SETTINGS_SAFE_AREA "+settings);
            assertTrue("Settings heading is above the safe WebView viewport: "+settings,
                settings.getDouble("headerTop")>=-2);
            assertTrue("Settings navigation is under Android system buttons: "+settings,
                settings.getDouble("bottomEnd")<=settings.getDouble("viewportHeight")+2);
            assertTrue("Settings footer overlaps header: "+settings,
                settings.getDouble("bottomTop")>=settings.getDouble("headerBottom"));
            // The route hash updates before React finishes rendering: never
            // test the previous route's first <main> after clicking Settings.
            // Force overflow only on tablets whose Settings already fully fit.
            String scrolledRaw=evaluate(web,
                "(function(){var page=document.querySelector('[data-wave-settings-screen]');var m=page&&page.querySelector('[data-wave-settings-scroll]');if(!m)return JSON.stringify({error:'settings main missing',hash:location.hash});var naturalOverflow=m.scrollHeight>m.clientHeight+2;var spacer=null;if(!naturalOverflow){spacer=document.createElement('div');spacer.setAttribute('data-wave-test-spacer','true');spacer.style.cssText='height:'+Math.max(650,innerHeight)+'px;min-height:'+Math.max(650,innerHeight)+'px;flex-shrink:0;pointer-events:none';m.appendChild(spacer);}m.scrollTop=m.scrollHeight;var h=page.querySelector('header').getBoundingClientRect();var n=document.querySelector('.wave-bottom-nav').getBoundingClientRect();var d={scrollTop:m.scrollTop,scrollHeight:m.scrollHeight,clientHeight:m.clientHeight,naturalOverflow:naturalOverflow,headerTop:h.top,headerBottom:h.bottom,navTop:n.top,navBottom:n.bottom,windowScrollY:window.scrollY,documentScrollY:document.documentElement.scrollTop};if(spacer)spacer.remove();return JSON.stringify(d);})()");
            JSONObject scrolled=new JSONObject((String)new JSONTokener(scrolledRaw).nextValue());
            System.out.println("WAVE_SETTINGS_AFTER_SCROLL "+scrolled);
            assertFalse("Settings scroll container missing: "+scrolled,scrolled.has("error"));
            assertTrue("Settings scrolling failed: "+scrolled,
                scrolled.getDouble("scrollHeight")>scrolled.getDouble("clientHeight") &&
                scrolled.getDouble("scrollTop")>0);
            assertTrue("Settings header went under status bar after scroll: "+scrolled,
                scrolled.getDouble("headerTop")>=-2);
            assertTrue("Bottom tabs overlap Settings header after scroll: "+scrolled,
                scrolled.getDouble("navTop")>=scrolled.getDouble("headerBottom"));
            assertTrue("Settings changed outer document scroll after swipe: "+scrolled,
                Math.abs(scrolled.getDouble("windowScrollY"))<=2 &&
                Math.abs(scrolled.getDouble("documentScrollY"))<=2);
        }
    }

}
