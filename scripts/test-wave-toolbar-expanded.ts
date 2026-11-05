import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {TOOLBAR_TOOLS,validToolbarOrder,validHiddenToolbar,toolbarPreset} from "../src/lib/editor-preferences";
const ids=TOOLBAR_TOOLS.map(t=>t.id);
for(const id of ["pin","paperMood","paperRule","direction","pageActions"])assert.ok(ids.includes(id),id);
assert.equal(new Set(ids).size,ids.length);
assert.deepEqual(validToolbarOrder(["paperMood","pin","paperMood","bogus"]),[
 "paperMood","pin",...ids.filter(id=>id!=="paperMood"&&id!=="pin")
]);
assert.deepEqual(validHiddenToolbar(["paperRule","pageActions","pageActions","bogus"]),["paperRule","pageActions"]);
assert.equal(validToolbarOrder(["pageActions","pin"])[ids.length-1],"pageActions");
for(const mode of ["writing","media","all"] as const){
 const preset=toolbarPreset(mode);
 assert.deepEqual([...new Set(preset.toolbarOrder)].sort(),[...ids].sort(),"Preset must retain every toolbar tool");
}
const ui=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const key of ['toolVisible("pin")','toolVisible("paperMood")','toolVisible("paperRule")','toolVisible("direction")','toolVisible("pageActions")']){
 assert.ok(ui.includes(key),key);
}
const settings=readFileSync("src/routes/settings.tsx","utf8");
assert.ok(settings.includes("TOOLBAR_TOOLS.map(tool=>"));
console.log("New editor controls support persistent visibility, reorder and existing toolbar presets");
