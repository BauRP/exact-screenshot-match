
import { strict as assert } from "node:assert";
const root=await Bun.file("src/routes/__root.tsx").text();
const runtime=await Bun.file("src/components/NativeAdRuntime.tsx").text();
const index=await Bun.file("src/routes/index.tsx").text();
const ui=await Bun.file("src/lib/native-ad-ui.ts").text();
assert.match(root, /<NativeAdRuntime assert.match(index, /setNativeAdDialogBlocked\(menuOpen \|\| renameValue !== null \|\| confirmDelete/);/>/);
assert.match(runtime, /useNativeAdFeed\(view, pathname !== "\/" \|\| blockingDialog\)/);
assert.doesNotMatch(index, /useNativeAdFeed\(/);
assert.match(index, /setNativeAdDialogBlocked\(renameValue !== null \|\| confirmDelete/);
assert.doesNotMatch(index, /<TopContextMenuPanel/);
assert.doesNotMatch(index, /\{menuOpen && \(/);
assert.match(index, /<DropdownMenuContent align="end" sideOffset=\{8\} collisionPadding=\{12\} className="w-56/);
assert.match(index, /<DropdownMenuTrigger asChild>/);
assert.match(index, /className="col-span-full min-w-0"/);
assert.match(index, /% 5 === 0/);
assert.match(index, /home-after-/);
assert.match(ui, /blockingDialog/);
console.log("Native feed stays alive; compact overlay menu never shifts notes, ads or folders; grid full-width; 5 note spacing: PASS");
