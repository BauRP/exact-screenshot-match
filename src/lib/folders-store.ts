import { useSyncExternalStore } from "react";
import { markBackupDirty } from "./backup-signals";

export type Folder = {
  id: string;
  name: string;
  system?: boolean;
  parentId?: string;
};

const FOLDERS_KEY = "sn.folders.v1";
const HIDDEN_KEY = "sn.hidden-system-folders.v1";
const ACTIVE_KEY = "sn.active-folder.v1";

export const SYSTEM_FOLDERS: Folder[] = [
  { id: "all", name: "ALL", system: true },
  { id: "work", name: "WORK", system: true },
  { id: "home", name: "HOME", system: true },
];

/** Parent "all" is the root, not a real child; existing flat folders
 * remain root folders when parentId is absent. */
export function folderParent(folder:Folder):string{
 return folder.parentId&&folder.parentId!==folder.id?folder.parentId:"all";
}
export function descendantFolderIds(folders:readonly Folder[],parentId:string):Set<string>{
 const found=new Set<string>([parentId]);
 let changed=true;
 while(changed){
  changed=false;
  for(const folder of folders){
   if(found.has(folder.id))continue;
   if(found.has(folderParent(folder))){found.add(folder.id);changed=true;}
  }
 }
 return found;
}
/** Breadcrumbs always terminate, even if old backup data was cyclic. */
export function folderAncestors(folders:readonly Folder[],id:string):Folder[]{
 const result:Folder[]=[],seen=new Set<string>();
 let current=id;
 while(current!=="all"&&!seen.has(current)){
  seen.add(current);
  const folder=folders.find(item=>item.id===current);
  if(!folder)break;
  result.unshift(folder);
  current=folderParent(folder);
 }
 return result;
}
export function canNestFolder(folders:readonly Folder[],id:string,parentId:string):boolean{
 return id!==parentId&&(parentId==="all"||folders.some(folder=>folder.id===parentId))&&
   !descendantFolderIds(folders,id).has(parentId);
}
/** Flatten the hierarchy in display order, protecting imported data from
 * accidentally creating infinitely nested or invisible folders. */
export function orderedFolderTree(folders:readonly Folder[]):Folder[]{
 const result:Folder[]=[],visited=new Set<string>();
 const visit=(parentId:string)=>{
  for(const folder of folders){
   if(visited.has(folder.id)||folderParent(folder)!==parentId)continue;
   visited.add(folder.id);result.push(folder);visit(folder.id);
  }
 };
 visit("all");
 for(const folder of folders)if(!visited.has(folder.id)){visited.add(folder.id);result.push(folder);}
 return result;
}

const listeners = new Set<() => void>();
let customFolders: Folder[] = [];
let hiddenSystem: string[] = [];
let activeId: string = "all";
let hydrated = false;

function persist(nextFolders: Folder[] = customFolders, nextHidden: string[] = hiddenSystem, nextActive?:string) {
  // Write before exposing changes in React. A full disk must never show
  // a folder as saved when localStorage refused the write.
  const oldFolders=localStorage.getItem(FOLDERS_KEY);
  const oldHidden=localStorage.getItem(HIDDEN_KEY);
  const oldActive=nextActive!==undefined?localStorage.getItem(ACTIVE_KEY):null;
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(nextFolders));
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(nextHidden));
    if(nextActive!==undefined)localStorage.setItem(ACTIVE_KEY,nextActive);
  } catch (error) {
    try {
      if (oldFolders===null) localStorage.removeItem(FOLDERS_KEY);
      else localStorage.setItem(FOLDERS_KEY,oldFolders);
      if (oldHidden===null) localStorage.removeItem(HIDDEN_KEY);
      else localStorage.setItem(HIDDEN_KEY,oldHidden);
      if(nextActive!==undefined){
        if(oldActive===null)localStorage.removeItem(ACTIVE_KEY);
        else localStorage.setItem(ACTIVE_KEY,oldActive);
      }
    } catch (rollbackError) { console.error("Unable to roll back folder storage",rollbackError); }
    throw new Error("Не удалось сохранить папки: хранилище недоступно или заполнено.",{cause:error});
  }
  markBackupDirty();
}
function emit() { listeners.forEach((l) => l()); }

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (raw) customFolders = JSON.parse(raw);
    const hidden = localStorage.getItem(HIDDEN_KEY);
    if (hidden) hiddenSystem = JSON.parse(hidden);
    const a = localStorage.getItem(ACTIVE_KEY);
    if (a) activeId = a;
  } catch {}
}

