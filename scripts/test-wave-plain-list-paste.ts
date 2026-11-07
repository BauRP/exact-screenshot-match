import {strict as assert} from "node:assert";
import {structuredPlainClipboardHtml} from "../src/lib/wave-smart-paste";
import {readFileSync} from "node:fs";
assert.equal(structuredPlainClipboardHtml("- first\n- second"),"<ul><li><p>first</p></li><li><p>second</p></li></ul>");
assert.equal(structuredPlainClipboardHtml("3. Alice\n4. Bob"),'<ol start="3"><li><p>Alice</p></li><li><p>Bob</p></li></ol>');
assert.ok(structuredPlainClipboardHtml("- <script>\n- & data").includes("&lt;script&gt;"));
assert.equal(structuredPlainClipboardHtml("- [x] Done\n- [ ] Pending"),'<div data-type="wave-check-item" data-done="true" data-shape="square">Done</div><div data-type="wave-check-item" data-done="false" data-shape="square">Pending</div>');
assert.equal(structuredPlainClipboardHtml("1. First\n3. Third"),"");
assert.equal(structuredPlainClipboardHtml("Just plain text"),"");
assert.equal(structuredPlainClipboardHtml("- first\nnot a list"),"");
assert.ok(readFileSync("src/routes/editor.$id.tsx","utf8").includes("structuredPlainClipboardHtml(plain)"));
console.log("Offline formatted plaintext list import and sanitization passed");

assert.ok(structuredPlainClipboardHtml("- שלום\n- עולם").includes('dir="rtl"'));
assert.ok(structuredPlainClipboardHtml("- [x] مرحبا\n- [ ] العالم").includes('dir="rtl"'));
assert.ok(!structuredPlainClipboardHtml("- Қазақ\n- Қазақша").includes('dir="rtl"'));

// Two-space indentation is a saved sublist, not cosmetic whitespace.
assert.equal(structuredPlainClipboardHtml("- parent\n  - child\n  - sibling\n- last"),
  "<ul><li><p>parent</p><ul><li><p>child</p></li><li><p>sibling</p></li></ul></li><li><p>last</p></li></ul>");
assert.equal(structuredPlainClipboardHtml("4. Main\n  2. Sub\n  3. Sub 2\n5. Next"),
  '<ol start="4"><li><p>Main</p><ol start="2"><li><p>Sub</p></li><li><p>Sub 2</p></li></ol></li><li><p>Next</p></li></ol>');
assert.equal(structuredPlainClipboardHtml("- Topic\n  1. First\n  2. Second\n- End"),
  "<ul><li><p>Topic</p><ol><li><p>First</p></li><li><p>Second</p></li></ol></li><li><p>End</p></li></ul>");
assert.ok(structuredPlainClipboardHtml("- Parent\n  - שלום\n- Last").includes('dir="rtl"'));
assert.ok(structuredPlainClipboardHtml("- Parent\n  - <script> &").includes("&lt;script&gt; &amp;"));
for(const unsafe of [
 "- root\n    - skipped depth",
 "- root\n   - odd spaces",
 "1. one\n  3. out of sequence\n  5. next",
 "- root\n  - [x] nested checklist",
 "- root\n\t- tab"
])assert.equal(structuredPlainClipboardHtml(unsafe),"","Ambiguous nesting must paste as unchanged text");
