package app.lovable.supernotes;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import java.util.Calendar;
import java.util.HashSet;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONObject;

/** All notifications are generic; private note contents never leave the app. */
@CapacitorPlugin(name="NativeReminders",permissions={
 @Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})
})
public class NativeReminderPlugin extends Plugin {
 static final String PREF="wave.reminders.v1",KEY="entries";
 static final int BASE=47000,MAX=64;
 static boolean allowed(Context c){
  return Build.VERSION.SDK_INT<33 ||
   ContextCompat.checkSelfPermission(c,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;
 }
 @PluginMethod public void requestNotifications(PluginCall call){
  if(Build.VERSION.SDK_INT<33||allowed(getContext())){JSObject r=new JSObject();r.put("granted",true);call.resolve(r);return;}
  requestPermissionForAlias("notifications",call,"permissionDone");
 }
 @PermissionCallback private void permissionDone(PluginCall call){
  JSObject r=new JSObject();r.put("granted",allowed(getContext()));call.resolve(r);
 }
 @PluginMethod public void sync(PluginCall call){
  JSArray incoming=call.getArray("entries");
  if(incoming==null){call.reject("Нет расписания напоминаний");return;}
  try{
   JSONArray next=new JSONArray();
   HashSet<String> seenIds=new HashSet<>();
   for(int i=0;i<incoming.length()&&next.length()<MAX;i++){
    JSONObject e=incoming.optJSONObject(i);
    if(e==null)continue;
    String id=e.optString("id","");
    long at=e.optLong("at",0);
    if(!id.matches("[a-zA-Z0-9_-]{1,128}")||seenIds.contains(id)||at<=System.currentTimeMillis()||at>=4102444800000L)continue;
    seenIds.add(id);
    JSONObject item=new JSONObject();item.put("id",id);item.put("at",at);
    String repeat=e.optString("repeat","");
    if("daily".equals(repeat)||"weekly".equals(repeat))item.put("repeat",repeat);
    next.put(item);
   }
   SharedPreferences prefs=getContext().getSharedPreferences(PREF,Context.MODE_PRIVATE);
   JSONArray old=new JSONArray(prefs.getString(KEY,"[]"));
   if(!prefs.edit().putString(KEY,next.toString()).commit()){call.reject("Расписание не сохранилось");return;}
   for(int i=0;i<old.length();i++)cancel(getContext(),BASE+i);
   schedule(getContext(),next);
   JSObject result=new JSObject();result.put("count",next.length());
   result.put("granted",allowed(getContext()));call.resolve(result);
  }catch(Exception e){call.reject("Ошибка расписания",e);}
 }
 /** Advance by CALENDAR days in local time so a 9:00 reminder stays at
  * 9:00 across daylight-saving changes, including when the phone was off. */
 static long futureOccurrence(long previous,String repeat,long now){
  int step="daily".equals(repeat)?1:"weekly".equals(repeat)?7:0;
  if(step==0||previous<=0||previous>=4102444800000L)return -1L;
  if(previous>now)return previous;
  Calendar cal=Calendar.getInstance();
  cal.setTimeInMillis(previous);
  long passed=Math.max(0,(now-previous)/(86400000L*step)-2L);
  int advance=(int)Math.min(passed,30000L);
  if(advance>0)cal.add(Calendar.DAY_OF_YEAR,advance*step);
  for(int i=0;i<8&&cal.getTimeInMillis()<=now;i++)cal.add(Calendar.DAY_OF_YEAR,step);
  long result=cal.getTimeInMillis();
  return result>now&&result<4102444800000L?result:-1L;
 }
 static void restore(Context c){
  try{
   SharedPreferences prefs=c.getSharedPreferences(PREF,Context.MODE_PRIVATE);
   JSONArray items=new JSONArray(prefs.getString(KEY,"[]"));
   long now=System.currentTimeMillis();
   boolean changed=false;
   for(int i=0;i<items.length();i++){
    JSONObject item=items.optJSONObject(i);
    if(item==null)continue;
    long at=item.optLong("at",0);
    if(at>now)continue;
    long next=futureOccurrence(at,item.optString("repeat",""),now);
    if(next>now){item.put("at",next);changed=true;}
   }
   if(changed&&!prefs.edit().putString(KEY,items.toString()).commit())return;
   schedule(c,items);
  }catch(Exception ignored){}
 }
 static PendingIntent alarm(Context c,int id){
  Intent intent=new Intent(c,AlarmReceiver.class);intent.putExtra("id",id);
  return PendingIntent.getBroadcast(c,id,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
 }
 static void cancel(Context c,int id){
  AlarmManager manager=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
  if(manager!=null)manager.cancel(alarm(c,id));
 }
 static void schedule(Context c,JSONArray entries){
  if(!allowed(c))return;
  AlarmManager manager=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
  if(manager==null)return;
  for(int i=0;i<entries.length();i++){
   JSONObject e=entries.optJSONObject(i);if(e==null)continue;
   long at=e.optLong("at",0);if(at<=System.currentTimeMillis())continue;
   PendingIntent p=alarm(c,BASE+i);
   if(Build.VERSION.SDK_INT>=23)manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,p);
   else manager.set(AlarmManager.RTC_WAKEUP,at,p);
  }
 }
 public static class BootReceiver extends BroadcastReceiver{
  @Override public void onReceive(Context c,Intent intent){
   String action=intent==null?null:intent.getAction();
   if(!Intent.ACTION_BOOT_COMPLETED.equals(action)&&!Intent.ACTION_TIME_CHANGED.equals(action)&&
      !Intent.ACTION_TIMEZONE_CHANGED.equals(action))return;
   try{
    restore(c);
   }catch(Exception ignored){}
  }
 }
 public static class AlarmReceiver extends BroadcastReceiver{
  @Override public void onReceive(Context c,Intent intent){
   if(!allowed(c))return;
   NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
   if(manager==null)return;
   String channel="wave_notes_reminders";
   if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(
    new NotificationChannel(channel,"Напоминания Wave Notes",NotificationManager.IMPORTANCE_DEFAULT));
   Intent open=c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
   if(open==null)return;
   PendingIntent click=PendingIntent.getActivity(c,0,open,
    PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
   Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(c,channel):new Notification.Builder(c);
   builder.setSmallIcon(R.drawable.ic_notification).setContentTitle("Напоминание Wave Notes")
    .setContentText("Откройте приложение, чтобы посмотреть напоминания")
    .setContentIntent(click).setAutoCancel(true);
   int slot=intent==null?-1:intent.getIntExtra("id",-1)-BASE;
   if(slot<0||slot>=MAX)return;
   manager.notify(BASE+slot,builder.build());
   // Repeating reminders must also fire after the app is closed. Persist
   // only ID, recurrence and timestamp; never copy note text into alarms.
   try{
    SharedPreferences prefs=c.getSharedPreferences(PREF,Context.MODE_PRIVATE);
    JSONArray list=new JSONArray(prefs.getString(KEY,"[]"));
    JSONObject item=list.optJSONObject(slot);
    if(item==null)return;
    long next=futureOccurrence(item.optLong("at",0),item.optString("repeat",""),System.currentTimeMillis());
    if(next>System.currentTimeMillis()){
     item.put("at",next);
     if(prefs.edit().putString(KEY,list.toString()).commit())schedule(c,list);
    }
   }catch(Exception e){android.util.Log.w("WaveNotes","Unable to advance reminder",e);}
  }
 }
}