function subscribe(cb: () => void) {
  hydrate();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useFolders(): Folder[] {
  return useSyncExternalStore(
    subscribe,
    () => { hydrate(); return snapshot(); },
    () => SYSTEM_FOLDERS,
  );
}

let cachedList: Folder[] = SYSTEM_FOLDERS;
let cachedKey = "";
function snapshot(): Folder[] {
  const key =
    customFolders.map((f) => f.id + f.name + (f.parentId??"")).join("|") + "#" + hiddenSystem.join(",");
  if (key !== cachedKey) {
    cachedList = [
      ...SYSTEM_FOLDERS.filter(f=>f.id==="all"),
      ...orderedFolderTree([...SYSTEM_FOLDERS.filter(f=>f.id!=="all"),...customFolders])
        .filter(f=>!hiddenSystem.includes(f.id)),
    ];
    cachedKey = key;
  }
  return cachedList;
}

export function useActiveFolder(): string {
  return useSyncExternalStore(
    subscribe,
    () => { hydrate(); return activeId; },
    () => "all",
  );
}

export function setActiveFolder(id: string) {
  hydrate();
  localStorage.setItem(ACTIVE_KEY,id);
  activeId=id;
  emit();
}

export function addFolder(name: string,activate=false,parentId="all"): Folder {
  hydrate();
  const available=snapshot();
  if(parentId!=="all"&&!available.some(folder=>folder.id===parentId))throw Error("Неизвестная родительская папка");
  const f: Folder = { id: crypto.randomUUID(), name: name.trim() || "Folder",...(parentId==="all"?{}:{parentId}) };
  const next=[...customFolders, f];
  // Creating and selecting a new folder is one UI operation; persist both.
  persist(next,hiddenSystem,activate?f.id:undefined);
  customFolders=next;
  if(activate) activeId=f.id;
  emit();
  return f;
}

export function renameFolder(id: string, name: string,parentId?:string) {
  hydrate();
  const current=customFolders.find(f=>f.id===id);
  if(!current)throw Error("Папка не найдена");
  const parent=parentId??folderParent(current);
  if(!canNestFolder(snapshot(),id,parent))throw Error("Нельзя переместить папку внутрь себя или своей подпапки");
  const next=customFolders.map(f=>{
    if(f.id!==id)return f;
    const {parentId:oldParent,...base}=f;
    return {...base,name:name.trim()||f.name,...(parent==="all"?{}:{parentId:parent})};
  });
  persist(next,hiddenSystem);
  customFolders=next;emit();
}

export function deleteFolder(id: string) {
  hydrate();
  // The "ALL" tab is permanent and can never be removed.
  if (id === "all") return;
  const nextHidden=isSystemFolder(id) && !hiddenSystem.includes(id) ? [...hiddenSystem,id] : hiddenSystem;
  const deleted=customFolders.find(f=>f.id===id);
  const newParent=deleted?folderParent(deleted):"all";
  // Children stay accessible: reparent them to their grandparent.
  const nextFolders=customFolders.filter(f=>f.id!==id).map(f=>{
    if(folderParent(f)!==id)return f;
    const {parentId:oldParent,...base}=f;
    return {...base,...(newParent==="all"?{}:{parentId:newParent})};
  });
  const changeSelection=activeId===id;
  persist(nextFolders,nextHidden,changeSelection?"all":undefined);
  if(changeSelection) activeId="all";
  customFolders=nextFolders; hiddenSystem=nextHidden; emit();
}

export function isSystemFolder(id: string) {
  return SYSTEM_FOLDERS.some((f) => f.id === id);
}

/** Exact rollback for a failed multi-store restore (not the normal merging restore).
 * The caller holds a snapshot from before attempting the import.
 */
export function rollbackFolderBackup(snapshot: {folders:Folder[];hiddenSystem:string[]}):void {
  persist(snapshot.folders,snapshot.hiddenSystem);
  customFolders=snapshot.folders.map(folder=>({...folder}));
  hiddenSystem=[...snapshot.hiddenSystem];
  emit();
}

/** Backups include custom folder IDs so the note-to-folder relationship survives. */
export function exportFolderBackup(): { folders: Folder[]; hiddenSystem: string[] } {
  hydrate();
  return {
    folders: customFolders.map((folder) => ({ ...folder })),
    hiddenSystem: [...hiddenSystem],
  };
}

/** Non-destructive restore: include the backed-up system-tab visibility.
 * Persist changes before publishing to the UI, and rollback a partial write.
 */
export function restoreFolderBackup(folders: Folder[], restoredHidden: string[]): void {
  hydrate();
  if (!Array.isArray(folders) || folders.length > 1000 ||
      !Array.isArray(restoredHidden) || restoredHidden.length > SYSTEM_FOLDERS.length ||
      restoredHidden.some((id) => typeof id !== "string" || id === "all" ||
        !SYSTEM_FOLDERS.some((f) => f.id === id))) {
    throw new Error("Invalid folder or hidden-tab backup");
  }
  const known = new Set([...SYSTEM_FOLDERS, ...customFolders].map((folder) => folder.id));
  const pending: Folder[] = [];
  for (const folder of folders) {
    if (!folder || typeof folder.id !== "string" || !/^[\w-]{1,128}$/.test(folder.id) ||
        typeof folder.name !== "string" || folder.name.length > 120) {
      throw new Error("Invalid folder record in backup");
    }
    if (!known.has(folder.id)) {
      pending.push({ id: folder.id, name: folder.name.trim() || "Folder",
        ...(typeof folder.parentId==="string"&&folder.parentId!=="all"?{parentId:folder.parentId}:{}) });
      known.add(folder.id);
    }
  }
  const next = [...customFolders, ...pending];
  // Validate the whole imported tree including out-of-order folder records.
  for(const folder of next){
    if(folder.parentId===folder.id)throw Error("Резервная копия содержит зацикленную папку");
    const parent=folderParent(folder);
    if(!canNestFolder([...SYSTEM_FOLDERS,...next],folder.id,parent))
      throw Error("Резервная копия содержит неверную структуру папок");
  }
  // Restoring a ZIP never unhides a tab the current user deliberately hid.
  const nextHidden = [...new Set([...hiddenSystem, ...restoredHidden])];
  if (!pending.length && nextHidden.length === hiddenSystem.length) return;
  const originalFolders = localStorage.getItem(FOLDERS_KEY);
  const originalHidden = localStorage.getItem(HIDDEN_KEY);
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(next));
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(nextHidden));
  } catch (error) {
    try {
      if (originalFolders === null) localStorage.removeItem(FOLDERS_KEY);
      else localStorage.setItem(FOLDERS_KEY, originalFolders);
      if (originalHidden === null) localStorage.removeItem(HIDDEN_KEY);
      else localStorage.setItem(HIDDEN_KEY, originalHidden);
    } catch (rollbackError) { console.error("Folder backup rollback failed", rollbackError); }
    throw error;
  }
  customFolders = next;
  hiddenSystem = nextHidden;
  markBackupDirty();
  emit();
}
