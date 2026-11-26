import {strict as assert} from "node:assert";
import {runIndexedDbTransaction} from "../src/lib/indexeddb-transaction";

const errors={request:"request failed",transaction:"transaction failed",aborted:"transaction aborted",timeout:"transaction timeout"};
type Request=Partial<IDBRequest<string>>;
function mock(){
 const request:Request={result:undefined,error:null};
 let abortCount=0;
 const transaction={
  error:null as Error|null,
  oncomplete:null as null|(()=>void),onerror:null as null|(()=>void),
  onabort:null as null|(()=>void),
  objectStore:()=>({get:()=>request}),
  abort(){abortCount++;this.onabort?.();}
 };
 const database={transaction:()=>transaction} as unknown as IDBDatabase;
 return {database,request,transaction,get abortCount(){return abortCount;}};
}
const success=mock();
const write=runIndexedDbTransaction<string>(success.database,"files","readwrite",
 store=>store.get("a") as IDBRequest<string>,errors,100);
success.request.result="durable" as string;
success.request.onsuccess?.(null as any);
let resolved=false;
void write.then(()=>{resolved=true;});
await Promise.resolve();
assert.equal(resolved,false,"Request success alone must NOT claim a durable write");
success.transaction.oncomplete?.();
assert.equal(await write,"durable");
const error=mock();
const failed=runIndexedDbTransaction<string>(error.database,"files","readonly",
 store=>store.get("missing") as IDBRequest<string>,errors,100);
error.request.error=new Error("Disk failure");
error.request.onerror?.(null as any);
await assert.rejects(failed,/Disk failure/);
assert.equal(error.abortCount,1,"Failed request must abort the transaction");
const timed=mock();
const hung=runIndexedDbTransaction<string>(timed.database,"files","readwrite",
 store=>store.get("hang") as IDBRequest<string>,errors,5);
await assert.rejects(hung,/transaction timeout/);
assert.equal(timed.abortCount,1,"Hung transaction must be aborted, not silently retried");
timed.request.result="late" as string;
timed.request.onsuccess?.(null as any);
timed.transaction.oncomplete?.();
const thrown=mock();
const synchronous=runIndexedDbTransaction<string>(thrown.database,"files","readwrite",
 ()=>{throw new Error("Invalid key")},errors,100);
await assert.rejects(synchronous,/Invalid key/);
assert.equal(thrown.abortCount,1);
for(const path of ["src/lib/audio-files.ts","src/lib/image-files.ts","src/lib/pdf-files.ts"]){
 const {readFileSync}=await import("node:fs");
 assert.ok(readFileSync(path,"utf8").includes("runIndexedDbTransaction("));
}
console.log("Media IndexedDB transaction commit, error, timeout, abort and late response tests passed");
