
import { strict as assert } from "node:assert";
const root=await Bun.file("src/routes/__root.tsx").text();
const runtime=await Bun.file("src/components/NativeAdRuntime.tsx").text();
const index=await Bun.file("src/routes/index.tsx").text();
const ui=await Bun.file("src/lib/native-ad-ui.ts").text();
assert.match(root, /<NativeAdRuntime \/>/);
assert.match(runtime, /useNativeAdFeed\(view, pathname !== "\/" \|\| blockingDialog\)/);
assert.doesNotMatch(index, /useNativeAdFeed\(/);
assert.match(index, /setNativeAdDialogBlocked\(renameValue !== null \|\| confirmDelete/);
assert.match(index, /<TopContextMenuPanel/);
assert.doesNotMatch(index, /<DropdownMenuContent/);
assert.match(index, /className="col-span-full min-w-0"/);
assert.match(index, /% 5 === 0/);
assert.match(index, /home-after-/);
assert.match(ui, /blockingDialog/);
console.log("Native feed remains across routes; in-flow menu keeps ad visible; grid ad full-width; 5 note spacing: PASS");
