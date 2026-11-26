import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {isSafeExternalUrl,normalizedSafeNoteLink} from "../src/lib/external-links";
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
assert.ok(plugin.includes('"https".equalsIgnoreCase(scheme)'));
assert.ok(editor.includes("openExternalUrl(href)"));
assert.ok(!editor.includes("openOnClick: true"),"No built-in internal browser link handling");
console.log("Note links use only the device external browser with validated http(s) URLs");

for(const [input,want] of [
 ["mailto:hello@example.org","mailto:hello@example.org"],
 ["MAILTO:123456789@example.org","mailto:123456789@example.org"],
 ["tel:+1(415)555-0123","tel:+14155550123"],
 ["TEL:88005553535","tel:88005553535"],
 ["https://example.org/a?x=1","https://example.org/a?x=1"],
 ["http://example.org","http://example.org/"]
])assert.equal(normalizedSafeNoteLink(input),want,input);
for(const val of [
 "mailto:someone@example.org?bcc=someoneelse@example.org",
 "mailto:hello@example.org\r\nBcc:someoneelse@example.org",
 "mailto:invalid","tel:123","tel:+14155550123;ext=9",
 "tel:+1 415 555 0123","https://user:pass@example.org/",
 "https://example.org/\nunsafe","javascript:alert(1)",
 "intent://example.org","file:///etc/passwd",
 "data:text/html,unsafe","ftp://example.org/",
 "https://","https://example.org/".padEnd(2050,"a")
])assert.equal(normalizedSafeNoteLink(val),"","Invalid note link: "+val);
assert.equal(isSafeExternalUrl("mailto:hello@example.org"),false);
assert.ok(plugin.includes("Intent.ACTION_SENDTO"),"Email opens composer");
assert.ok(plugin.includes("Intent.ACTION_DIAL"),"Phone opens dialer");
assert.ok(!plugin.includes("Intent.ACTION_CALL"),"No automatic phone calls");
assert.ok(editor.includes("normalizedSafeNoteLink(href)"));
