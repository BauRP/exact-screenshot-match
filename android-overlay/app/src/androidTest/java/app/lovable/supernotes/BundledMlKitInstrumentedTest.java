package app.lovable.supernotes;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions;
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions;
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * Checks the five BUNDLED ML Kit text recognizers on an Android 34 emulator.
 * Network is switched off by the workflow before these tests run. Synthetic
 * Android Canvas glyphs prove initialization and a basic recognition path;
 * real camera photos and production accuracy remain separate acceptance work.
 */
@RunWith(AndroidJUnit4.class)
public class BundledMlKitInstrumentedTest {
    private static final String LOG_TAG = "WaveNotesOcrTest";

    @Test
    public void latinModelRunsOffline() throws Exception {
        verify("HELLO WORLD 2026", Character.UnicodeScript.LATIN,
            TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS));
    }

    @Test
    public void chineseModelRunsOffline() throws Exception {
        verify("中文测试文字", Character.UnicodeScript.HAN,
            TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build()));
    }

    @Test
    public void japaneseModelRunsOffline() throws Exception {
        verify("こんにちは日本語", Character.UnicodeScript.HIRAGANA,
            TextRecognition.getClient(new JapaneseTextRecognizerOptions.Builder().build()));
    }

    @Test
    public void koreanModelRunsOffline() throws Exception {
        verify("안녕하세요 한국어", Character.UnicodeScript.HANGUL,
            TextRecognition.getClient(new KoreanTextRecognizerOptions.Builder().build()));
    }

    @Test
    public void devanagariModelRunsOffline() throws Exception {
        verify("नमस्ते हिन्दी", Character.UnicodeScript.DEVANAGARI,
            TextRecognition.getClient(new DevanagariTextRecognizerOptions.Builder().build()));
    }

    private static void verify(String sample, Character.UnicodeScript expectedScript,
                               TextRecognizer recognizer) throws Exception {
        Bitmap bitmap = Bitmap.createBitmap(1600, 360, Bitmap.Config.ARGB_8888);
        try {
            Canvas canvas = new Canvas(bitmap);
            canvas.drawColor(Color.WHITE);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
            paint.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
            paint.setTextSize(100f);
            paint.setColor(Color.BLACK);
            // Paint.hasGlyph() accepts a SINGLE grapheme cluster; asking whether
            // an entire sentence is one glyph returns false even for Latin.
            // Validate a representative base character before drawing the line.
            String representative = new String(Character.toChars(sample.codePointAt(0)));
            assertTrue("Missing Android font glyph for: " + representative, paint.hasGlyph(representative));
            canvas.drawText(sample, 65, 185, paint);
            Text output = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)),
                    40, TimeUnit.SECONDS);
            String value = output.getText() == null ? "" : output.getText().trim();
            Log.i(LOG_TAG, expectedScript + ": " + value);
            assertTrue("Bundled " + expectedScript + " model returned empty OCR text", !value.isEmpty());
            long matching = value.codePoints()
                .filter(cp -> Character.UnicodeScript.of(cp) == expectedScript).count();
            assertTrue("No " + expectedScript + " letters in offline OCR: " + value, matching >= 1);
        } finally {
            recognizer.close();
            bitmap.recycle();
        }
    }
}
