package app.lovable.supernotes;

import androidx.core.graphics.Insets;

/** The ONLY Android-native sizing policy for system UI.
 * A 3-button bar may be much taller than the gesture indicator; neither
 * occupies a hard-coded number of pixels. Cutout and IME are independent.
 */
public final class SystemUiInsets {
    private SystemUiInsets() {}

    public static Insets resolve(Insets bars, Insets cutout, Insets keyboard, boolean keyboardVisible) {
        int left=Math.max(bars.left,cutout.left);
        int top=Math.max(bars.top,cutout.top);
        int right=Math.max(bars.right,cutout.right);
        int bottom=Math.max(bars.bottom,cutout.bottom);
        if(keyboardVisible){
            left=Math.max(left,keyboard.left);
            right=Math.max(right,keyboard.right);
            bottom=Math.max(bottom,keyboard.bottom);
        }
        return Insets.of(left,top,right,bottom);
    }
}
