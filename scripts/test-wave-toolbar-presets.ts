import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {toolbarPreset,TOOLBAR_TOOLS,validToolbarOrder} from "../src/lib/editor-preferences";
const writing=toolbarPreset("writing");
assert.ok(writing.hiddenToolbar.includes("camera"));
assert.ok(!writing.hiddenToolbar.includes("search"));
assert.equal(new Set(writing.toolbarOrder).size,TOOLBAR_TOOLS.length);
assert.equal(writing.toolbarOrder[0],"search");
const media=toolbarPreset("media");assert.equal(media.toolbarOrder[0],"camera");assert.equal(media.hiddenToolbar.length,0);
const full=toolbarPreset("all");assert.deepEqual(full.toolbarOrder,validToolbarOrder(null));
assert.equal(full.hiddenToolbar.length,0);
const settings=readFileSync("src/routes/settings.tsx","utf8");
assert.ok(settings.includes('changePref(toolbarPreset(mode))'));
assert.ok(settings.includes("Фото и звук"));
console.log("Writing/media/all toolbar presets retain a full safe permutation");

const tasks=toolbarPreset("tasks");
assert.equal(tasks.toolbarOrder[0],"checklist");
for(const hidden of ["audio","drawing","camera","gallery","paperMood","paperRule"] as const)
 assert.ok(tasks.hiddenToolbar.includes(hidden));
for(const shown of ["checklist","insert","search","formatting"] as const)
 assert.ok(!tasks.hiddenToolbar.includes(shown));
assert.equal(new Set(tasks.toolbarOrder).size,TOOLBAR_TOOLS.length);
assert.ok(settings.includes('"tasks"'));
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
assert.ok(editor.includes('mode==="tasks"'));
assert.ok(editor.includes('<option value="tasks">Для задач</option>'));

const pagesPreset=toolbarPreset("pages");
assert.equal(pagesPreset.toolbarOrder[0],"outline");
assert.ok(!pagesPreset.hiddenToolbar.includes("pageActions"));
assert.ok(!pagesPreset.hiddenToolbar.includes("direction"));
assert.ok(pagesPreset.hiddenToolbar.includes("camera"));
assert.equal(new Set(pagesPreset.toolbarOrder).size,TOOLBAR_TOOLS.length);
assert.ok(settings.includes('"pages"'));
assert.ok(editor.includes('mode==="pages"'));
assert.ok(editor.includes('<option value="pages">Для страниц</option>'));
