import type {Editor} from "@tiptap/react";
/** One transaction for all tasks, so Undo reverses the entire bulk operation. */
export function setAllChecklistItems(editor:Editor,done:boolean):number{
 if(!editor.isEditable||editor.isDestroyed)return 0;
 const tr=editor.state.tr;
 let count=0;
 editor.state.doc.descendants((node,pos)=>{
  if(node.type.name==="waveChecklistItem"&&node.attrs.done!==done){
   tr.setNodeMarkup(pos,undefined,{...node.attrs,done});count++;
  }
 });
 if(count)editor.view.dispatch(tr);
 return count;
}
export function checklistCounts(editor:Editor):{done:number;total:number}{
 let total=0,done=0;
 editor.state.doc.descendants(node=>{
  if(node.type.name==="waveChecklistItem"){total++;if(node.attrs.done)done++;}
 });
 return {done,total};
}
