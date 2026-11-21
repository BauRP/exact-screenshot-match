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
 const normalize=(s:string)=>s.normalize("NFKC").toLocaleLowerCase().replace(/ё/g,"е")
  .replace(/\s+/g," ").trim();
 const query=normalize(search).slice(0,120);
 const terms=query?query.split(" "):[];
 // Build each breadcrumb once using constant-time folder lookups. Repeated
 // linear ancestor searches were expensive in folders with many levels.
 // The preorder guarantees that a valid parent's breadcrumb is already
 // computed. Reusing it avoids repeatedly scanning all folders for every
 // ancestor of deep folders. Broken imported cycles use the safe fallback.
 const cache=new Map<string,{ancestors:Folder[];path:string;hidden:boolean}>();
 const entries=ordered.map(folder=>{
  let ancestors:Folder[]=[],path="",hidden=false;
  if(folder.id==="all"){
   path=byId.get("all")?.name??"Все заметки";
  }else{
   const parentId=folderParent(folder);
   const parent=parentId==="all"?undefined:cache.get(parentId);
   if(parent&&!parent.ancestors.some(item=>item.id===folder.id)){
    ancestors=[...parent.ancestors,folder];
    path=(parent.path?parent.path+" / ":"")+folder.name;
    hidden=parent.hidden||collapsed.has(parentId);
   }else if(parentId==="all"){
    ancestors=[folder];
    path=folder.name;
   }else{
    // Orphans and corrupt cyclic imports must remain visible and terminate.
    ancestors=folderAncestors(folders,folder.id);
    path=ancestors.map(item=>item.name).filter(Boolean).join(" / ")||folder.name;
    hidden=ancestors.slice(0,-1).some(item=>collapsed.has(item.id));
   }
  }
  cache.set(folder.id,{ancestors,path,hidden});
  return {folder,ancestors,path,hidden};
 });
 const show=new Set<string>();
 if(query){
  for(const {folder,ancestors,path} of entries){
   if(!terms.every(term=>normalize(path).includes(term)))continue;
   show.add(folder.id);
   for(const ancestor of ancestors)show.add(ancestor.id);
  }
 }
 return entries.flatMap(({folder,path,hidden})=>{
  if(query){
   if(folder.id!=="all"&&!show.has(folder.id))return [];
  }else if(hidden)return [];
  return [{
   folder,
   depth:Math.min(6,Math.max(0,ancestors.length-1)),
   path,
   hasChildren:parents.has(folder.id)
  }];
 });
}
