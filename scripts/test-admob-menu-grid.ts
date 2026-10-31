import { strict as assert } from "node:assert";

// Source-level safeguards: ensure three dots use a compact floating menu,
// never an in-flow panel that pushes folders, notes or native ads down.
const root = await Bun.file("src/routes/__root.tsx").text();
const runtime = await Bun.file("src/components/NativeAdRuntime.tsx").text();
const index = await Bun.file("src/routes/index.tsx").text();
const ui = await Bun.file("src/lib/native-ad-ui.ts").text();
const adCard = await Bun.file("src/components/NativeAdCard.tsx").text();

assert.ok(root.includes("<NativeAdRuntime />"), "One persistent advertising runtime");
assert.ok(runtime.includes('useNativeAdFeed(view, pathname !== "/" || blockingDialog)'), "Single feed follows the current route");
assert.ok(!index.includes("useNativeAdFeed("), "Home page must not create a second ad feed");

assert.ok(
  index.includes("setNativeAdDialogBlocked(menuOpen || renameValue !== null || confirmDelete || Boolean(folderDialog) || exportDialog || Boolean(incomingWave) || colorDialog || moveDialog)"),
  "A floating native-overlaid popup safely hides the Android ad view without destroying the feed",
);
assert.ok(index.includes("<DropdownMenu open={open} onOpenChange={onOpenChange}>"), "Restore Radix dropdown");
assert.ok(index.includes("<DropdownMenuTrigger asChild>"), "Keep the original three-dot trigger");
assert.ok(
  index.includes('className="w-56 origin-top-right rounded-2xl"'),
  "Menu must have its original compact width, not full screen width",
);
assert.ok(!index.includes("<TopContextMenuPanel"), "No in-flow dropdown panel");
assert.ok(!index.includes("{menuOpen && ("), "Opening menu must not insert content above folder tabs");
assert.ok(index.includes("<TopFolderTabs"), "Folder tabs remain immediately below app header");
assert.ok(index.includes("<DropdownMenuItem onClick={onCreateNote}"), "Original add-note action works");
assert.ok(index.includes("<DropdownMenuItem onClick={onImportPdf}"), "Original add-PDF action works");
assert.ok(index.includes("<DropdownMenuItem onClick={() => setView(value)}"), "View switching remains available");
assert.ok(index.includes("<DropdownMenuItem onClick={() => setSort(value)}"), "Sorting remains available");

assert.ok(index.includes('className="col-span-full min-w-0"'), "Native ads span the whole grid row");
assert.ok(index.includes("% 5 === 0"), "Ad follows every five note/PDF items");
assert.ok(index.includes("home-after-"), "Stable native slot keys");
assert.ok(adCard.includes('height: "120px"'), "Small native ad height remains 120px");
assert.ok(ui.includes("blockingDialog"), "Floating overlay visibility has one owner");

console.log("AdMob: original compact floating menu, unchanged note/folder positions, 120px grid slots and five-note cadence: PASS");
