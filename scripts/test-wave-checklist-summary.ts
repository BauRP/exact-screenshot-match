import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const sum=readFileSync("src/lib/note-checklist-summary.ts","utf8");
const search=readFileSync("src/lib/note-search.ts","utf8");
const card=readFileSync("src/components/NoteCard.tsx","utf8");
const home=readFileSync("src/routes/index.tsx","utf8");
for(const needle of ["checklistSummary","total-done","data-done","data-checked","10000"])assert.ok(sum.includes(needle),needle);
for(const needle of ['filter==="pending"','checklistSummary(body).pending===0','pending'])assert.ok(search.includes(needle),needle);
assert.ok(card.includes("checklist.done"));
assert.ok(home.includes('["pending","Незавершённые"]'));
console.log("Saved checklist progress and pending filter wiring verified");

import {checklistSummary} from "../src/lib/note-checklist-summary";
const quoted='<div title="a > b" data-type="wave-check-item" data-done="true">Done</div>'+
 '<li title=\'x > y\' data-type="taskItem" data-checked="false">Pending</li>'+
 '<div title="fake data-type=\'wave-check-item\'" data-done=\'true\'>Not a task</div>';
assert.deepEqual(checklistSummary(quoted),{total:2,done:1,pending:1},
 "Actual tag attributes determine task counts, not text inside titles");
assert.equal(checklistSummary('<li data-type=taskItem data-checked=true>ok</li>').done,1);
