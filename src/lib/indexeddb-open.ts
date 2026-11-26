/** One safe IndexedDB connection per media store.
 * A blocked upgrade or unresponsive WebView must not leave editor/restore
 * promises pending forever; a late open is closed rather than cached.
 * Version changes close stale handles and allow the next operation to retry.
 * NEVER delete/recreate the database to resolve a block (user data is kept). */
export type IndexedDbOpenErrors={
  unavailable:string; failed:string; blocked:string; timeout:string;
};
export function createIndexedDbOpener(
  name:string,store:string,errors:IndexedDbOpenErrors,timeoutMs=20000,
):()=>Promise<IDBDatabase>{
  let pending:Promise<IDBDatabase>|null=null;
  let active:IDBDatabase|null=null;
  return ()=>{
    if(typeof indexedDB==="undefined")return Promise.reject(new Error(errors.unavailable));
    if(pending)return pending;
    const attempt=new Promise<IDBDatabase>((resolve,reject)=>{
      let settled=false;
      let request:IDBOpenDBRequest;
      const fail=(error:unknown)=>{
        if(settled)return;
        settled=true;
        clearTimeout(watchdog);
        reject(error);
      };
      const watchdog=setTimeout(()=>fail(new Error(errors.timeout)),timeoutMs);
      try{request=indexedDB.open(name,1);}
      catch(error){fail(error);return;}
      request.onupgradeneeded=()=>{
        try{
          const db=request.result;
          if(!db.objectStoreNames.contains(store))db.createObjectStore(store);
        }catch(error){
          try{request.transaction?.abort();}catch{ /* already stopped */ }
          fail(error);
        }
      };
      request.onsuccess=()=>{
        const db=request.result;
        // A previous blocked/timeout request may finish AFTER a fresh retry.
        // It must not replace the newer connection or stay open indefinitely.
        if(settled){db.close();return;}
        settled=true;
        clearTimeout(watchdog);
        active=db;
        db.onversionchange=()=>{
          db.close();
          if(active===db){active=null;pending=null;}
        };
        db.onclose=()=>{
          if(active===db){active=null;pending=null;}
        };
        resolve(db);
      };
      request.onerror=()=>fail(request.error??new Error(errors.failed));
      request.onblocked=()=>fail(new Error(errors.blocked));
    });
    const guarded=attempt.catch(error=>{
      if(pending===guarded)pending=null;
      throw error;
    });
    pending=guarded;
    return guarded;
  };
}
