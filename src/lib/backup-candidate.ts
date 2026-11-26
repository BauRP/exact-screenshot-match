/** Prefer a newer confirmed snapshot. A previous interrupted staging file
 * must not shadow a later active copy merely because it still exists.
 * Use Android file modification times; when times are missing/tied, favour
 * the last published active copy. Corrupt copies are always skipped. */
export type BackupCandidate={path:string;mtime?:number|null};
const time=(t:number|null|undefined)=>typeof t==="number"&&Number.isFinite(t)&&t>0?t:-1;
export function orderedBackupCandidates(candidates:readonly BackupCandidate[]):BackupCandidate[]{
 return [...candidates].sort((a,b)=>{
  const delta=time(b.mtime)-time(a.mtime);
  if(delta>0)return 1;
  if(delta<0)return -1;
  if(a.path==="WaveNotes.backup")return -1;
  if(b.path==="WaveNotes.backup")return 1;
  return a.path.localeCompare(b.path);
 });
}
export async function loadNewestValidatedBackup<T>(
 candidates:readonly BackupCandidate[],
 read:(path:string)=>Promise<T>,
 validate:(item:T)=>Promise<unknown>,
 onInvalid?:(path:string,error:unknown)=>void,
):Promise<T|null>{
 if(!candidates.length)return null;
 for(const {path} of orderedBackupCandidates(candidates)){
  try{
   const snapshot=await read(path);
   await validate(snapshot);
   return snapshot;
  }catch(error){onInvalid?.(path,error);}
 }
 throw Error("Резервная копия повреждена. Последнее сохранение не удалось.");
}
