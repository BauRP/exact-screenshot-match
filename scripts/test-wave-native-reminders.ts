import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {reminderSchedule} from "../src/lib/native-reminders";
const now=Date.now();
const list=Array.from({length:70},(_,i)=>({id:"id"+i,title:"Secret",body:"hidden",createdAt:now,updatedAt:now,reminderAt:now+(70-i)*60000}));
assert.equal(reminderSchedule(list,now).length,64);
assert.equal(reminderSchedule(list,now)[0].id,"id69");
assert.ok(reminderSchedule([...list,{...list[0],id:"past",reminderAt:now-1}],now).every(r=>r.at>now));
const native=readFileSync("android-overlay/app/src/main/java/app/lovable/supernotes/NativeReminderPlugin.java","utf8");
const manifest=readFileSync("android-overlay/app/src/main/AndroidManifest.xml","utf8");
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
const store=readFileSync("src/lib/notes-store.ts","utf8");
assert.ok(native.includes("setAndAllowWhileIdle("));
assert.ok(native.includes("POST_NOTIFICATIONS"));
assert.ok(native.includes("ACTION_BOOT_COMPLETED"));
assert.ok(manifest.includes("RECEIVE_BOOT_COMPLETED"));
assert.ok(editor.includes("requestNativeReminderPermission()"));
assert.ok(store.includes("queueNativeReminderSync(state.notes)"));
console.log("Android reminder alarm schedule, user consent and reboot wiring verified");

const pastDaily={id:"daily",title:"private",body:"private",createdAt:now,updatedAt:now,
 reminderAt:now-86400000*5,reminderRepeat:"daily" as const};
const pastWeekly={...pastDaily,id:"weekly",reminderRepeat:"weekly" as const};
const staleSingle={...pastDaily,id:"once",reminderRepeat:undefined};
const recurrent=reminderSchedule([pastDaily,pastWeekly,staleSingle],now);
assert.equal(recurrent.length,2);
assert.ok(recurrent.every(e=>e.at>now&&e.at<now+8*86400000));
assert.ok(recurrent.some(e=>e.id==="daily"&&e.repeat==="daily"));
assert.ok(recurrent.some(e=>e.id==="weekly"&&e.repeat==="weekly"));
assert.ok(native.includes("futureOccurrence("));
assert.ok(native.includes("Calendar.DAY_OF_YEAR"));
assert.ok(native.includes('item.put("repeat",repeat)'));
assert.ok(native.includes("manager.notify(BASE+slot"));
assert.ok(native.includes('prefs.edit().putString(KEY,list.toString()).commit()'));

const dupe=(id:string,minute:number)=>({...list[0],id,reminderAt:now+minute*60_000});
const valid=reminderSchedule([dupe("same",30),dupe("same",5),dupe("other",10),dupe("bad/id",1)],now);
assert.deepEqual(valid.map(e=>e.id),["same","other"],"Deduplicate IDs and exclude invalid Android alarm IDs");
assert.equal(valid[0].at,now+5*60_000,"Prefer nearest due time for the same note");
assert.deepEqual(reminderSchedule([dupe("one",1)],Number.NaN),[]);
assert.deepEqual(reminderSchedule([dupe("one",1)],Number.POSITIVE_INFINITY),[]);
assert.deepEqual(reminderSchedule([dupe("one",1.5)],now),[],"Noninteger due timestamps are rejected");

