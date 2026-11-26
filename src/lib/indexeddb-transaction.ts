/** A hung IndexedDB transaction must not leave media saves/restores waiting
 * forever. Only report write success after the transaction commits.
 * A timeout aborts the transaction; never delete or recreate stored data. */
export type MediaTransactionErrors={
 request:string;transaction:string;aborted:string;timeout:string;
};
export function runIndexedDbTransaction<T>(
 database:IDBDatabase, storeName:string, mode:IDBTransactionMode,
 operation:(store:IDBObjectStore)=>IDBRequest<T>, errors:MediaTransactionErrors,
 timeoutMs=60_000,
):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  let tx:IDBTransaction|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let settled=false,requestSucceeded=false;
  let value:T;
  const settle=(error?:unknown)=>{
   if(settled)return;
   settled=true;
   if(timer!==undefined)clearTimeout(timer);
   if(error!==undefined)reject(error);
   else resolve(value);
  };
  try{
   tx=database.transaction(storeName,mode);
   const active=tx;
   active.oncomplete=()=>settle(requestSucceeded?undefined:new Error(errors.request));
   active.onerror=()=>settle(active.error??new Error(errors.transaction));
   active.onabort=()=>settle(active.error??new Error(errors.aborted));
   const request=operation(active.objectStore(storeName));
   request.onsuccess=()=>{value=request.result;requestSucceeded=true;};
   request.onerror=()=>{
    // A request may fail while the transaction is still pending.
    settle(request.error??new Error(errors.request));
    try{active.abort();}catch{/* Already completed or aborted. */}
   };
   timer=setTimeout(()=>{
    settle(new Error(errors.timeout));
    try{active.abort();}catch{/* Already completed or aborted. */}
   },timeoutMs);
  }catch(error){
   settle(error);
   try{tx?.abort();}catch{/* Creation failed or transaction already closed. */}
  }
 });
}
