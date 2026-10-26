package app.lovable.supernotes;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "OfflineCyrillicOcr")
public class OfflineCyrillicOcrPlugin extends Plugin {
    private static final long RUS_SIZE = 3861738L;
    private static final long KAZ_SIZE = 4734644L;
    // Keep one native recognizer at a time on a worker thread, never on Android UI.
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void recognize(PluginCall call) {
        final String source = call.getString("path");
        final String language = call.getString("language", "rus+kaz");
        if (source == null || source.trim().isEmpty() ||
                !("rus".equals(language) || "kaz".equals(language) || "rus+kaz".equals(language))) {
            call.reject("Invalid local image path or OCR language");
            return;
        }
        worker.execute(() -> {
            TessBaseAPI api = null;
            Bitmap bitmap = null;
            try {
                File modelsRoot = installModels();
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
                if (iterator != null) {
                    try {
                        iterator.begin();
                        do {
                            String text = iterator.getUTF8Text(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE);
                            int[] box = iterator.getBoundingBox(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE);
                            if (text == null || text.trim().isEmpty() || box == null || box.length < 4) continue;
                            JSObject line = new JSObject();
                            line.put("text", text.trim());
                            line.put("x", (double)box[0] / bitmap.getWidth());
                            line.put("y", (double)box[1] / bitmap.getHeight());
                            line.put("width", (double)(box[2] - box[0]) / bitmap.getWidth());
                            line.put("height", (double)(box[3] - box[1]) / bitmap.getHeight());
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
                call.resolve(response);
            } catch (Exception e) {
                call.reject("Offline Russian/Kazakh OCR failed: " + e.getMessage(), e);
            } finally {
                if (api != null) api.recycle();
                if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            }
        });
    }

    private File installModels() throws Exception {
        File root = new File(getContext().getFilesDir(), "wave-ocr-bundled-v1");
        File directory = new File(root, "tessdata");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("Cannot initialize OCR storage");
        copyBundledModel(directory, "rus", RUS_SIZE);
        copyBundledModel(directory, "kaz", KAZ_SIZE);
        return root;
    }

    private void copyBundledModel(File directory, String name, long expectedSize) throws Exception {
        File target = new File(directory, name + ".traineddata");
        if (target.isFile() && target.length() == expectedSize) return;
        File temp = new File(directory, name + ".tmp");
        try (InputStream in = getContext().getAssets().open("tessdata/" + name + ".traineddata");
             FileOutputStream out = new FileOutputStream(temp)) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
            out.getFD().sync();
        }
        if (temp.length() != expectedSize) throw new IllegalStateException("Bundled OCR language file is incomplete: " + name);
        if (target.exists() && !target.delete()) throw new IllegalStateException("Cannot replace OCR model");
        if (!temp.renameTo(target)) throw new IllegalStateException("Cannot install bundled OCR model");
    }

    private InputStream openLocalImage(String source) throws Exception {
        Uri uri = Uri.parse(source);
        String scheme = uri.getScheme();
        if ("content".equals(scheme) || "android.resource".equals(scheme)) {
            InputStream stream = getContext().getContentResolver().openInputStream(uri);
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
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream input = openLocalImage(source)) { BitmapFactory.decodeStream(input, null, bounds); }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IllegalArgumentException("Invalid image");
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 1;
        while ((long)(bounds.outWidth / options.inSampleSize) * (bounds.outHeight / options.inSampleSize) > 12000000L
                || Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 4500) {
            options.inSampleSize *= 2;
        }
        try (InputStream input = openLocalImage(source)) {
            Bitmap bitmap = BitmapFactory.decodeStream(input, null, options);
            if (bitmap == null) throw new IllegalArgumentException("Cannot decode selected image");
            return bitmap;
        }
    }
}
