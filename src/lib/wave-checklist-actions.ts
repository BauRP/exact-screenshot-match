import type {Editor} from "@tiptap/react";
import type {Node as PMNode} from "@tiptap/pm/model";

export type ChecklistCounts={total:number;done:number;pending:number};
export function countDocumentTasks(doc:PMNode):ChecklistCounts{
 let total=0,done=0;
 doc.descendants(node=>{
  if(node.type.name==="waveChecklistItem"){
   total++;
   if(node.attrs.done===true)done++;
  }
 });
 return {total,done,pending:total-done};
}

/** Bulk actions are ONE ProseMirror transaction / ONE undoable edit.
 * Update existing nodes only: no text, shape, attached file or nesting changes. */
export function setDocumentTasksDone(editor:Editor,done:boolean):number{
 if(!editor.isEditable||editor.isDestroyed)return 0;
 const updates:{pos:number;attrs:Record<string,unknown>}[]=[];
 editor.state.doc.descendants((node,pos)=>{
  if(node.type.name==="waveChecklistItem"&&node.attrs.done!==done)
   updates.push({pos,attrs:{...node.attrs,done}});
 });
 if(!updates.length)return 0;
 let tr=editor.state.tr;
 for(const item of updates)tr=tr.setNodeMarkup(item.pos,undefined,item.attrs);
 editor.view.dispatch(tr.scrollIntoView());
 return updates.length;
}
