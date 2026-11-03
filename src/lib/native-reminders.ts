import {Capacitor,registerPlugin} from "@capacitor/core";
import type {Note} from "./notes-store";

type Entry={id:string;at:number};
const plugin=registerPlugin<{
 sync(args:{entries:Entry[]}):Promise<{count:number;granted:boolean}>;
 requestNotifications():Promise<{granted:boolean}>;
}>("NativeReminders");
const android=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==="android";
let pending:Promise<void>=Promise.resolve();

export function reminderSchedule(notes:readonly Note[],now=Date.now()):Entry[]{
 return notes.filter(n=>typeof n.reminderAt==="number"&&n.reminderAt>now&&n.reminderAt<4102444800000)
  .sort((a,b)=>a.reminderAt!-b.reminderAt!)
  .slice(0,64).map(n=>({id:n.id,at:n.reminderAt!}));
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
