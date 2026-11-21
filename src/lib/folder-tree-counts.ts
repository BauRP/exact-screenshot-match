import type {Folder} from "./folders-store";
/** Linear in number of notes times folder depth, not folders times notes.
 * Unknown/deleted folder IDs are counted only in All; cycles terminate. */
export function noteCountsByFolder(folders:readonly Folder[],notes:readonly {folderId?:string}[]):Map<string,number>{
 const parent=new Map(folders.map(f=>[f.id,f.parentId??"all"]));
 const counts=new Map(folders.map(f=>[f.id,0]));
 counts.set("all",notes.length);
 for(const note of notes){
  let current=note.folderId??"all";
  const seen=new Set<string>();
  while(current!=="all"&&!seen.has(current)&&parent.has(current)){
   seen.add(current);
   counts.set(current,(counts.get(current)??0)+1);
   current=parent.get(current)??"all";
  }
 }
 return counts;
}
