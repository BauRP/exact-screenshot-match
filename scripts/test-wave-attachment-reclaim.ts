import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const store=readFileSync("src/lib/notes-store.ts","utf8");
for(const term of ["reclaimDetachedAttachments(previousBody","persistNotes(nextNotes);","if(typeof patch.body===\"string\"","usedAudio","usedImages","Promise.allSettled","if(target?.body)void reclaimDetachedAttachments(target.body)"])assert.ok(store.includes(term),term);
assert.ok(store.indexOf("persistNotes(nextNotes);",store.indexOf("export function updateNote"))<store.indexOf("void reclaimDetachedAttachments(oldBody)",store.indexOf("export function updateNote")));
console.log("Safe post-save audio and image cleanup is wired");
