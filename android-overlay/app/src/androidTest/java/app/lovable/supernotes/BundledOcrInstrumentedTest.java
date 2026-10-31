package app.lovable.supernotes;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.googlecode.tesseract.android.TessBaseAPI;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.text.Normalizer;
import java.util.Locale;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * Real Android runtime smoke tests, separate from the desktop Tesseract tests.
 * Images are generated with Android Canvas. They verify that the packaged
 * models can be read and initialized on the Android platform without download.
 * These are not substitutes for physical-camera and gallery tests.
 */
@RunWith(AndroidJUnit4.class)
public class BundledOcrInstrumentedTest {
    private static File modelsRoot;

    @BeforeClass
    public static void unpackBundledModels() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        modelsRoot = new File(context.getCacheDir(), "ocr-instrumented-models");
        File data = new File(modelsRoot, "tessdata");
        assertTrue(data.isDirectory() || data.mkdirs());
        for (String language : new String[]{"rus", "kaz"}) {
            File file = new File(data, language + ".traineddata");
            try (InputStream in = context.getAssets().open("tessdata/" + language + ".traineddata");
                 FileOutputStream out = new FileOutputStream(file)) {
                byte[] buffer = new byte[65536];
                int length;
                while ((length = in.read(buffer)) != -1) out.write(buffer, 0, length);
            }
            long expectedSize = "rus".equals(language) ? 3861738L : 4734644L;
            assertEquals("Bundled model size mismatch: " + language, expectedSize, file.length());
        }
    }

    @Test
    public void bundledModelsHaveExactPinnedContents() throws Exception {
        File folder = new File(modelsRoot, "tessdata");
        assertTrue(OfflineCyrillicOcrPlugin.isVerifiedBundledModel(
            new File(folder, "rus.traineddata"), "rus"));
        assertTrue(OfflineCyrillicOcrPlugin.isVerifiedBundledModel(
            new File(folder, "kaz.traineddata"), "kaz"));
    }

    @Test
    public void sameSizedDamageIsRejectedWithoutAnyDownload() throws Exception {
        // The original file lives in APK assets and remains untouched. The
        // copied fixture is deliberately altered WITHOUT changing its size.
        File original = new File(new File(modelsRoot, "tessdata"), "rus.traineddata");
        File damaged = File.createTempFile("wave-corrupt-", ".traineddata",
            InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
        try {
            try (InputStream in = new java.io.FileInputStream(original);
                 FileOutputStream out = new FileOutputStream(damaged)) {
                byte[] buffer = new byte[65536];
                int read;
                while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            }
            assertTrue(OfflineCyrillicOcrPlugin.isVerifiedBundledModel(damaged, "rus"));
            try (java.io.RandomAccessFile file = new java.io.RandomAccessFile(damaged, "rw")) {
                file.seek(300);
                int originalByte = file.read();
                file.seek(300);
                file.write(originalByte ^ 0x01);
            }
            assertEquals(original.length(), damaged.length());
            assertFalse("File length alone must NOT be trusted",
                OfflineCyrillicOcrPlugin.isVerifiedBundledModel(damaged, "rus"));
        } finally {
            assertTrue(damaged.delete());
        }
    }

    @Test
    public void emptyPhotoDoesNotInventText() {
        Bitmap bitmap = Bitmap.createBitmap(900, 240, Bitmap.Config.ARGB_8888);
        bitmap.eraseColor(Color.WHITE);
        TessBaseAPI api = new TessBaseAPI();
        try {
            assertTrue(api.init(modelsRoot.getAbsolutePath(), "kaz+rus"));
            api.setPageSegMode(TessBaseAPI.PageSegMode.PSM_SINGLE_BLOCK);
            api.setImage(bitmap);
            String output = api.getUTF8Text();
            assertTrue("Blank image produced text: " + output, output == null || output.trim().isEmpty());
        } finally {
            api.recycle();
            bitmap.recycle();
        }
    }

    @Test
    public void standaloneRussianKazakhModelsInitializeOffline() {
        for (String language : new String[]{"rus", "kaz"}) {
            TessBaseAPI api = new TessBaseAPI();
            try {
                assertTrue("Bundled OCR model unavailable: " + language,
                    api.init(modelsRoot.getAbsolutePath(), language));
            } finally {
                api.recycle();
            }
        }
    }

    @Test
    public void eachNativeLanguageLoadsOnlyBundledRequiredModels() {
        assertArrayEquals(new String[]{"rus"},OfflineCyrillicOcrPlugin.requiredModels("rus"));
        assertArrayEquals(new String[]{"kaz"},OfflineCyrillicOcrPlugin.requiredModels("kaz"));
        assertArrayEquals(new String[]{"rus","kaz"},OfflineCyrillicOcrPlugin.requiredModels("kaz+rus"));
        assertArrayEquals(new String[]{"rus","kaz"},OfflineCyrillicOcrPlugin.requiredModels("rus+kaz"));
        try {
            OfflineCyrillicOcrPlugin.requiredModels("deu");
            fail("External models cannot be requested");
        } catch (IllegalArgumentException expected) { }
    }

    @Test
    public void corruptedTextLineBoxesAreNotReturnedToWebView() {
        assertTrue(OfflineCyrillicOcrPlugin.isValidTextLineBox(new int[]{0,0,100,50},100,50));
        assertFalse(OfflineCyrillicOcrPlugin.isValidTextLineBox(new int[]{-1,0,10,20},100,50));
        assertFalse(OfflineCyrillicOcrPlugin.isValidTextLineBox(new int[]{1,0,101,20},100,50));
        assertFalse(OfflineCyrillicOcrPlugin.isValidTextLineBox(new int[]{50,0,10,20},100,50));
        assertFalse(OfflineCyrillicOcrPlugin.isValidTextLineBox(new int[]{0,0,1,0},100,50));
        assertFalse(OfflineCyrillicOcrPlugin.isValidTextLineBox(null,100,50));
    }

    @Test
    public void russianTextIsRecognizedOnAndroid() {
        verifyRecognition("Привет мир\nЭто тест распознавания", .25);
    }

    @Test
    public void kazakhTextIsRecognizedOnAndroid() {
        verifyRecognition("Қазақ тілі\nСәлем әлем", .28);
    }

    @Test
    public void cameraJpegPassesRealDecoderAndRecognizesBothCyrillicLanguages() throws Exception {
        // Unlike Canvas-only smoke tests, read a compressed JPEG with the
        // app's ACTUAL offline photo decoder before invoking Tesseract.
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File jpeg = File.createTempFile("ocr-real-jpeg-", ".jpg", context.getCacheDir());
        Bitmap original = Bitmap.createBitmap(1600, 400, Bitmap.Config.ARGB_8888);
        Bitmap decoded = null;
        TessBaseAPI api = new TessBaseAPI();
        try {
            Canvas canvas = new Canvas(original);
            canvas.drawColor(Color.WHITE);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
            paint.setColor(Color.BLACK);
            paint.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
            paint.setTextSize(92f);
            canvas.drawText("Привет мир", 80, 135, paint);
            canvas.drawText("Сәлем әлем", 80, 275, paint);
            try (FileOutputStream out = new FileOutputStream(jpeg)) {
                assertTrue("JPEG creation failed", original.compress(Bitmap.CompressFormat.JPEG, 95, out));
            }
            decoded = OfflineCyrillicOcrPlugin.loadBitmap(context, Uri.fromFile(jpeg).toString());
            assertEquals(1600, decoded.getWidth());
            assertEquals(400, decoded.getHeight());
            assertTrue("Bundled models did not load", api.init(modelsRoot.getAbsolutePath(), "kaz+rus"));
            api.setPageSegMode(TessBaseAPI.PageSegMode.PSM_SINGLE_BLOCK);
            api.setImage(decoded);
            String output = clean(api.getUTF8Text() == null ? "" : api.getUTF8Text());
            assertTrue("JPEG lost Russian words: " + output, output.contains("привет"));
            assertTrue("JPEG lost Kazakh words: " + output, output.contains("сәлем"));
        } finally {
            api.recycle();
            original.recycle();
            if (decoded != null) decoded.recycle();
            assertTrue(jpeg.delete());
        }
    }

    @Test
    public void mixedRussianKazakhTextIsRecognizedOnAndroid() {
        verifyRecognition("Привет мир\nСәлем әлем\nМосква 2026", .30);
    }

    private static void verifyRecognition(String reference, double maxCer) {
        Bitmap bitmap = Bitmap.createBitmap(1500, 430, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.WHITE);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
        paint.setColor(Color.BLACK);
        paint.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        paint.setTextSize(68f);
        String[] lines = reference.split("\n");
        int y = 110;
        for (String line : lines) {
            canvas.drawText(line, 55, y, paint);
            y += 112;
        }
        TessBaseAPI api = new TessBaseAPI();
        try {
            assertTrue("Bundled models failed to initialize", api.init(modelsRoot.getAbsolutePath(), "kaz+rus"));
            api.setPageSegMode(TessBaseAPI.PageSegMode.PSM_SINGLE_BLOCK);
            api.setImage(bitmap);
            String recognized = api.getUTF8Text();
            double rate = characterErrorRate(reference, recognized == null ? "" : recognized);
            assertTrue("Android OCR CER=" + rate + ", recognized: " + recognized +
                    ", expected: " + reference, rate <= maxCer);
        } finally {
            api.recycle();
            bitmap.recycle();
        }
    }

    private static double characterErrorRate(String original, String output) {
        String expected = clean(original), actual = clean(output);
        int[] previous = new int[actual.length() + 1];
        for (int j = 0; j <= actual.length(); j++) previous[j] = j;
        for (int i = 1; i <= expected.length(); i++) {
            int[] current = new int[actual.length() + 1];
            current[0] = i;
            for (int j = 1; j <= actual.length(); j++) {
                int substitution = expected.charAt(i - 1) == actual.charAt(j - 1) ? 0 : 1;
                current[j] = Math.min(
                    Math.min(previous[j] + 1, current[j - 1] + 1),
                    previous[j - 1] + substitution);
            }
            previous = current;
        }
        return (double) previous[actual.length()] / Math.max(1, expected.length());
    }

    private static String clean(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFKC)
            .replaceAll("\\s+", " ").trim().toLowerCase(Locale.ROOT);
    }
}
