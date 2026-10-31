/**
 * Binary-only note images. Never embed base64 photos in localStorage:
 * notes contain small image IDs, while the Blobs live in IndexedDB.
 */
const DB_NAME="wave.note.images.v1";
const STORE="images";
const LIMIT=12*1024*1024;
const ID=/^[a-zA-Z0-9_-]{1,128}$/;
let connection:Promise<IDBDatabase>|null=null;

function db():Promise<IDBDatabase>{
 if(connection)return connection;
 connection=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{
   if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>{
   connection=null;
   reject(request.error||new Error("Хранилище изображений недоступно"));
  };
  request.onblocked=()=>{
   connection=null;
   reject(new Error("Хранилище изображений временно заблокировано"));
  };
 });
 return connection;
}
async function operation<T>(mode:IDBTransactionMode,fn:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const connection=await db();
 return new Promise((resolve,reject)=>{
  const tx=connection.transaction(STORE,mode);
  let value:T;
  const request=fn(tx.objectStore(STORE));
  request.onsuccess=()=>{value=request.result;};
  request.onerror=()=>reject(request.error||Error("Ошибка сохранения изображения"));
  tx.oncomplete=()=>resolve(value);
  tx.onerror=()=>reject(tx.error||Error("Сбой хранилища изображений"));
  tx.onabort=()=>reject(tx.error||Error("Сохранение изображения отменено"));
 });
}
function validate(id:string,blob?:Blob):void{
 if(!ID.test(id))throw Error("Недопустимый ID изображения");
 if(blob&&(!["image/jpeg","image/png","image/webp"].includes(blob.type)||!blob.size||blob.size>LIMIT)){
  throw Error("Разрешены JPEG, PNG или WebP до 12 МБ");
 }
}
export async function saveNewImageFile(id:string,blob:Blob):Promise<void>{
 validate(id,blob);
 await operation("readwrite",store=>store.add(blob,id));
}
export async function saveImageFile(blob:Blob):Promise<string>{
 const id=crypto.randomUUID();
 await saveNewImageFile(id,blob);
 return id;
}
export async function loadImageFile(id:string):Promise<Blob|null>{
 validate(id);
 return await operation<Blob|undefined>("readonly",store=>store.get(id))||null;
}
export async function deleteImageFile(id:string):Promise<void>{
 validate(id);
 await operation("readwrite",store=>store.delete(id));
}
/** Only references in serialized image nodes count as live attachments. */
export function imageIdsInHtml(html:string):string[]{
 const ids=[...html.matchAll(/data-image-id=["']([a-zA-Z0-9_-]{1,128})["']/g)].map(m=>m[1]);
 return [...new Set(ids)];
}

/** Verify the actual bytes, rather than trusting MIME or extension in an imported ZIP. */
export function imageBlobFromBytes(bytes:Uint8Array):Blob{
 if(bytes.byteLength===0||bytes.byteLength>LIMIT)throw Error("Повреждённая или слишком большая фотография");
 const png=bytes.length>=8&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
 const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 if(!png&&!jpeg&&!webp)throw Error("Формат изображения в архиве не поддерживается");
 return new Blob([bytes.slice().buffer],{type:png?"image/png":jpeg?"image/jpeg":"image/webp"});
}
