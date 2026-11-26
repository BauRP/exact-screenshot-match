import {strict as assert} from "node:assert";
import {hasDifferentSavedContent,recoveredVersionId} from "../src/lib/backup-restore-plan";

const base={
 id:"same-note",title:"Платёж",body:"<p>Оплатить счёт</p>",
 kind:"note" as const,createdAt:1000,updatedAt:2000,
 reminderAt:1773000000000,reminderRepeat:"weekly" as const,
};
const copy={...base};
assert.equal(hasDifferentSavedContent(base as any,copy as any),false);
assert.equal(recoveredVersionId(base as any),recoveredVersionId(copy as any));
const moved={...base,reminderAt:base.reminderAt+3600_000};
const repeat={...base,reminderRepeat:"daily" as const};
assert.equal(hasDifferentSavedContent(base as any,moved as any),true,
 "A changed reminder date must survive restore as a separate version");
assert.equal(hasDifferentSavedContent(base as any,repeat as any),true,
 "A changed reminder recurrence must survive restore as a separate version");
assert.notEqual(recoveredVersionId(base as any),recoveredVersionId(moved as any));
assert.notEqual(recoveredVersionId(base as any),recoveredVersionId(repeat as any));
assert.equal(hasDifferentSavedContent(base as any,{...base,updatedAt:9999,pinned:true} as any),false,
 "Read metadata and pin changes must not create duplicate backup versions");
assert.equal(hasDifferentSavedContent(base as any,{...base,title:"Счёт"} as any),true);
console.log("Restored note versions preserve reminder dates and recurrence");

const legacy={id:"legacy",title:"X",body:"<p>Y</p>",kind:"note" as const,createdAt:1,updatedAt:2};
assert.equal(recoveredVersionId(legacy as any),"restored-d85c9b41-d974542d",
 "Old backup versions without reminders must retain their original recovery IDs");
assert.equal(hasDifferentSavedContent(legacy as any,{...legacy,reminderAt:undefined} as any),false);
