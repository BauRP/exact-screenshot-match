import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {reminderHomePreview} from "../src/lib/reminder-dashboard";
const now=new Date("2026-11-04T08:00:00Z").getTime();
const sample=[
 {id:"past",folderId:"work",reminderAt:now-60000},
 {id:"soon",folderId:"work",reminderAt:now+1000},
 {id:"next",folderId:"work",reminderAt:now+3600000},
 {id:"other",folderId:"home",reminderAt:now+2000},
 {id:"beyond",folderId:"work",reminderAt:now+8*86400000},
 {id:"broken",folderId:"work",reminderAt:Number.NaN},
] as any;
const scoped=reminderHomePreview(sample,new Set(["work"]),now);
assert.deepEqual(scoped.overdue.map(n=>n.id),["past"]);
assert.deepEqual(scoped.upcoming.map(n=>n.id),["soon","next"]);
assert.deepEqual(reminderHomePreview(sample,"all",now).upcoming.map(n=>n.id),["soon","other","next"]);
assert.equal(reminderHomePreview(sample,new Set(["work"]),now,1).upcoming.length,1);
assert.deepEqual(reminderHomePreview(sample,new Set(["work"]),now,0).upcoming,[]);
assert.deepEqual(reminderHomePreview([],new Set(["work"]),now).overdue,[]);
const source=readFileSync("src/routes/index.tsx","utf8");
for(const mark of ['reminderHomePreview(notes,activeFolder==="all"?"all":scopedFolderIds,reminderMinute*60000)',
 'aria-label="Ближайшие напоминания"',
 'aria-label="Просроченные напоминания"',
 'Android-уведомления доступны после разрешения в системе',
 'setSearchFilter("upcoming")'])assert.ok(source.includes(mark),mark);
assert.ok(!source.includes("descendantFolderIds(folders,activeFolder).has(note.folderId"));
console.log("Home reminders: real due/upcoming panels, scoped dates and no duplicate traversal");
