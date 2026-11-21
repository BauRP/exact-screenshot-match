import {strict as assert} from "node:assert";
import {parseStoredNotes} from "../src/lib/notes-store";
const valid={id:"one",title:"Original",body:"<p>Important data</p>",createdAt:1,updatedAt:1};
assert.equal(parseStoredNotes(JSON.stringify([valid]))[0].body,valid.body);
for(const broken of [
 [{...valid,id:""}],
 [{...valid,id:"one"}, {...valid,title:"Another"}],
 [{...valid,body:null}],
 [{...valid,body:undefined}],
 [{...valid,title:42}],
 [{...valid,id:null}]
]){
 assert.throws(()=>parseStoredNotes(JSON.stringify(broken)),/Original data is preserved/);
}
assert.deepEqual(parseStoredNotes(null),[]);
assert.throws(()=>parseStoredNotes(""),/Original data is preserved/);
console.log("Corrupt note IDs, duplicates and missing bodies are blocked without overwrites");
