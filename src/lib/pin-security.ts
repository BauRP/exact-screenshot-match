/** PIN verifier used exclusively on the device. Never persist a plaintext PIN.
 * Existing SHA-256 / legacy FNV entries are supported for migration.
 */
const PREFIX = "pbkdf2-v2";
const ITERATIONS = 210_000;
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const equal = (a: Uint8Array, b: Uint8Array) => {
  let diff = a.length ^ b.length;
  for (let i=0; i<Math.max(a.length,b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
};
function cryptoApi() {
  if (typeof crypto === "undefined" || !crypto.subtle || !crypto.getRandomValues)
    throw new Error("Безопасная установка PIN недоступна на этом устройстве.");
  return crypto;
}
const hexToBytes = (input: string) => Uint8Array.from(input.match(/../g) ?? [], ch => parseInt(ch,16));
export function pinIsValid(pin: string): boolean {
  if (!/^\d{6,8}$/.test(pin)) return false;
  if (/^(\d)\1+$/.test(pin)) return false;
  const consecutive = "012345678901234567890";
  const descending = "987654321098765432109";
  if (consecutive.includes(pin) || descending.includes(pin)) return false;
  if (pin.length % 2 === 0 && pin.slice(0, pin.length/2) === pin.slice(pin.length/2)) return false;
  return true;
}
export async function createPinRecord(pin: string): Promise<string> {
  if (!pinIsValid(pin)) throw new Error("Укажите PIN из 6–8 цифр без простой последовательности.");
  const api = cryptoApi();
  const salt = api.getRandomValues(new Uint8Array(16));
  const key = await api.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await api.subtle.deriveBits({name:"PBKDF2",salt,iterations:ITERATIONS,hash:"SHA-256"},key,256);
  return `${PREFIX}:${ITERATIONS}:${hex(salt)}:${hex(new Uint8Array(bits))}`;
}
function legacyFnv(pin: string): string {
  let hash=2166136261;
  for(let i=0;i<pin.length;i++){hash^=pin.charCodeAt(i);hash+=(hash<<1)+(hash<<4)+(hash<<7)+(hash<<8)+(hash<<24);}
  return `legacy-${(hash>>>0).toString(16)}`;
}
export async function checkPinRecord(pin: string, record: string): Promise<boolean> {
  try {
    if (!record || !/^\d{4,8}$/.test(pin)) return false;
    if (record.startsWith(PREFIX + ":")) {
      const parts=record.split(":");
      if (parts.length!==4 || !/^\d+$/.test(parts[1])) return false;
      const count=Number(parts[1]);
      if (count<100_000 || count>500_000 || !/^[0-9a-f]{32}$/.test(parts[2]) ||
        !/^[0-9a-f]{64}$/.test(parts[3])) return false;
      const api=cryptoApi();
      const key=await api.subtle.importKey("raw",encoder.encode(pin),"PBKDF2",false,["deriveBits"]);
      const bits=await api.subtle.deriveBits({
        name:"PBKDF2",salt:hexToBytes(parts[2]),iterations:count,hash:"SHA-256",
      },key,256);
      return equal(new Uint8Array(bits),hexToBytes(parts[3]));
    }
    if (/^[0-9a-f]{64}$/.test(record)) {
      const digest=await cryptoApi().subtle.digest("SHA-256",encoder.encode(pin));
      return equal(new Uint8Array(digest),hexToBytes(record));
    }
    if (/^legacy-[0-9a-f]{1,8}$/.test(record)) return legacyFnv(pin)===record;
    return false;
  } catch { return false; }
}
export function needsPinMigration(record: string) {return !record.startsWith(PREFIX + ":");}
