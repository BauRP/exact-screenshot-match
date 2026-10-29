package app.lovable.supernotes;

import android.app.ActivityManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import androidx.exifinterface.media.ExifInterface;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.googlecode.tesseract.android.ResultIterator;
import com.googlecode.tesseract.android.TessBaseAPI;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "OfflineCyrillicOcr")
public class OfflineCyrillicOcrPlugin extends Plugin {
    private static final long RUS_SIZE = 3861738L;
    private static final long KAZ_SIZE = 4734644L;
    private static final int MAX_REPORTED_TEXT_LINES = 350;
    // SHA-1 Git-blob object IDs pinned at BUILD time, then independently
    // verified by Android before each native OCR session.
    private static final String RUS_BLOB = "b146cb2263acbc6383f8e92ea0ce759537687bb8";
    private static final String KAZ_BLOB = "f889e2b8ffd093d4f2dff8ffca2fa0b73296c028";
    // Keep one native recognizer at a time on a worker thread, never on Android UI.
    private final ExecutorService worker = Executors.newSingleThreadExecutor();


    /**
     * Decode any gallery/content URI once, apply EXIF, and give BOTH engines
     * the same oriented bitmap with known dimensions. JPEG lives only in the
     * app's private cache and is deleted after the scan.
     */
    @PluginMethod
    public void prepareImage(PluginCall call) {
        final String source = call.getString("path");
        if (source == null || source.trim().isEmpty()) {
            call.reject("No local image was selected");
            return;
        }
        worker.execute(() -> {
            Bitmap bitmap = null;
            File target = null;
            try {
                bitmap = loadBitmap(source);
                // Remove only abandoned OCR snapshots from older sessions.
                // Never touch recently created images that another scan may still use.
                purgeOldSnapshots();
                target = new File(getContext().getCacheDir(), "wave-ocr-" + UUID.randomUUID() + ".jpg");
                try (FileOutputStream out = new FileOutputStream(target)) {
                    if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 92, out)) {
                        throw new IllegalStateException("Could not prepare the photo");
                    }
                    out.getFD().sync();
                }
                JSObject response = new JSObject();
                response.put("path", Uri.fromFile(target).toString());
                response.put("width", bitmap.getWidth());
                response.put("height", bitmap.getHeight());
                // No OCR is used for this preview; this local-only analysis
                // is performed on the already decoded small image.
                try {
                    VisualScriptDetector.Result detected = VisualScriptDetector.classify(bitmap);
                    response.put("detectedScript",detected.script);
                    response.put("scriptVotes",detected.votes);
                    response.put("scriptComponents",detected.compared);
                } catch (RuntimeException visualError) {
                    // Script detection is optional. A failed probe must not
                    // prevent the original photo from reaching full offline OCR.
                    android.util.Log.w("WaveOCR", "Visual script probe unavailable; using full OCR", visualError);
                    response.put("detectedScript", "unknown");
                }
                call.resolve(response);
            } catch (OutOfMemoryError e) {
                if (target != null) target.delete();
                call.reject("Insufficient memory preparing OCR photo");
            } catch (Exception e) {
                if (target != null) target.delete();
                call.reject("Photo preparation failed: " + e.getMessage(), e);
            } finally {
                if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            }
        });
    }

    private void purgeOldSnapshots() {
        File cache = getContext().getCacheDir();
        File[] files = cache.listFiles((dir, name) ->
                name.startsWith("wave-ocr-") && name.endsWith(".jpg"));
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - 24L * 60L * 60L * 1000L;
        for (File file : files) {
            if (file.isFile() && file.lastModified() > 0 && file.lastModified() < cutoff) {
                file.delete();
            }
        }
    }

    @PluginMethod
    public void releaseImage(PluginCall call) {
        final String source = call.getString("path");
        if (source != null) {
            try {
                Uri uri = Uri.parse(source);
                File image = new File(uri.getPath() == null ? "" : uri.getPath());
                File cache = getContext().getCacheDir();
                if (image.getCanonicalFile().getParentFile().equals(cache.getCanonicalFile())
                        && image.getName().startsWith("wave-ocr-")
                        && image.getName().endsWith(".jpg")) {
                    image.delete();
                }
            } catch (Exception ignored) {
                // Never allow cleanup to mask the actual OCR result/error.
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        final String source = call.getString("path");
        final String language = call.getString("language", "kaz+rus");
        if (source == null || source.trim().isEmpty() ||
                !("rus".equals(language) || "kaz".equals(language) || "rus+kaz".equals(language) || "kaz+rus".equals(language))) {
            call.reject("Invalid local image path or OCR language");
            return;
        }
        worker.execute(() -> {
            TessBaseAPI api = null;
            Bitmap bitmap = null;
            try {
                File modelsRoot = installModels(language);
                bitmap = loadBitmap(source);
                api = new TessBaseAPI();
                if (!api.init(modelsRoot.getAbsolutePath(), language)) {
                    throw new IllegalStateException("Offline Cyrillic OCR models could not be initialized");
                }
                api.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO);
                api.setImage(bitmap);
                String resultText = api.getUTF8Text();
                int confidence = api.meanConfidence();
                JSArray lines = new JSArray();
                ResultIterator iterator = api.getResultIterator();
                boolean geometryTruncated = false;
                if (iterator != null) {
                    try {
                        iterator.begin();
                        do {
                            String text = iterator.getUTF8Text(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE);
                            int[] box = iterator.getBoundingBox(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE);
                            if (text == null || text.trim().isEmpty() ||
                                    !isValidTextLineBox(box, bitmap.getWidth(), bitmap.getHeight())) continue;
                            if (lines.length() >= MAX_REPORTED_TEXT_LINES) {
                                geometryTruncated = true;
                                break;
                            }
                            JSObject line = new JSObject();
                            line.put("text", text.trim());
                            // Match ML Kit's left/top/right/bottom layout. Both
                            // recognizers now report fractions of the same oriented image.
                            line.put("left", (double)box[0] / bitmap.getWidth());
                            line.put("top", (double)box[1] / bitmap.getHeight());
                            line.put("right", (double)box[2] / bitmap.getWidth());
                            line.put("bottom", (double)box[3] / bitmap.getHeight());
                            line.put("confidence", iterator.confidence(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE));
                            lines.put(line);
                        } while (iterator.next(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE));
                    } finally {
                        iterator.delete();
                    }
                }
                JSObject response = new JSObject();
                response.put("text", resultText == null ? "" : resultText);
                response.put("confidence", confidence);
                response.put("lines", lines);
                response.put("truncatedGeometry", geometryTruncated);
                call.resolve(response);
            } catch (OutOfMemoryError e) {
                call.reject("Insufficient memory for offline Russian/Kazakh OCR");
            } catch (Exception e) {
                call.reject("Offline Russian/Kazakh OCR failed: " + e.getMessage(), e);
            } finally {
                if (api != null) api.recycle();
                if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            }
        });
    }

    /** Only extract the requested APK-bundled files on first use. */
    static String[] requiredModels(String language) {
        switch (language) {
            case "rus": return new String[]{"rus"};
            case "kaz": return new String[]{"kaz"};
            case "rus+kaz":
            case "kaz+rus": return new String[]{"rus", "kaz"};
            default: throw new IllegalArgumentException("Unsupported offline OCR language");
        }
    }

    static boolean isValidTextLineBox(int[] box, int width, int height) {
        return box != null && box.length >= 4 && width > 0 && height > 0 &&
            box[0] >= 0 && box[1] >= 0 && box[2] <= width && box[3] <= height &&
            box[2] > box[0] && box[3] > box[1];
    }

    private File installModels(String language) throws Exception {
        File root = new File(getContext().getFilesDir(), "wave-ocr-bundled-v1");
        File directory = new File(root, "tessdata");
        if (!directory.isDirectory() && !directory.mkdirs())
            throw new IllegalStateException("Cannot initialize OCR storage");
        for (String model : requiredModels(language)) {
            copyBundledModel(directory, model, "rus".equals(model) ? RUS_SIZE : KAZ_SIZE);
        }
        return root;
    }

    /**
     * Validate actual bytes, not just file length: same-size corruption must
     * never make an offline model appear usable. The Git object format is
     * SHA1("blob " + decimalSize + NUL + fileContents).
     * The build host verifies the same pinned hash before packaging.
     */
    static boolean isVerifiedBundledModel(File file, String language) throws Exception {
        long expectedSize;
        String expectedHash;
        if ("rus".equals(language)) {
            expectedSize = RUS_SIZE;
            expectedHash = RUS_BLOB;
        } else if ("kaz".equals(language)) {
            expectedSize = KAZ_SIZE;
            expectedHash = KAZ_BLOB;
        } else {
            throw new IllegalArgumentException("Unexpected bundled OCR language");
        }
        if (!file.isFile() || file.length() != expectedSize) return false;
        MessageDigest hash = MessageDigest.getInstance("SHA-1");
        hash.update(("blob " + expectedSize + "\0").getBytes(StandardCharsets.UTF_8));
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = in.read(buffer)) != -1) hash.update(buffer, 0, count);
        }
        byte[] digest = hash.digest();
        StringBuilder hex = new StringBuilder(digest.length * 2);
        for (byte value : digest) {
            hex.append(Character.forDigit((value >>> 4) & 0x0f, 16));
            hex.append(Character.forDigit(value & 0x0f, 16));
        }
        return expectedHash.equals(hex.toString());
    }

    private void copyBundledModel(File directory, String name, long expectedSize) throws Exception {
        File target = new File(directory, name + ".traineddata");
        if (isVerifiedBundledModel(target, name)) return;
        // A bad previously copied file can be repaired LOCALLY from the APK,
        // without network or a system model manager.
        File temp = File.createTempFile(name + "-verified-", ".tmp", directory);
        try {
            try (InputStream in = getContext().getAssets().open("tessdata/" + name + ".traineddata");
                 FileOutputStream out = new FileOutputStream(temp)) {
                byte[] buffer = new byte[65536];
                int count;
                while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                out.getFD().sync();
            }
            if (temp.length() != expectedSize || !isVerifiedBundledModel(temp, name)) {
                throw new IllegalStateException("Bundled OCR language file is corrupt: " + name);
            }
            // Both files are on the same app-private filesystem. Linux rename
            // replaces the target in one operation; do not remove it first.
            if (!temp.renameTo(target)) {
                throw new IllegalStateException("Cannot atomically restore offline OCR model: " + name);
            }
        } finally {
            if (temp.exists()) temp.delete();
        }
    }

    private static InputStream openLocalImage(Context context, String source) throws Exception {
        Uri uri = Uri.parse(source);
        String scheme = uri.getScheme();
        if ("content".equals(scheme) || "android.resource".equals(scheme)) {
            InputStream stream = context.getContentResolver().openInputStream(uri);
            if (stream == null) throw new IllegalArgumentException("Selected image is unreadable");
            return stream;
        }
        if (scheme == null || "file".equals(scheme)) {
            String path = "file".equals(scheme) ? uri.getPath() : source;
            if (path == null) throw new IllegalArgumentException("Image path is empty");
            return new java.io.FileInputStream(path);
        }
        throw new IllegalArgumentException("Only local photos can be scanned");
    }

    private Bitmap loadBitmap(String source) throws Exception {
        return loadBitmap(getContext(), source);
    }

    // Testable against a real Android ContentResolver without initializing
    // Capacitor's entire camera UI. Both paths use the SAME decoder.
    static Bitmap loadBitmap(Context context, String source) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream input = openLocalImage(context, source)) { BitmapFactory.decodeStream(input, null, bounds); }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IllegalArgumentException("Invalid image");
        // Reject unreasonable decoder metadata before allocating a bitmap.
        // This protects older phones against malicious or corrupted images.
        if (bounds.outWidth > 100000 || bounds.outHeight > 100000
                || (long) bounds.outWidth * (long) bounds.outHeight > 200000000L) {
            throw new IllegalArgumentException("Image dimensions exceed safe OCR limits");
        }
        // Low-RAM Android devices cannot reliably hold a large decoded
        // bitmap + ML Kit/Tesseract buffers + WebView simultaneously.
        // Sample before allocating instead of relying on OutOfMemoryError.
        ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        boolean lowRam = manager != null && manager.isLowRamDevice();
        long maxPixels = lowRam ? 6000000L : 12000000L;
        int maxEdge = lowRam ? 3200 : 4500;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 1;
        while ((long)(bounds.outWidth / options.inSampleSize) * (bounds.outHeight / options.inSampleSize) > maxPixels
                || Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > maxEdge) {
            options.inSampleSize *= 2;
        }
        Bitmap bitmap;
        try (InputStream input = openLocalImage(context, source)) {
            bitmap = BitmapFactory.decodeStream(input, null, options);
        }
        if (bitmap == null) throw new IllegalArgumentException("Cannot decode selected image");
        // Gallery imports may retain EXIF orientation even when their pixels are
        // unrotated. Apply rotation/mirror BEFORE OCR and before extracting boxes.
        int orientation = ExifInterface.ORIENTATION_NORMAL;
        try (InputStream input = openLocalImage(context, source)) {
            orientation = new ExifInterface(input).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
        } catch (Exception ignored) {
            // Some image providers strip EXIF; in that case use decoded pixels.
        }
        Matrix matrix = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.setScale(-1f, 1f); break;
            case ExifInterface.ORIENTATION_ROTATE_180: matrix.setRotate(180f); break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL: matrix.setScale(1f, -1f); break;
            case ExifInterface.ORIENTATION_TRANSPOSE: matrix.setRotate(90f); matrix.postScale(-1f, 1f); break;
            case ExifInterface.ORIENTATION_ROTATE_90: matrix.setRotate(90f); break;
            case ExifInterface.ORIENTATION_TRANSVERSE: matrix.setRotate(270f); matrix.postScale(-1f, 1f); break;
            case ExifInterface.ORIENTATION_ROTATE_270: matrix.setRotate(270f); break;
            default: break;
        }
        if (!matrix.isIdentity()) {
            Bitmap corrected = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
            if (corrected != bitmap) bitmap.recycle();
            bitmap = corrected;
        }
        return bitmap;
    }
}
