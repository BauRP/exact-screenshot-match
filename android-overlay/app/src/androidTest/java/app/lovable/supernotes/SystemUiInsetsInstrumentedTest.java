package app.lovable.supernotes;

import androidx.core.graphics.Insets;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SystemUiInsetsInstrumentedTest {
    @Test public void gestureNavigationLeavesOnlyGestureSafetySpace() {
        Insets safe=SystemUiInsets.resolve(Insets.of(0,32,0,16),Insets.NONE,Insets.NONE,false);
        assertEquals(32,safe.top);
        assertEquals(16,safe.bottom);
    }
    @Test public void threeButtonNavigationMovesAppAboveButtons() {
        Insets safe=SystemUiInsets.resolve(Insets.of(0,32,0,60),Insets.NONE,Insets.NONE,false);
        assertEquals(60,safe.bottom);
    }
    @Test public void frontCameraCutoutProtectsTopAndLandscapeEdges() {
        Insets safe=SystemUiInsets.resolve(Insets.of(0,22,0,16),Insets.of(28,48,0,0),Insets.NONE,false);
        assertEquals(48,safe.top);
        assertEquals(28,safe.left);
    }
    @Test public void keyboardMovesEditingAboveImeWithoutDoubleBottomInset() {
        Insets safe=SystemUiInsets.resolve(Insets.of(0,32,0,56),Insets.NONE,Insets.of(0,0,0,360),true);
        assertEquals(360,safe.bottom);
        assertEquals(32,safe.top);
        assertEquals(56,SystemUiInsets.resolve(Insets.of(0,32,0,56),
            Insets.NONE,Insets.of(0,0,0,360),false).bottom);
    }
    @Test public void noHardwareOrSoftwareNavigationNeedsNoExtraSpacing() {
        assertEquals(Insets.NONE,SystemUiInsets.resolve(Insets.NONE,Insets.NONE,Insets.NONE,false));
    }
}
