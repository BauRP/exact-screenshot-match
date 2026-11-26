import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {reminderHomePreview} from "../src/lib/reminder-dashboard";
import {snoozeReminderTime} from "../src/lib/note-reminders";

const home=readFileSync("src/routes/index.tsx","utf8");
const view=readFileSync("src/lib/reminder-dashboard.ts","utf8");
for(const marker of [
 "const dueNotes=reminderPreview.overdue",
 "const upcomingNotes=reminderPreview.upcoming",
 'aria-label="Просроченные напоминания"',
 'aria-label="Ближайшие напоминания"',
 "Напоминания к выполнению",
 "snoozeReminderTime(operation)",
 'changeDueReminder(note.id,"clear")',
 'setSearchFilter("overdue")',
 "Android-уведомления доступны после разрешения в системе",
])assert.ok(home.includes(marker),marker);
assert.ok(view.includes("reminderIsDue(n.reminderAt,now)"));
assert.ok(view.includes("reminderIsUpcoming(n.reminderAt,7,now)"));
assert.ok(typeof snoozeReminderTime==="function");

const at=Date.now(),fixtures=[
 {id:"past",folderId:"work",reminderAt:at-60_000},
 {id:"next",folderId:"work",reminderAt:at+60_000},
 {id:"other",folderId:"home",reminderAt:at-30_000},
] as any;
const scoped=reminderHomePreview(fixtures,new Set(["work"]),at);
assert.deepEqual(scoped.overdue.map(n=>n.id),["past"]);
assert.deepEqual(scoped.upcoming.map(n=>n.id),["next"]);
assert.deepEqual(reminderHomePreview(fixtures,"all",at).overdue.map(n=>n.id),["past","other"]);
console.log("Due and upcoming reminders, snooze actions and Android notification guidance checked");
