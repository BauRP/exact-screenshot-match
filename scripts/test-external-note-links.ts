import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {isSafeExternalUrl} from "../src/lib/external-links";
assert.equal(isSafeExternalUrl("https://example.org/article"),true);
assert.equal(isSafeExternalUrl("http://example.org"),true);
for(const x of ["javascript:alert(1)","file:///sdcard/data","intent://example.org","https://","data:text/html,x"]){
 assert.equal(isSafeExternalUrl(x),false,x);
}
const plugin=readFileSync("android-overlay/app/src/main/java/app/lovable/supernotes/ExternalNoteLinkPlugin.java","utf8");
const main=readFileSync("android-overlay/app/src/main/java/app/lovable/supernotes/MainActivity.java","utf8");
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
assert.ok(main.includes("registerPlugin(ExternalNoteLinkPlugin.class)"));
assert.ok(plugin.includes("Intent.ACTION_VIEW"));
assert.ok(plugin.includes("CATEGORY_BROWSABLE"));
assert.ok(plugin.includes('!"https".equalsIgnoreCase(scheme)'));
assert.ok(editor.includes("openExternalUrl(href)"));
assert.ok(!editor.includes("openOnClick: true"),"No built-in internal browser link handling");
console.log("Note links use only the device external browser with validated http(s) URLs");
