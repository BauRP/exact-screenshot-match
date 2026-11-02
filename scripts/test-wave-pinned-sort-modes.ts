import {strict as assert} from "node:assert";
import {sortNotes,type Note} from "../src/lib/notes-store";
const input:Note[]=[
 {id:"a",title:"Zulu",body:"A",pinned:true,createdAt:1,updatedAt:2},
 {id:"b",title:"Alpha",body:"B",pinned:true,createdAt:3,updatedAt:5},
 {id:"c",title:"Beta",body:"C",pinned:false,createdAt:7,updatedAt:8},
 {id:"d",title:"Gamma",body:"D",pinned:false,createdAt:6,updatedAt:9}
];
assert.deepEqual(sortNotes(input,"alpha").map(x=>x.id),["b","a","c","d"]);
assert.deepEqual(sortNotes(input,"created").map(x=>x.id),["b","a","c","d"]);
assert.deepEqual(sortNotes(input,"updated").map(x=>x.id),["b","a","d","c"]);
assert.deepEqual(input.map(x=>x.id),["a","b","c","d"]);
console.log("Pinned note sorting obeys selected mode without mutating records");
