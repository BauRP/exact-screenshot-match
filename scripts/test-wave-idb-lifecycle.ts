import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {createIndexedDbOpener} from "../src/lib/indexeddb-open";

type FakeRequest= {
  result:FakeDb;
  error:Error|null;
  transaction?:{abort:()=>void};
  onupgradeneeded?:()=>void;
  onsuccess?:()=>void;
  onerror?:()=>void;
  onblocked?:()=>void;
};
type FakeDb={
  objectStoreNames:{contains:(n:string)=>boolean};
  createObjectStore:(n:string)=>void;
  close:()=>void;
  onclose?:(...args:unknown[])=>void;
  onversionchange?:(...args:unknown[])=>void;
  closed:number;
  stores:string[];
};
const makeDb=():FakeDb=>{
 const db:FakeDb={
  closed:0,stores:[],
  objectStoreNames:{contains:(n)=>db.stores.includes(n)},
  createObjectStore:(n)=>{db.stores.push(n);},
  close:()=>{db.closed++;}
 };
 return db;
};
const requests:FakeRequest[]=[];
let throwOnOpen=false;
(globalThis as any).indexedDB={
  open:(name:string,version:number)=>{
    assert.equal(version,1);
    assert.ok(name.startsWith("wave-test-"));
    if(throwOnOpen){throwOnOpen=false;throw Error("Injected native open failure");}
    const request:FakeRequest={result:makeDb(),error:null,transaction:{abort:()=>{}}};
    requests.push(request);
    return request;
  }
};
const errors={
 unavailable:"unavailable",failed:"open error",blocked:"upgrade blocked",timeout:"open timeout"
};
const take=()=>requests.at(-1)!;
const ok=(r:FakeRequest)=>{
 r.onupgradeneeded?.();
 r.onsuccess?.();
 return r.result;
};
const opener=createIndexedDbOpener("wave-test-lifecycle","media",errors,50);
const first=opener();
assert.equal(opener(),first,"Repeated open requests must reuse the pending handle");
const firstDb=ok(take());
assert.equal(await first,firstDb);
assert.deepEqual(firstDb.stores,["media"],"Upgrade creates only missing media store");
assert.equal(await opener(),firstDb,"Reuse an open connection");
firstDb.onversionchange?.();
assert.equal(firstDb.closed,1,"Close obsolete handles after version change");
const afterUpgrade=opener(), second=ok(take());
assert.equal(await afterUpgrade,second,"After versionchange reopen cleanly");
second.onclose?.();
const afterClose=opener();assert.equal(await afterClose,ok(take()));

const blocked=createIndexedDbOpener("wave-test-blocked","media",errors,50);
const attempt=blocked(),old=take();
old.onblocked?.();
await assert.rejects(attempt,/upgrade blocked/);
const retry=blocked(),newRequest=take();
assert.notEqual(old,newRequest,"Rejected blocked connections must be retryable");
assert.equal(await retry,ok(newRequest));
const stale=ok(old);
assert.equal(stale.closed,1,"A late blocked success closes its stale connection");

const erroneous=createIndexedDbOpener("wave-test-error","media",errors,50);
const errorPromise=erroneous(),errRequest=take();
errRequest.error=new Error("Injected request failure");
errRequest.onerror?.();
await assert.rejects(errorPromise,/Injected request failure/);
const errorRetry=erroneous();assert.equal(await errorRetry,ok(take()));

const immediate=createIndexedDbOpener("wave-test-throw","media",errors,50);
throwOnOpen=true;
await assert.rejects(immediate(),/Injected native open failure/);
const recovered=immediate();assert.equal(await recovered,ok(take()));

const hung=createIndexedDbOpener("wave-test-hang","media",errors,8);
const timed=hung(),oldTimed=take();
await assert.rejects(timed,/open timeout/);
const fresh=hung();assert.equal(await fresh,ok(take()));
oldTimed.onsuccess?.();
assert.equal(oldTimed.result.closed,1,"Late timeout success must not leak native handles");

const saved=(globalThis as any).indexedDB;
(globalThis as any).indexedDB=undefined;
await assert.rejects(createIndexedDbOpener("wave-test-unavailable","media",errors)(),/unavailable/);
(globalThis as any).indexedDB=saved;

for(const path of ["src/lib/pdf-files.ts","src/lib/audio-files.ts","src/lib/image-files.ts"]){
 assert.ok(readFileSync(path,"utf8").includes("createIndexedDbOpener("),
  "All media backends must use the bounded, retryable opener: "+path);
}
console.log("IndexedDB: same connection reuse, versionchange, blocked retry, native error, late success cleanup, timeout and data-safe reopen verified");
