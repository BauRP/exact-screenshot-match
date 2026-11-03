package app.lovable.supernotes;
import android.Manifest;
import android.content.pm.PackageManager;
import android.media.MediaRecorder;
import android.os.Build;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.*;

@CapacitorPlugin(name="NativeAudioRecorder",permissions={@Permission(alias="microphone",strings={Manifest.permission.RECORD_AUDIO})})
public class NativeAudioRecorderPlugin extends Plugin{
 private MediaRecorder rec;private File file;private boolean active;private long started;
 @PluginMethod public void start(PluginCall call){
  if(active){call.reject("Запись уже выполняется");return;}
  if(ContextCompat.checkSelfPermission(getContext(),Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
   requestPermissionForAlias("microphone",call,"onPermission");return;
  }
  begin(call);
 }
 @PermissionCallback private void onPermission(PluginCall call){
  if(ContextCompat.checkSelfPermission(getContext(),Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){call.reject("Разрешите микрофон в настройках Android");return;}
  begin(call);
 }
 /** Different Android audio HALs support different AAC sampling rates.
  * Recreate the recorder after a failed prepare/start; never reuse a failed
  * MediaRecorder and never keep a partially recorded file. */
 private void startRecordingWithFormat(int sampleRate,int bitRate)throws Exception{
  file=File.createTempFile("wave-audio-", ".m4a",getContext().getCacheDir());
  rec=Build.VERSION.SDK_INT>=31?new MediaRecorder(getContext()):new MediaRecorder();
  rec.setAudioSource(MediaRecorder.AudioSource.MIC);
  rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
  rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
  rec.setAudioEncodingBitRate(bitRate);
  rec.setAudioSamplingRate(sampleRate);
  rec.setOutputFile(file.getAbsolutePath());
  rec.prepare();
  rec.start();
  active=true;started=System.currentTimeMillis();
 }
 private synchronized void begin(PluginCall call){
  if(active){call.reject("Запись уже выполняется");return;}
  try{
   startRecordingWithFormat(44100,64000);
   call.resolve();
  }catch(Exception standardFailure){
   clean();
   try{
    // Older devices and emulators can reject 44.1 kHz despite accepting AAC.
    startRecordingWithFormat(16000,32000);
    call.resolve();
   }catch(Exception fallbackFailure){
    clean();
    fallbackFailure.addSuppressed(standardFailure);
    call.reject("Не удалось включить микрофон ни в обычном, ни в совместимом режиме",fallbackFailure);
   }
  }
 }
 /** Abandon audio without serializing private microphone data. */
 @PluginMethod public synchronized void cancel(PluginCall call){
  clean();call.resolve();
 }
 @PluginMethod public synchronized void stop(PluginCall call){
  if(!active||rec==null){call.reject("Запись не запущена");return;}
  if(System.currentTimeMillis()-started<300){clean();call.reject("Запись слишком короткая. Начните новую запись и говорите не менее секунды.");return;}
  try{
   rec.stop();rec.release();rec=null;active=false;
   if(file.length()<1||file.length()>12L*1024*1024)throw new IOException("Пустая или слишком большая запись");
   ByteArrayOutputStream bytes=new ByteArrayOutputStream();
   try(FileInputStream in=new FileInputStream(file)){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1)bytes.write(buf,0,n);}
   JSObject result=new JSObject();result.put("data",Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP));result.put("mimeType","audio/mp4");call.resolve(result);
  }catch(Exception ex){call.reject("Ошибка сохранения аудио",ex);}finally{clean();}
 }
 private synchronized void clean(){
  active=false;if(rec!=null){try{rec.reset();}catch(Exception ignored){}try{rec.release();}catch(Exception ignored){}rec=null;}
  if(file!=null){file.delete();file=null;}
 }
 @Override protected void handleOnDestroy(){clean();super.handleOnDestroy();}
}