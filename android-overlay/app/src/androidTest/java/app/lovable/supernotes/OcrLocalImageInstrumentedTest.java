package app.lovable.supernotes;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.media.ExifInterface;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * Exercises the REAL Android image decoder used by camera/gallery OCR,
 * rather than a duplicate test-only decoding implementation. The invocation
 * calls OfflineCyrillicOcrPlugin.loadBitmap using file and file:// inputs.
 * It does not open a real camera or a gallery picker.
 */
@RunWith(AndroidJUnit4.class)
public class OcrLocalImageInstrumentedTest {
    private static Bitmap loadWithActualPlugin(String source) throws Exception {
        OfflineCyrillicOcrPlugin plugin = new OfflineCyrillicOcrPlugin();
        Method method = OfflineCyrillicOcrPlugin.class.getDeclaredMethod("loadBitmap", String.class);
        method.setAccessible(true);
        return (Bitmap) method.invoke(plugin, source);
    }

    private static File makePhoto(int width, int height) throws Exception {
        File location = File.createTempFile("wave-ocr-photo-", ".jpg",
            InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
        Bitmap original = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        try {
            Canvas canvas = new Canvas(original);
            canvas.drawColor(Color.WHITE);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setColor(Color.BLACK);
            paint.setTextSize(48f);
            canvas.drawText("Photo OCR 2026", 15, 80, paint);
            try (FileOutputStream output = new FileOutputStream(location)) {
                assertTrue(original.compress(Bitmap.CompressFormat.JPEG, 95, output));
            }
        } finally {
            original.recycle();
        }
        return location;
    }

    @Test
    public void rawAbsoluteCameraFileCanBeDecoded() throws Exception {
        File photo = makePhoto(640, 320);
        Bitmap decoded = null;
        try {
            decoded = loadWithActualPlugin(photo.getAbsolutePath());
            assertEquals(640, decoded.getWidth());
            assertEquals(320, decoded.getHeight());
        } finally {
            if (decoded != null) decoded.recycle();
            assertTrue(photo.delete());
        }
    }

    @Test
    public void localFileUriCanBeDecoded() throws Exception {
        File photo = makePhoto(600, 360);
        Bitmap decoded = null;
        try {
            decoded = loadWithActualPlugin(Uri.fromFile(photo).toString());
            assertEquals(600, decoded.getWidth());
            assertEquals(360, decoded.getHeight());
        } finally {
            if (decoded != null) decoded.recycle();
            assertTrue(photo.delete());
        }
    }

    @Test
    public void galleryExifRotationIsAppliedBeforeOcr() throws Exception {
        File photo = makePhoto(640, 320);
        Bitmap decoded = null;
        try {
            ExifInterface exif = new ExifInterface(photo.getAbsolutePath());
            exif.setAttribute(ExifInterface.TAG_ORIENTATION,
                String.valueOf(ExifInterface.ORIENTATION_ROTATE_90));
            exif.saveAttributes();
            decoded = loadWithActualPlugin(Uri.fromFile(photo).toString());
            assertEquals("EXIF must change OCR width",320,decoded.getWidth());
            assertEquals("EXIF must change OCR height",640,decoded.getHeight());
        } finally {
            if (decoded != null) decoded.recycle();
            assertTrue(photo.delete());
        }
    }

    @Test
    public void damagedPhotoIsRejectedBeforeOcr() throws Exception {
        File broken = File.createTempFile("wave-ocr-corrupt-", ".jpg",
            InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
        try {
            try (FileOutputStream output = new FileOutputStream(broken)) {
                output.write(new byte[]{0, 1, 2, 3, 4, 5});
            }
            try {
                Bitmap unexpected = loadWithActualPlugin(broken.getAbsolutePath());
                if (unexpected != null) unexpected.recycle();
                fail("Corrupt image should be rejected before OCR");
            } catch (InvocationTargetException expected) {
                assertTrue("Incorrect failure: " + expected.getCause(),
                    expected.getCause() instanceof IllegalArgumentException);
            }
        } finally {
            assertTrue(broken.delete());
        }
    }
}
