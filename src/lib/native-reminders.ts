import {Capacitor,registerPlugin} from "@capacitor/core";
import type {Note} from "./notes-store";
import {nextRecurringReminder} from "./note-reminders";

type Entry={id:string;at:number;repeat?:"daily"|"weekly"};
const plugin=registerPlugin<{
 sync(args:{entries:Entry[]}):Promise<{count:number;granted:boolean}>;
 requestNotifications():Promise<{granted:boolean}>;
}>("NativeReminders");
const android=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==="android";
let pending:Promise<void>=Promise.resolve();

export function reminderSchedule(notes:readonly Note[],now=Date.now()):Entry[]{
 return notes.flatMap(n=>{
  const at=n.reminderAt;
  if(typeof at!=="number"||!Number.isSafeInteger(at)||at<946684800000||at>=4102444800000)return [];
  const repeat=n.reminderRepeat==="daily"||n.reminderRepeat==="weekly"?n.reminderRepeat:undefined;
  const next=at>now?at:repeat?nextRecurringReminder(at,repeat,now):undefined;
  return next===undefined?[]:[{id:n.id,at:next,repeat}];
 }).sort((a,b)=>a.at-b.at).slice(0,64);
}
/** Serialize bridge calls to avoid older schedules racing with newer saves. */
export function queueNativeReminderSync(notes:readonly Note[]):void{
 if(!android())return;
 const entries=reminderSchedule(notes);
 pending=pending.catch(()=>undefined).then(async()=>{
  try{await plugin.sync({entries});}
  catch(error){console.warn("[Wave Notes] Android reminder sync failed",error);}
 });
}
export async function requestNativeReminderPermission():Promise<boolean>{
 if(!android())return true;
 try{return (await plugin.requestNotifications()).granted;}
 catch(error){console.warn("[Wave Notes] Notification permission unavailable",error);return false;}
}
