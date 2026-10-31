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
