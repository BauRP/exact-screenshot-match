import {strict as assert} from "node:assert";
import {safeMarkdownInline,structuredMarkdownClipboardHtml} from "../src/lib/wave-smart-paste";
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
