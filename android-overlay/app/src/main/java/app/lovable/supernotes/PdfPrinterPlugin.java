package app.lovable.supernotes;

import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Hands a local PDF file to the Android system print dialog (print spooler)
 * through the native PrintManager API.
 */
@CapacitorPlugin(name = "PdfPrinter")
public class PdfPrinterPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        final String uri = call.getString("uri");
        final String name = call.getString("name", "document.pdf");

        if (uri == null || uri.isEmpty()) {
            call.reject("Missing PDF uri");
            return;
        }

        final File file = resolveFile(uri);
        if (file == null || !file.exists()) {
            call.reject("PDF file not found: " + uri);
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                Context context = getContext();
                PrintManager printManager = (PrintManager) context.getSystemService(Context.PRINT_SERVICE);
                if (printManager == null) {
                    call.reject("PrintManager unavailable on this device");
                    return;
                }

                PrintAttributes attributes = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .build();

                printManager.print(name, new FilePrintDocumentAdapter(file, name), attributes);
                call.resolve(new JSObject().put("printed", true));
            } catch (Exception error) {
                call.reject("Unable to open the print dialog", error);
            }
        });
    }

    private File resolveFile(String value) {
        try {
            if (value.startsWith("file://") || value.startsWith("content://")) {
                Uri parsed = Uri.parse(value);
                String path = parsed.getPath();
                return path == null ? null : new File(path);
            }
            return new File(value);
        } catch (Exception error) {
            return null;
        }
    }

    /** Streams an existing PDF file straight into the print spooler. */
    private static class FilePrintDocumentAdapter extends PrintDocumentAdapter {
        private final File file;
        private final String name;

        FilePrintDocumentAdapter(File file, String name) {
            this.file = file;
            this.name = name;
        }

        @Override
        public void onLayout(
                PrintAttributes oldAttributes,
                PrintAttributes newAttributes,
                CancellationSignal cancellationSignal,
                LayoutResultCallback callback,
                Bundle extras) {
            if (cancellationSignal != null && cancellationSignal.isCanceled()) {
                callback.onLayoutCancelled();
                return;
            }

            PrintDocumentInfo info = new PrintDocumentInfo.Builder(name)
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                    .build();

            callback.onLayoutFinished(info, true);
        }

        @Override
        public void onWrite(
                PageRange[] pages,
                ParcelFileDescriptor destination,
                CancellationSignal cancellationSignal,
                WriteResultCallback callback) {
            InputStream input = null;
            OutputStream output = null;
            try {
                input = new FileInputStream(file);
                output = new FileOutputStream(destination.getFileDescriptor());

                byte[] buffer = new byte[16 * 1024];
                int read;
                while ((read = input.read(buffer)) > 0) {
                    if (cancellationSignal != null && cancellationSignal.isCanceled()) {
                        callback.onWriteCancelled();
                        return;
                    }
                    output.write(buffer, 0, read);
                }
                output.flush();
                callback.onWriteFinished(new PageRange[] { PageRange.ALL_PAGES });
            } catch (Exception error) {
                callback.onWriteFailed(error.getMessage());
            } finally {
                try { if (input != null) input.close(); } catch (Exception ignored) {}
                try { if (output != null) output.close(); } catch (Exception ignored) {}
            }
        }
    }
}
