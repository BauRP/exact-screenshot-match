import type {Editor} from "@tiptap/react";
import {Fragment,type Node as PMNode} from "@tiptap/pm/model";
import {selectedWaveBlockPos,selectedWaveSiblingRange,waveChildOffset} from "./wave-block-motion";
import {TextSelection} from "@tiptap/pm/state";
import {canSplit} from "@tiptap/pm/transform";
import type {CheckShape} from "./wave-checklist";
import {topLevelPageRanges} from "./wave-page-actions";

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

/** The active text selection may cover multiple tasks in a section.
 * Do not accidentally touch tasks beyond the selection or cross page breaks.
 * A caret inside a task remains a one-item operation. */
function selectedChecklistRows(editor:Editor):{pos:number;node:PMNode}[]{
 const {state}=editor;
 if(!state.selection.empty){
  const range=selectedWaveSiblingRange(editor);
  if(!range)return [];
  const parent=state.selection.$from.node(range.depth);
  const rows:{pos:number;node:PMNode}[]=[];
  let pos=range.from;
  for(let i=range.start;i<range.end;i++){
   const node=parent.child(i);
   if(node.type.name!=="waveChecklistItem")return [];
   rows.push({pos,node});
   pos+=node.nodeSize;
  }
  return rows;
 }
 const pos=selectedWaveBlockPos(editor),node=typeof pos==="number"?state.doc.nodeAt(pos):null;
 return node?.type.name==="waveChecklistItem"&&typeof pos==="number"?[{pos,node}]:[];
}

/** Change the saved marker of one or more selected tasks as ONE undoable edit.
 * Preserve inline formatting, direction, completion flags and task text. */
export function setSelectedChecklistShape(editor:Editor,shape:CheckShape):boolean{
 if(!editor.isEditable||editor.isDestroyed||
    !["square","circle","diamond","check"].includes(shape))return false;
 const rows=selectedChecklistRows(editor);
 if(!rows.length)return false;
 const changed=rows.filter(({node})=>node.attrs.shape!==shape);
 if(!changed.length)return true;
 let tr=editor.state.tr;
 for(const {pos,node} of changed)tr=tr.setNodeMarkup(pos,undefined,{...node.attrs,shape});
 editor.view.dispatch(tr.scrollIntoView());
 return true;
}

/** Change only the selected checklist rows' completion state. Does not
 * modify other pages or tasks in the same note. One Undo reverses the group. */
