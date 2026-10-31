/** Local date and due time metadata: independent of network and notification permissions. */
const MIN_TIME=946684800000; // 2000-01-01 UTC
const MAX_TIME=4102444800000; // 2100-01-01 UTC (exclusive)
export function validReminderTime(input:unknown):number|undefined{
 return typeof input==="number"&&Number.isFinite(input)&&Number.isSafeInteger(input)&&
  input>=MIN_TIME&&input<MAX_TIME?input:undefined;
}
export function parseReminderInput(local:string):number|undefined{
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))return undefined;
 const parsed=new Date(local);
 const epoch=validReminderTime(parsed.getTime());
 if(epoch===undefined)return undefined;
 return toReminderInput(epoch)===local?epoch:undefined;
}
export function toReminderInput(value:unknown):string{
 const time=validReminderTime(value);
 if(time===undefined)return "";
 const d=new Date(time);
 const two=(n:number)=>String(n).padStart(2,"0");
 return String(d.getFullYear()).padStart(4,"0")+"-"+two(d.getMonth()+1)+"-"+two(d.getDate())+
   "T"+two(d.getHours())+":"+two(d.getMinutes());
}
export function reminderIsDue(time:unknown,now=Date.now()):boolean{
 const due=validReminderTime(time);
 return due!==undefined&&due<=now;
}
export function reminderLabel(time:unknown,now=Date.now()):string{
 const due=validReminderTime(time);
 if(due===undefined)return "";
 return (due<=now?"Просрочено: ":"Напомнить: ")+new Date(due).toLocaleString("ru-RU",{
  day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",
 });
}

/**
 * User-requested quick reminder choices. All calculations use local device
 * time so "tomorrow at 09:00" remains tomorrow across DST changes.
 */
export type ReminderPreset="hour"|"tomorrow"|"week";
/** Exact durations use milliseconds, not setHours/setMinutes: local daylight
 * saving changes must never make "in one hour" mean zero or two hours. */
function reminderAfterDuration(now:number,milliseconds:number):number{
 const epoch=validReminderTime(now);
 const target=epoch===undefined?undefined:validReminderTime(epoch+milliseconds);
 if(target===undefined)throw Error("Дата напоминания выходит за допустимые границы");
 return target;
}
export function reminderPresetTime(preset:ReminderPreset,now=Date.now()):number{
 if(preset==="hour")return reminderAfterDuration(now,60*60_000);
 const epoch=validReminderTime(now);
 if(epoch===undefined)throw Error("Дата напоминания выходит за допустимые границы");
 const date=new Date(epoch);
 if(preset==="tomorrow"){date.setDate(date.getDate()+1);date.setHours(9,0,0,0);}
 else if(preset==="week"){date.setDate(date.getDate()+7);date.setHours(9,0,0,0);}
 else throw Error("Неизвестный вариант напоминания");
 const result=validReminderTime(date.getTime());
 if(result===undefined)throw Error("Дата напоминания выходит за допустимые границы");
 return result;
}
/** Offline snooze shortcuts. Exact short durations; calendar days keep local dates. */
export type ReminderSnooze="quarter"|"hour"|"threeHours"|"tomorrow"|"threeDays"|"week";
export function snoozeReminderTime(choice:ReminderSnooze,now=Date.now()):number{
 if(choice==="quarter")return reminderAfterDuration(now,15*60_000);
 if(choice==="hour")return reminderAfterDuration(now,60*60_000);
 if(choice==="threeHours")return reminderAfterDuration(now,3*60*60_000);
 const epoch=validReminderTime(now);
 if(epoch===undefined)throw Error("Дата напоминания выходит за допустимые границы");
 const date=new Date(epoch);
 if(choice==="tomorrow"){date.setDate(date.getDate()+1);date.setHours(9,0,0,0);}
 else if(choice==="threeDays"){date.setDate(date.getDate()+3);date.setHours(9,0,0,0);}
 else if(choice==="week"){date.setDate(date.getDate()+7);date.setHours(9,0,0,0);}
 else throw Error("Неизвестный вариант напоминания");
 const result=validReminderTime(date.getTime());
 if(result===undefined)throw Error("Дата напоминания выходит за допустимые границы");
 return result;
}
export function reminderIsUpcoming(time:unknown,days=7,now=Date.now()):boolean{
 const due=validReminderTime(time);
 return due!==undefined&&due>now&&due<=now+days*86400000;
}
