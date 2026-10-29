package app.lovable.supernotes;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.media.ExifInterface;
import android.net.Uri;
import android.provider.MediaStore;
import java.io.InputStream;
import java.io.OutputStream;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
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
        // The Capacitor Plugin requires a live Bridge for getContext().
        // Call the EXACT SAME production decoder with the real test Context,
        // not an uninitialized plugin instance (which caused 4 false failures).
        return OfflineCyrillicOcrPlugin.loadBitmap(
            InstrumentationRegistry.getInstrumentation().getTargetContext(), source);
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
    public void actualMediaStoreContentUriCanBeDecodedOffline() throws Exception {
        // Android's photo picker commonly returns content:// URIs.
        // Create an app-owned gallery image and verify OUR native decoder
        // reads it through ContentResolver, not just a file:// shortcut.
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        // Android 8/9 cannot insert into public MediaStore without the
        // broad WRITE_EXTERNAL_STORAGE permission. Wave Notes deliberately
        // does not request that permission. Use an app-owned FileProvider
        // content:// URI on legacy Android, which exercises the same real
        // ContentResolver/decoder path without weakening privacy.
        if (android.os.Build.VERSION.SDK_INT < 29) {
            File photo = makePhoto(640, 320);
            Bitmap decoded = null;
            try {
                Uri uri = androidx.core.content.FileProvider.getUriForFile(
                    context, context.getPackageName() + ".fileprovider", photo);
                assertEquals("content", uri.getScheme());
                try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
                    assertNotNull("App-owned provider URI cannot be opened", stream);
                    assertTrue("App-owned image is empty", stream.read() >= 0);
                }
                decoded = OfflineCyrillicOcrPlugin.loadBitmap(context, uri.toString());
                assertEquals(640, decoded.getWidth());
                assertEquals(320, decoded.getHeight());
            } finally {
                if (decoded != null) decoded.recycle();
                assertTrue(photo.delete());
            }
            return;
        }
        ContentResolver resolver = context.getContentResolver();
        ContentValues metadata = new ContentValues();
        metadata.put(MediaStore.Images.Media.DISPLAY_NAME, "wave-notes-ocr-integration.jpg");
        metadata.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        metadata.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/WaveNotesOcrTests");
        Uri content = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, metadata);
        assertNotNull("MediaStore image insertion failed", content);
        Bitmap source = Bitmap.createBitmap(640, 320, Bitmap.Config.ARGB_8888);
        Bitmap decoded = null;
        try {
            Canvas canvas = new Canvas(source);
            canvas.drawColor(Color.WHITE);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setColor(Color.BLACK);
            paint.setTextSize(56f);
            canvas.drawText("Gallery OCR", 40, 130, paint);
            try (OutputStream out = resolver.openOutputStream(content)) {
                assertNotNull("MediaStore returned no output stream", out);
                assertTrue("Could not create MediaStore JPEG",
                    source.compress(Bitmap.CompressFormat.JPEG, 95, out));
            }
            decoded = OfflineCyrillicOcrPlugin.loadBitmap(context, content.toString());
            assertNotNull(decoded);
            assertEquals(640, decoded.getWidth());
            assertEquals(320, decoded.getHeight());
        } finally {
            if (decoded != null) decoded.recycle();
            source.recycle();
            resolver.delete(content, null, null);
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
    public void rotate270ExifHasCorrectOcrCoordinates() throws Exception {
        File photo = makePhoto(640, 320);
        Bitmap corrected = null;
        try {
            ExifInterface exif = new ExifInterface(photo.getAbsolutePath());
            exif.setAttribute(ExifInterface.TAG_ORIENTATION,
                String.valueOf(ExifInterface.ORIENTATION_ROTATE_270));
            exif.saveAttributes();
            corrected = loadWithActualPlugin(Uri.fromFile(photo).toString());
            assertEquals("270 degree rotation swaps OCR width", 320, corrected.getWidth());
            assertEquals("270 degree rotation swaps OCR height", 640, corrected.getHeight());
        } finally {
            if (corrected != null) corrected.recycle();
            assertTrue(photo.delete());
        }
    }

    @Test
    public void horizontalExifMirroringPreservesPhotoDimensions() throws Exception {
        File photo = makePhoto(640, 320);
        Bitmap corrected = null;
        try {
            ExifInterface exif = new ExifInterface(photo.getAbsolutePath());
            exif.setAttribute(ExifInterface.TAG_ORIENTATION,
                String.valueOf(ExifInterface.ORIENTATION_FLIP_HORIZONTAL));
            exif.saveAttributes();
            corrected = loadWithActualPlugin(photo.getAbsolutePath());
            assertEquals(640, corrected.getWidth());
            assertEquals(320, corrected.getHeight());
        } finally {
            if (corrected != null) corrected.recycle();
            assertTrue(photo.delete());
        }
    }

    @Test
    public void galleryPngIsDecodedByNativeImageLoader() throws Exception {
        File png = File.createTempFile("wave-ocr-png-", ".png",
            InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
        Bitmap original = Bitmap.createBitmap(360, 240, Bitmap.Config.ARGB_8888);
        Bitmap decoded = null;
        try {
            original.eraseColor(Color.WHITE);
            try (FileOutputStream out = new FileOutputStream(png)) {
                assertTrue(original.compress(Bitmap.CompressFormat.PNG, 100, out));
            }
            decoded = loadWithActualPlugin(png.getAbsolutePath());
            assertEquals(360, decoded.getWidth());
            assertEquals(240, decoded.getHeight());
        } finally {
            original.recycle();
            if (decoded != null) decoded.recycle();
            assertTrue(png.delete());
        }
    }

    @Test
    public void oversizedPhotoIsDownsampledBeforeOcr() throws Exception {
        // 4800px exceeds the OCR 4500px edge cap. The native loader
        // must sample x2 instead of allocating a full-resolution OCR bitmap.
        File photo = makePhoto(4800, 1000);
        Bitmap decoded = null;
        try {
            decoded = loadWithActualPlugin(photo.getAbsolutePath());
            assertEquals(2400, decoded.getWidth());
            assertEquals(500, decoded.getHeight());
        } finally {
            if (decoded != null) decoded.recycle();
            assertTrue(photo.delete());
        }
    }


    /** Insert a valid JPEG EXIF APP1/TIFF orientation segment immediately
     * after SOI, avoiding the buggy Android 8 ExifInterface.saveAttributes
     * writer. The production image reader is unchanged.
     */
    private static void addExifRotate90(File jpegFile) throws Exception {
        byte[] input = new byte[(int) jpegFile.length()];
        try (InputStream in = new java.io.FileInputStream(jpegFile)) {
            int read = 0;
            while (read < input.length) {
                int count = in.read(input, read, input.length - read);
                if (count == -1) break;
                read += count;
            }
            assertEquals("JPEG was truncated", input.length, read);
        }
        assertTrue("JPEG has no SOI", input.length > 4 &&
            (input[0] & 255) == 255 && (input[1] & 255) == 216);
        byte[] exif = new byte[]{
            (byte)255, (byte)225, 0, 34,
            'E', 'x', 'i', 'f', 0, 0,
            'I', 'I', 42, 0, 8, 0, 0, 0,
            1, 0,
            0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0,
            0, 0, 0, 0
        };
        try (FileOutputStream output = new FileOutputStream(jpegFile, false)) {
            output.write(input, 0, 2);
            output.write(exif);
            output.write(input, 2, input.length - 2);
        }
        assertEquals("EXIF orientation fixture malformed",
            ExifInterface.ORIENTATION_ROTATE_90,
            new ExifInterface(jpegFile.getAbsolutePath()).getAttributeInt(
                ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_UNDEFINED));
    }

    /** Orientation must transform actual pixels, not only bitmap dimensions.
     * OCR rectangles must use this same corrected coordinate frame.
     */
    @Test
    public void ninetyDegreeExifRotationMovesPixelsToCorrectCorner() throws Exception {
        File photo=File.createTempFile("wave-exif-pixel-", ".jpg",
            InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
        Bitmap original=Bitmap.createBitmap(400,300,Bitmap.Config.ARGB_8888);
        Bitmap decoded=null;
        try {
            Canvas canvas=new Canvas(original);
            canvas.drawColor(Color.WHITE);
            Paint mark=new Paint();
            mark.setColor(Color.RED);
            canvas.drawRect(0,0,110,100,mark);
            try (FileOutputStream out=new FileOutputStream(photo)) {
                assertTrue(original.compress(Bitmap.CompressFormat.JPEG,97,out));
            }
            addExifRotate90(photo);
            decoded=loadWithActualPlugin(photo.getAbsolutePath());
            assertEquals(300,decoded.getWidth());
            assertEquals(400,decoded.getHeight());
            int topRight=decoded.getPixel(265,25);
            int topLeft=decoded.getPixel(25,25);
            assertTrue("EXIF rotation misplaced red content",
                Color.green(topRight)+40<Color.green(topLeft));
            assertTrue("Red rotated marker must remain red",Color.red(topRight)>170);
        } finally {
            original.recycle();
            if(decoded!=null) decoded.recycle();
            assertTrue(photo.delete());
        }
    }

    @Test
    public void remoteUriIsRejectedWithoutNetwork() throws Exception {
        try {
            Bitmap decoded = loadWithActualPlugin("https://example.invalid/photo.jpg");
            if (decoded != null) decoded.recycle();
            fail("Remote URLs must not be opened by native offline OCR");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("Only local photos"));
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
            } catch (IllegalArgumentException expected) {
                assertTrue("Corrupt file must be rejected", expected.getMessage() != null);
            }
        } finally {
            assertTrue(broken.delete());
        }
    }
}


// The bitmap decoder must not touch the network, and the auto-downsample
// fallback used on low-RAM phones still respects EXIF after sampling.
// Separate geometry-cap tests run in the pure OCR verification workflow.