export function setSelectedTasksDone(editor:Editor,done:boolean):number{
 if(!editor.isEditable||editor.isDestroyed)return 0;
 const rows=selectedChecklistRows(editor).filter(({node})=>node.attrs.done!==done);
 if(!rows.length)return 0;
 let tr=editor.state.tr;
 for(const {pos,node} of rows)tr=tr.setNodeMarkup(pos,undefined,{...node.attrs,done});
 editor.view.dispatch(tr.scrollIntoView());
 return rows.length;
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

/** Return the innermost containing section, never a sibling section. This is
 * pure document traversal; the selection stays exactly where the user left it. */
export function selectedSectionTaskCounts(editor:Editor):ChecklistCounts|undefined{
 if(editor.isDestroyed)return undefined;
 const {$from}=editor.state.selection;
 for(let depth=$from.depth;depth>0;depth--){
  const node=$from.node(depth);
  if(node.type.name==="waveFold")return countDocumentTasks(node);
 }
 return undefined;
}

/** Mark only tasks belonging to the innermost section containing the caret.
 * Single transaction = single Undo; all text, media and sibling tasks survive. */
export function setSelectedSectionTasksDone(editor:Editor,done:boolean):number{
 if(!editor.isEditable||editor.isDestroyed)return 0;
 const {state}=editor,{$from}=state.selection;
 let sectionPos:number|undefined,sectionDepth=-1;
 for(let depth=$from.depth;depth>0;depth--){
  if($from.node(depth).type.name==="waveFold"){
   sectionDepth=depth;sectionPos=$from.before(depth);break;
  }
 }
 if(sectionPos===undefined||sectionDepth<0)return 0;
 const section=$from.node(sectionDepth),updates:{pos:number;attrs:Record<string,unknown>}[]=[];
 section.descendants((node,pos)=>{
  if(node.type.name==="waveChecklistItem"&&node.attrs.done!==done)
   updates.push({pos:sectionPos!+1+pos,attrs:{...node.attrs,done}});
 });
 if(!updates.length)return 0;
 let tr=state.tr;
 for(const item of updates)tr=tr.setNodeMarkup(item.pos,undefined,item.attrs);
 editor.view.dispatch(tr.scrollIntoView());
 return updates.length;
}


/** The active logical page is bounded by top-level page breaks only.
 * Checklists inside a nested section belong to their containing page. */
function selectedPageTaskRange(editor:Editor):{from:number;to:number}{
 const pages=topLevelPageRanges(editor.state.doc);
 const pos=editor.state.selection.from;
 let index=0;
 for(let i=1;i<pages.length;i++)if(pos>=pages[i].start)index=i;
 return {from:pages[index].bodyStart,to:pages[index].end};
}
export function currentPageTaskCounts(editor:Editor):ChecklistCounts{
 if(editor.isDestroyed)return {total:0,done:0,pending:0};
 const {from,to}=selectedPageTaskRange(editor);
 let total=0,done=0;
 editor.state.doc.nodesBetween(from,to,node=>{
  if(node.type.name==="waveChecklistItem"){
   total++;
   if(node.attrs.done===true)done++;
  }
 });
 return {total,done,pending:total-done};
}
/** Complete or reset tasks on the active page as one undoable edit,
 * without touching other pages or rebuilding nested sections. */
export function setCurrentPageTasksDone(editor:Editor,done:boolean):number{
 if(!editor.isEditable||editor.isDestroyed)return 0;
 const {from,to}=selectedPageTaskRange(editor);
 const updates:{pos:number;attrs:Record<string,unknown>}[]=[];
 editor.state.doc.nodesBetween(from,to,(node,pos)=>{
  if(node.type.name==="waveChecklistItem"&&node.attrs.done!==done)
   updates.push({pos,attrs:{...node.attrs,done}});
 });
 if(!updates.length)return 0;
 let tr=editor.state.tr;
 for(const item of updates)tr=tr.setNodeMarkup(item.pos,undefined,item.attrs);
 editor.view.dispatch(tr.scrollIntoView());
 return updates.length;
}

/** Turn selected paragraphs into independent saved tasks (or tasks back into
 * paragraphs) as one undoable edit. This never reconstructs text from HTML:
 * inline marks, bidi direction and text remain the original ProseMirror
 * fragments. Mixed media, headings, page dividers and nested list structures
 * are rejected together instead of silently deleting unsupported content. */
export function convertSelectedChecklistBlocks(
 editor:Editor,mode:"tasks"|"paragraphs",shape:CheckShape="square"
):number{
 if(!editor.isEditable||editor.isDestroyed)return 0;
 const {state}=editor;
 const selection=state.selection;
 const range=selectedWaveSiblingRange(editor);
 let parent:PMNode,first:number,last:number,from:number,to:number;
 if(range){
  if(range.depth!==0&&selection.$from.node(range.depth).type.name!=="waveFold")return 0;
  parent=selection.$from.node(range.depth);
  first=range.start;last=range.end;from=range.from;to=range.to;
 }else{
  const pos=selectedWaveBlockPos(editor);
  if(pos===undefined)return 0;
  const resolved=state.doc.resolve(pos);
  parent=resolved.parent;first=resolved.index();last=first+1;
  if(first>=parent.childCount)return 0;
  from=pos;to=pos+parent.child(first).nodeSize;
 }
 if(first>=last||first<0||last>parent.childCount)return 0;
 const fromType=mode==="tasks"?"paragraph":"waveChecklistItem";
 const toType=mode==="tasks"?state.schema.nodes.waveChecklistItem:state.schema.nodes.paragraph;
 if(!toType||(mode==="tasks"&&!["square","circle","diamond","check"].includes(shape)))return 0;
 const replacements:PMNode[]=[];
 for(let index=first;index<last;index++){
  const node=parent.child(index);
  if(node.type.name!==fromType)return 0;
  const attrs=mode==="tasks"
   ? {...node.attrs,shape,done:false}
   : {...node.attrs,shape:undefined,done:undefined};
  // The paragraph schema receives text-direction but not checklist metadata.
  if(mode==="paragraphs"){delete attrs.shape;delete attrs.done;}
  if(!toType.validContent(node.content))return 0;
  replacements.push(toType.create(attrs,node.content,node.marks));
 }
 const replacement=Fragment.fromArray(replacements);
 if(!parent.canReplace(first,last,replacement))return 0;
 const tr=state.tr.replaceWith(from,to,replacement).scrollIntoView();
 if(!tr.doc.type.validContent(tr.doc.content))return 0;
 editor.view.dispatch(tr);
 return replacements.length;
}
