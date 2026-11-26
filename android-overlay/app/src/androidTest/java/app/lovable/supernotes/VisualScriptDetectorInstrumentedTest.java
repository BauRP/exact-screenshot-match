package app.lovable.supernotes;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Android system-font image probes, no network or OCR dependencies. */
@RunWith(AndroidJUnit4.class)
public class VisualScriptDetectorInstrumentedTest {
  @Test public void emptyPhotoAbstains() {
    Bitmap bitmap=Bitmap.createBitmap(640,350,Bitmap.Config.ARGB_8888);
    bitmap.eraseColor(Color.WHITE);
    try {
      assertEquals("unknown",VisualScriptDetector.classify(bitmap).script);
    } finally {bitmap.recycle();}
  }

  @Test public void photoNoiseAbstains() {
    Bitmap bitmap=Bitmap.createBitmap(640,350,Bitmap.Config.ARGB_8888);
    bitmap.eraseColor(Color.WHITE);
    Canvas canvas=new Canvas(bitmap);
    Paint paint=new Paint();
    paint.setColor(Color.BLACK);
    for(int i=0;i<25;i++) canvas.drawLine(0,i*13,639,i*13,paint);
    try {
      assertEquals("unknown",VisualScriptDetector.classify(bitmap).script);
    } finally {bitmap.recycle();}
  }

  @Test public void ordinaryDocumentNeverCrashes() {
    Bitmap bitmap=Bitmap.createBitmap(1100,520,Bitmap.Config.ARGB_8888);
    bitmap.eraseColor(Color.WHITE);
    Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setColor(Color.BLACK);paint.setTextSize(44f);
    paint.setTypeface(Typeface.DEFAULT);
    Canvas canvas=new Canvas(bitmap);
    canvas.drawText("Привет мир. Это тест распознавания.",20,100,paint);
    canvas.drawText("Қазақ тілі, Әліпби, Өнер.",20,180,paint);
    canvas.drawText("Hello world. OCR test.",20,260,paint);
    try {
      VisualScriptDetector.Result result=VisualScriptDetector.classify(bitmap);
      assertNotNull(result);
      assertTrue(result.compared>=0);
      assertTrue(result.votes>=0);
    } finally {bitmap.recycle();}
  }
}
