import { strict as assert } from "node:assert";
import { webcrypto } from "node:crypto";
import { pinIsValid, createPinRecord, checkPinRecord, needsPinMigration } from "../src/lib/pin-security";

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
for(const pin of ["","1234","123456","000000","111111","12345678","87654321",
  "121212","112233","123123","11221122","22334455","1234567","8765432",
  "99999999","00001111","0000000"]) {
  assert.equal(pinIsValid(pin),false,`Unsafe PIN accepted: ${pin}`);
}
for(const pin of ["704913","390615","50814672","148572","147258","01928374"]) {
  assert.ok(pinIsValid(pin));
  const record=await createPinRecord(pin);
  assert.ok(record.startsWith("pbkdf2-v2:"));
  assert.equal(await checkPinRecord(pin,record),true);
  assert.equal(await checkPinRecord(pin.slice(0,-1)+(pin.endsWith("0")?"1":"0"),record),false);
  const otherRecord=await createPinRecord(pin);
  assert.notEqual(record,otherRecord,"New PIN records must receive unique random salts");
  assert.equal(await checkPinRecord(pin,otherRecord),true);
  assert.equal(needsPinMigration(record),false);
}
const subtle=globalThis.crypto.subtle;
const buffer=await subtle.digest("SHA-256",new TextEncoder().encode("1234"));
const oldHash=Array.from(new Uint8Array(buffer)).map(v=>v.toString(16).padStart(2,"0")).join("");
assert.equal(await checkPinRecord("1234",oldHash),true,"Previously saved 4-digit PIN still unlocks");
assert.equal(await checkPinRecord("4321",oldHash),false);
assert.equal(needsPinMigration(oldHash),true);
assert.equal(await checkPinRecord("123456","invalid"),false);
assert.equal(await checkPinRecord("123456","pbkdf2-v2:1:ffffffffffffffffffffffffffffffff:"+"f".repeat(64)),false);
assert.equal(await checkPinRecord("123456","pbkdf2-v2:210000:bad:"+"f".repeat(64)),false);
assert.equal(await checkPinRecord("",oldHash),false);
const lockSource=await Bun.file("src/lib/app-lock.tsx").text();
const settings=await Bun.file("src/routes/settings.tsx").text();
assert.ok(lockSource.includes("if (!pinHash) return false"));
assert.ok(lockSource.includes("pinRetryAfterMs()>0"));
assert.ok(lockSource.includes("ATTEMPTS_KEY"));
assert.ok(lockSource.includes("recordPinResult(verified)"));
assert.ok(lockSource.includes("if (v && !pinHash) throw"));
assert.ok(!lockSource.includes("if (!pinEnabled) onUnlock()"));
assert.ok(lockSource.includes("NativeBiometric.isAvailable({useFallback:false})"));
assert.ok(lockSource.includes("useFallback:false"));
assert.ok(settings.includes("pinConfirm"));
assert.ok(settings.includes("if (!await verifyBiometric())"));
assert.ok(settings.includes("if (!pinIsValid(value))"));
assert.ok(settings.includes("if (value !== pinConfirm.trim())"));
console.log("PIN strong hashing, old PIN migration, Android fingerprint gate and no bypass: PASS");
