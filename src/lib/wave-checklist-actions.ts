import type {Editor} from "@tiptap/react";
import type {Node as PMNode} from "@tiptap/pm/model";
import {TextSelection} from "@tiptap/pm/state";
import {canSplit} from "@tiptap/pm/transform";
import type {CheckShape} from "./wave-checklist";

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

/** Change the saved marker of the current task, without inserting a new row.
 * A single transaction makes this change undoable and preserves task text. */
export function setSelectedChecklistShape(editor:Editor,shape:CheckShape):boolean{
 if(!editor.isEditable||editor.isDestroyed||
    !["square","circle","diamond","check"].includes(shape))return false;
 const {$from}=editor.state.selection;
 for(let depth=$from.depth;depth>0;depth--){
  const node=$from.node(depth);
  if(node.type.name!=="waveChecklistItem")continue;
  const pos=$from.before(depth);
  if(node.attrs.shape===shape)return true;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...node.attrs,shape}).scrollIntoView());
  return true;
 }
 return false;
}

/** Split the selected task at the actual caret, preserving both halves'
 * inline marks and text. The continuation is always unchecked. This function
 * is also exposed as a touch-friendly action for keyboards without Enter. */
export function continueSelectedChecklistItem(editor:Editor):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const {state}=editor;
 const {from,to,$from,$to}=state.selection;
 if($from.parent.type.name!=="waveChecklistItem"||
    $to.parent.type.name!=="waveChecklistItem"||
    $from.before()!==$to.before())return false;
 const tr=state.tr;
 if(from!==to)tr.delete(from,to);
 const pos=from,$pos=tr.doc.resolve(pos);
 const parent=$pos.parent;
 if(parent.type.name!=="waveChecklistItem")return false;
 if(!parent.textContent.trim()){
  const paragraph=state.schema.nodes.paragraph;
  if(!paragraph)return false;
  tr.setNodeMarkup($pos.before(),paragraph);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
 }
 const spec={type:parent.type,attrs:{...parent.attrs,done:false}};
 if(!canSplit(tr.doc,pos,1,[spec]))return false;
 tr.split(pos,1,[spec]);
 tr.setSelection(TextSelection.near(tr.doc.resolve(pos+1)));
 editor.view.dispatch(tr.scrollIntoView());
 return true;
}
