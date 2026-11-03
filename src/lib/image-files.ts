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
/** Reject truncated and implausible imported image containers before storing
 * binary attachments. Full pixel decoding still happens in Android WebView. */
export function imageBlobFromBytes(bytes:Uint8Array):Blob{
 const length=bytes.byteLength;
 if(length<16||length>LIMIT)throw Error("Повреждённая или слишком большая фотография");
 const read32=(offset:number)=>((bytes[offset]*0x1000000)+(bytes[offset+1]<<16)+(bytes[offset+2]<<8)+bytes[offset+3])>>>0;
 const isPng=length>=33&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&
  bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
 if(isPng){
  const width=read32(16),height=read32(20);
  if(read32(8)!==13||String.fromCharCode(...bytes.slice(12,16))!=="IHDR"||
     !width||!height||width>20000||height>20000||width*height>100_000_000||
     bytes[24]===0||bytes[24]>16)throw Error("Повреждённый заголовок PNG");
  // A real PNG terminates with IEND, not just the eight-byte signature.
  const end=length-12;
  if(end<33||read32(end)!==0||String.fromCharCode(...bytes.slice(end+4,end+8))!=="IEND")
   throw Error("Неполный PNG: отсутствует конец изображения");
  return new Blob([bytes.slice().buffer],{type:"image/png"});
 }
 const isJpeg=length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(isJpeg){
  // JPEG files may include trailing camera metadata; inspect the final
  // 64 bytes for an end-of-image marker instead of requiring it at EOF.
  let completed=false;
  for(let i=Math.max(2,length-64);i<length-1;i++)if(bytes[i]===255&&bytes[i+1]===217)completed=true;
  if(!completed)throw Error("Неполный JPEG: отсутствует конец изображения");
  return new Blob([bytes.slice().buffer],{type:"image/jpeg"});
 }
 const isWebp=length>=20&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&
  String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 if(isWebp){
  const riffSize=(bytes[4]|(bytes[5]<<8)|(bytes[6]<<16)|(bytes[7]<<24))>>>0;
  const chunk=String.fromCharCode(...bytes.slice(12,16));
  const chunkLength=(bytes[16]|(bytes[17]<<8)|(bytes[18]<<16)|(bytes[19]<<24))>>>0;
  if(riffSize+8>length||riffSize<12||!["VP8 ","VP8L","VP8X"].includes(chunk)||
     chunkLength===0||20+chunkLength>length)
   throw Error("Неполный или повреждённый WebP");
  return new Blob([bytes.slice().buffer],{type:"image/webp"});
 }
 throw Error("Формат изображения в архиве не поддерживается");
}
