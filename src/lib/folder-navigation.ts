import {folderAncestors,folderParent,orderedFolderTree,type Folder} from "./folders-store";

/** Drawer rows are computed from the stored tree, never a second folder
 * database. Search opens matching descendants without changing saved state.
 * Imported cyclic/invalid parent links cannot hang the menu. */
export type FolderNavigationRow={
 folder:Folder;
 depth:number;
 path:string;
 hasChildren:boolean;
};
export function folderDisplayPath(folders:readonly Folder[],id:string):string{
 if(id==="all")return folders.find(f=>f.id==="all")?.name??"Все заметки";
 const path=folderAncestors(folders,id).map(f=>f.name).filter(Boolean);
 if(path.length)return path.join(" / ");
 return folders.find(f=>f.id===id)?.name??id;
}
export function folderNavigationRows(
 folders:readonly Folder[],
 collapsed:ReadonlySet<string>=new Set<string>(),
 search=""
):FolderNavigationRow[]{
 const ordered=orderedFolderTree(folders);
 const byId=new Map(folders.map(folder=>[folder.id,folder]));
 const parents=new Set(folders.filter(f=>f.id!==folderParent(f)).map(f=>folderParent(f)));
 const normalize=(s:string)=>s.normalize("NFKC").toLocaleLowerCase().replace(/ё/g,"е");
 const query=normalize(search.trim());
 // Build each breadcrumb once using constant-time folder lookups. Repeated
 // linear ancestor searches were expensive in folders with many levels.
 const entries=ordered.map(folder=>{
  const ancestors:Folder[]=[],seen=new Set<string>();
  let current=folder.id;
  while(current!=="all"&&!seen.has(current)){
   seen.add(current);
   const ancestor=byId.get(current);
   if(!ancestor)break;
   ancestors.unshift(ancestor);
   current=folderParent(ancestor);
  }
  const path=folder.id==="all"
   ? byId.get("all")?.name??"Все заметки"
   : ancestors.map(f=>f.name).filter(Boolean).join(" / ")||folder.name;
  return {folder,ancestors,path};
 });
 const show=new Set<string>();
 if(query){
  for(const {folder,ancestors,path} of entries){
   if(!normalize(path).includes(query))continue;
   show.add(folder.id);
   for(const ancestor of ancestors)show.add(ancestor.id);
  }
 }
 return entries.flatMap(({folder,ancestors,path})=>{
  if(query){
   if(folder.id!=="all"&&!show.has(folder.id))return [];
  }else if(ancestors.slice(0,-1).some(a=>collapsed.has(a.id)))return [];
  return [{
   folder,
   depth:Math.min(6,Math.max(0,ancestors.length-1)),
   path,
   hasChildren:parents.has(folder.id)
  }];
 });
}
