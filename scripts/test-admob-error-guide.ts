import { strict as assert } from "node:assert";
import { classifyAdMobFailure } from "../src/lib/admob-error-guide";

const formMissing = classifyAdMobFailure(new Error("Publisher misconfiguration: Failed to read publisher's account configuration; no form(s) configured for the input app ID: ca-app-pub-test"), "consent");
assert.equal(formMissing.code, "UMP_FORM_NOT_READY");
assert.equal(formMissing.retryable, false);
assert.match(formMissing.advice, /форм|AdMob/);

const badNetwork = classifyAdMobFailure({ code: 2, message: "Network error" }, "consent");
assert.equal(badNetwork.code, "UMP_NETWORK");
assert.equal(badNetwork.retryable, true);

assert.equal(classifyAdMobFailure({ code: 3, message:"No fill" }, "native").code, "AD_NO_FILL");
assert.equal(classifyAdMobFailure({ code: 2, message:"Network error" }, "native").code, "AD_NETWORK");
assert.equal(classifyAdMobFailure({ code: 1, message:"Invalid request" }, "native").code, "AD_CONFIGURATION");
assert.equal(classifyAdMobFailure(new Error("Banner parent view timeout"), "sdk").code, "NETWORK");
assert.equal(classifyAdMobFailure(new Error("Unexpected native crash"), "sdk").code, "ADS_SDK_ERROR");

// Ensure the published-form scenario still gates on Google's own consent result,
// and Google test ads stay enabled by default during Android debug builds.
const source = await Bun.file("src/lib/native-ads.ts").text();
assert.match(source, /AdMob\.requestConsentInfo\(\)/);
assert.match(source, /AdMob\.showConsentForm\(\)/);
assert.match(source, /!consent\.canRequestAds/);
assert.match(source, /VITE_ADMOB_LIVE_ADS !== "true"/);
assert.match(source, /NativeAdFeed\.create/);
assert.match(source, /failure\.retryable/);
assert.match(source, /updateAdDiagnostic\("failed", failure\.label/);
console.log("AdMob diagnostics: UMP, native errors, consent gate, test-only default verified.");
