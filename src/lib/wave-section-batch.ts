import type {Editor} from "@tiptap/react";
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
