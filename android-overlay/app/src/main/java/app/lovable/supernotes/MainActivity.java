package app.lovable.supernotes;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register app-local native plugins before the bridge boots.
        registerPlugin(PdfPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
