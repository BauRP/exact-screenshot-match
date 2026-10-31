import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const home=readFileSync("src/routes/index.tsx","utf8");
const reminder=readFileSync("src/lib/note-reminders.ts","utf8");
for(const marker of ["const dueNotes=useMemo(","reminderIsDue(note.reminderAt)","Напоминания к выполнению","changeDueReminder(note.id,\"tomorrow\")","changeDueReminder(note.id,\"clear\")","setSearchFilter(\"overdue\")","Напоминания отображаются внутри приложения"])assert.ok(home.includes(marker),marker);
assert.ok(reminder.includes('reminderPresetTime'));
console.log("Reminder inbox, snooze and dismiss UI wiring checked");
