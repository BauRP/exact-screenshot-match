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
 const parents=new Set(folders.filter(f=>f.id!==folderParent(f)).map(f=>folderParent(f)));
 const query=search.trim().normalize("NFKC").toLocaleLowerCase();
 const show=new Set<string>();
 if(query){
  for(const folder of ordered){
   if(!folderDisplayPath(folders,folder.id).normalize("NFKC").toLocaleLowerCase().includes(query))continue;
   show.add(folder.id);
   for(const ancestor of folderAncestors(folders,folder.id))show.add(ancestor.id);
  }
 }
 return ordered.flatMap(folder=>{
  const ancestors=folderAncestors(folders,folder.id);
  if(query){
   if(folder.id!=="all"&&!show.has(folder.id))return [];
  }else if(ancestors.slice(0,-1).some(a=>collapsed.has(a.id)))return [];
  return [{
   folder,
   depth:Math.min(6,Math.max(0,ancestors.length-1)),
   path:folderDisplayPath(folders,folder.id),
   hasChildren:parents.has(folder.id)
  }];
 });
}
