import {strict as assert} from "node:assert";
import {clipboardRtlAttribute,safeMarkdownInline,structuredMarkdownClipboardHtml} from "../src/lib/wave-smart-paste";
import {readFileSync} from "node:fs";
assert.equal(structuredMarkdownClipboardHtml("# Title\n\n> Note"),"<h1>Title</h1><blockquote><p>Note</p></blockquote>");
assert.ok(structuredMarkdownClipboardHtml("## Heading\n- one\n- two").includes("<ul><li><p>one</p></li>"));
assert.ok(structuredMarkdownClipboardHtml("1. Alpha\n3. Gamma").includes('start="3"'));
assert.ok(structuredMarkdownClipboardHtml("```js\n<script>\n```\n# heading").includes("&lt;script&gt;"));
assert.ok(structuredMarkdownClipboardHtml("# Tasks\n- [x] Ready\n- [ ] Next").includes('data-done="true"'));
assert.ok(structuredMarkdownClipboardHtml("# Tasks\n- [x] Ready\n- [ ] Next").includes('data-done="false"'));
assert.equal(structuredMarkdownClipboardHtml("Normal plain text"),"");
assert.equal(structuredMarkdownClipboardHtml("# only one heading"),"");
assert.equal(structuredMarkdownClipboardHtml("```\nunclosed"),"");
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
assert.ok(editor.includes("structuredMarkdownClipboardHtml(plain)"));
console.log("Safe offline Markdown clipboard block parsing passed");

assert.equal(safeMarkdownInline("**bold** and *italic*"),"<strong>bold</strong> and <em>italic</em>");
assert.equal(safeMarkdownInline("__strong__ ~~gone~~"),"<strong>strong</strong> <s>gone</s>");
assert.equal(safeMarkdownInline("`<script>`"),"<code>&lt;script&gt;</code>");
assert.equal(safeMarkdownInline("[OpenAI](https://openai.com/?a=1&b=2)"),
 '<a href="https://openai.com/?a=1&amp;b=2">OpenAI</a>');
assert.equal(safeMarkdownInline("[danger](javascript:alert(1))"),
 "[danger](javascript:alert(1))");
assert.equal(safeMarkdownInline("[danger](https://user:pass@example.com/)"),
 "[danger](https://user:pass@example.com/)");
assert.ok(structuredMarkdownClipboardHtml("# Title\n- **bold**\n- *italic*").includes("<strong>bold</strong>"));
assert.ok(structuredMarkdownClipboardHtml("> ~~gone~~\n# Header").includes("<s>gone</s>"));
assert.ok(structuredMarkdownClipboardHtml("## Code\n- `x < y`").includes("<code>x &lt; y</code>"));

assert.equal(safeMarkdownInline("[invalid](https://%)"),"[invalid](https://%)");
assert.equal(safeMarkdownInline("**good** [invalid](https://%)"),
 "<strong>good</strong> [invalid](https://%)");

assert.equal(clipboardRtlAttribute("123 مرحبا بالعالم"),' dir="rtl"');
assert.equal(clipboardRtlAttribute("Қазақ және English"),"");
const rtl=structuredMarkdownClipboardHtml("# שלום עולם\n- مرحبا\n- [x] مهمة");
assert.ok(rtl.includes('<h1 dir="rtl">'));
assert.ok(rtl.includes('<li><p dir="rtl">'));
assert.ok(rtl.includes('data-shape="square" dir="rtl"'));
assert.ok(structuredMarkdownClipboardHtml("> مرحبا\n## عنوان").includes('<blockquote><p dir="rtl">'));
// Combining headings and rich Markdown with a nested list must not flatten
// the child rows or strip bold/italic/link markup.
const multi=structuredMarkdownClipboardHtml("# Plan\n- **Parent**\n  - *Child* and [link](https://example.org/)\n- After");
assert.ok(multi.startsWith("<h1>Plan</h1><ul><li><p><strong>Parent</strong></p><ul>"),multi);
assert.ok(multi.includes('<li><p><em>Child</em> and <a href="https://example.org/">link</a></p></li>'));
assert.ok(multi.endsWith("</ul></li><li><p>After</p></li></ul>"));
assert.ok(structuredMarkdownClipboardHtml("## Checklist\n4. Main\n  2. Child\n  3. Child two\n5. Next").includes('<ol start="4"><li><p>Main</p><ol start="2">'));
assert.ok(structuredMarkdownClipboardHtml("# Right-to-left\n- Header\n  - שלום").includes('<p dir="rtl">שלום</p>'));
for(const unsafe of [
 "# Plan\n  - orphan\n- root",
 "# Plan\n- root\n    - skipped depth",
 "# Plan\n1. first\n  3. out of sequence",
 "# Plan\n- root\n  - [x] nested checklist"
])assert.equal(structuredMarkdownClipboardHtml(unsafe),"","Unsafe Markdown nesting must never be flattened");
