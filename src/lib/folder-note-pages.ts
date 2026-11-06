/** Folder pages are a view over saved notes, not copies or alternate storage.
 * Switching pages must never rewrite notes, attachments, or their sort order. */
export const FOLDER_NOTE_PAGE_SIZES=[12,24,48] as const;
export type FolderNotePageSize=(typeof FOLDER_NOTE_PAGE_SIZES)[number];
export type FolderNotePage<T>={
 items:T[];page:number;pageCount:number;size:FolderNotePageSize;
 total:number;from:number;to:number;
};
const PAGE_SIZE_STORAGE_KEY="wave.folder-page-size.v1";
export function validFolderNotePageSize(value:unknown):FolderNotePageSize{
 return value===12||value===24||value===48?value:12;
}
export function readFolderNotePageSize():FolderNotePageSize{
 if(typeof window==="undefined")return 12;
 try{return validFolderNotePageSize(Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY)));}
 catch{return 12;}
}
export function saveFolderNotePageSize(value:FolderNotePageSize):FolderNotePageSize{
 const size=validFolderNotePageSize(value);
 if(typeof window!=="undefined"){
  try{window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY,String(size));}
  catch{/* Unavailable settings storage must not prevent browsing notes. */}
 }
 return size;
}
export function paginateFolderNotes<T>(notes:readonly T[],pageNumber:number,sizeValue:FolderNotePageSize=12):FolderNotePage<T>{
 const size=validFolderNotePageSize(sizeValue);
 const total=notes.length;
 const pageCount=Math.max(1,Math.ceil(total/size));
 const requested=Number.isSafeInteger(pageNumber)?pageNumber:1;
 const page=Math.max(1,Math.min(pageCount,requested));
 const start=(page-1)*size;
 const items=notes.slice(start,start+size);
 return {items,page,pageCount,size,total,from:total?start+1:0,to:start+items.length};
}
