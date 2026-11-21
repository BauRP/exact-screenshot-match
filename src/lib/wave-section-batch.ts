import type {Editor} from "@tiptap/react";
import {topLevelPageRanges} from "./wave-page-actions";
/** Expand/collapse all sections as a single undoable document transaction. */
export function setAllFoldSections(editor:Editor,collapsed:boolean):number {
 if(!editor.isEditable||editor.isDestroyed)return 0;
 const tr=editor.state.tr;
 let changed=0;
 editor.state.doc.descendants((node,pos)=>{
  if(node.type.name==="waveFold"&&node.attrs.collapsed!==collapsed){
   tr.setNodeMarkup(pos,undefined,{...node.attrs,collapsed});
   changed++;
  }
 });
 if(changed)editor.view.dispatch(tr);
 return changed;
}
export function countFoldSections(editor:Editor):number{
 let count=0;
 editor.state.doc.descendants(node=>{if(node.type.name==="waveFold")count++;});
 return count;
}

/** Expand or collapse only the folds of the selected logical page.
 * Ranges spanning multiple pages are rejected; one action is one Undo. */
export function setCurrentPageFoldSections(editor:Editor,collapsed:boolean):number{
 if(!editor.isEditable||editor.isDestroyed)return 0;
 const {state,view}=editor,{doc,selection}=state,pages=topLevelPageRanges(doc);
 const pageAt=(pos:number)=>{
  let index=0;
  for(let i=1;i<pages.length;i++)if(pos>=pages[i].start)index=i;
  return index;
 };
 const index=pageAt(selection.from);
 if(pageAt(selection.empty?selection.to:Math.max(selection.from,selection.to-1))!==index)return 0;
 const {bodyStart,end}=pages[index];
 let tr=state.tr,count=0;
 doc.nodesBetween(bodyStart,end,(node,pos)=>{
  if(node.type.name==="waveFold"&&node.attrs.collapsed!==collapsed){
   tr=tr.setNodeMarkup(pos,undefined,{...node.attrs,collapsed});
   count++;
  }
 });
 if(count)view.dispatch(tr.scrollIntoView());
 return count;
}
/** Show sections through the requested nesting depth in a single undoable
 * transaction. Collapsing deeper sections never deletes or rewrites their
 * contents, and their state survives save/reopen. */
export function setFoldSectionsToDepth(editor:Editor,visibleDepth:number):number{
 if(!editor.isEditable||editor.isDestroyed||!Number.isInteger(visibleDepth)||visibleDepth<0)return 0;
 const {doc}=editor.state,tr=editor.state.tr;
 let changed=0;
 doc.descendants((node,pos)=>{
  if(node.type.name!=="waveFold")return;
  const resolved=doc.resolve(pos);
  let level=1;
  for(let depth=1;depth<=resolved.depth;depth++){
   if(resolved.node(depth).type.name==="waveFold")level++;
  }
  const collapsed=level>visibleDepth;
  if(node.attrs.collapsed!==collapsed){
   tr.setNodeMarkup(pos,undefined,{...node.attrs,collapsed});
   changed++;
  }
 });
 if(changed)editor.view.dispatch(tr.scrollIntoView());
 return changed;
}
