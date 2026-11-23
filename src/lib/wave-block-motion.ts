import { Fragment, type Node as PMNode, type ResolvedPos } from "@tiptap/pm/model";
import {topLevelPageRanges} from "./wave-page-actions";
import {NodeSelection,TextSelection,Selection,type Transaction} from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";

/** Keep the caret/selection inside relocated nodes, not on the block that
 * later occupies the old position. Unrelated NodeView selections are ignored. */
function retainMovedSelection(tr:Transaction,selection:Selection,from:number,to:number,at:number):void{
 if(selection.from<from||selection.to>to)return;
 const offset=at-from;
 if(selection instanceof NodeSelection)tr.setSelection(NodeSelection.create(tr.doc,selection.from+offset));
 else if(selection instanceof TextSelection)
  tr.setSelection(TextSelection.create(tr.doc,selection.anchor+offset,selection.head+offset));
}
/** A Fragment has no offsetAt API; sum child sizes in the active schema. */
export function waveChildOffset(parent:PMNode,index:number):number {
  let offset=0;
  for(let i=0;i<index;i++)offset+=parent.child(i).nodeSize;
  return offset;
}


/**
 * Reorder only direct siblings inside the same parent. Never splice through a
 * folded section, list, table or other ProseMirror container.
 * A single transaction keeps the operation in the editor undo history.
 */
export function moveWaveBlock(
  editor: Editor,
  getPos: () => number | undefined,
  direction: "up" | "down",
): boolean {
  if (!editor.isEditable || editor.isDestroyed) return false;
  const position = getPos();
  if (typeof position !== "number") return false;

  const { state, view } = editor;
  const doc = state.doc;
  if (position < 0 || position >= doc.content.size) return false;

  const resolved = doc.resolve(position);
  const parent = resolved.parent;
  const index = resolved.index();
  const siblingOffset = resolved.parentOffset;

  // getPos() must be a node boundary at this depth.
  if (index >= parent.childCount) return false;
  if (waveChildOffset(parent,index) !== siblingOffset) return false;

  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= parent.childCount) return false;

  const current = parent.child(index);
  const neighbor = parent.child(nextIndex);
  // Explicit page dividers own their page: never drag a single block past
  // a divider with a generic block action. Use page movement instead.
  if(current.type.name==="wavePageBreak"||neighbor.type.name==="wavePageBreak")return false;
  const from = direction === "up" ? position - neighbor.nodeSize : position;
  const to = direction === "up" ? position + current.nodeSize : position + current.nodeSize + neighbor.nodeSize;
  const firstIndex = Math.min(index, nextIndex);
  const replacement = direction === "up"
    ? Fragment.fromArray([current, neighbor])
    : Fragment.fromArray([neighbor, current]);

  if (from < 0 || to > doc.content.size ||
      !parent.canReplace(firstIndex, firstIndex + 2, replacement)) return false;

  const tr=state.tr.replaceWith(from,to,replacement);
  retainMovedSelection(tr,state.selection,position,position+current.nodeSize,
   position+(direction==="up"?-neighbor.nodeSize:neighbor.nodeSize));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** Find the editable block containing the caret without crossing a table or
 * unrelated nested container. Only document and WaveFold are reorderable. */
/** A caret inside a table, list or callout is not an implicit command to
 * move or duplicate its whole enclosing block. WaveFold is the only safe
 * intermediate container for direct sibling block operations. */
function insideUnsupportedContainer($pos:ResolvedPos):boolean{
 for(let depth=1;depth<$pos.depth;depth++){
  if($pos.node(depth).type.name!=="waveFold")return true;
 }
 return false;
}
export function selectedWaveBlockPos(editor:Editor):number|undefined {
 const {selection}=editor.state,{$from}=selection;
 if(insideUnsupportedContainer($from))return undefined;
 // If the other end of a text selection is in a table, another section, or
 // another page, it cannot be treated as a single block at the starting caret.
 if(!selection.empty){
  const range=selectedWaveSiblingRange(editor);
  if(!range||range.end-range.start!==1)return undefined;
 }
 for(let depth=$from.depth;depth>=0;depth--){
  const parent=$from.node(depth);
  if(parent.type.name!=="doc"&&parent.type.name!=="waveFold")continue;
  const index=$from.index(depth);
  if(index>=parent.childCount)return undefined;
  return $from.start(depth)+waveChildOffset(parent,index);
 }
 return undefined;
}
/** Determine whole direct siblings covered by the visible selection.
 * Whitespace edges count only for a block whose actual content is selected.
 * The deepest common doc/WaveFold ancestor keeps nested content together. */
export function selectedWaveSiblingRange(editor:Editor):{from:number;to:number;start:number;end:number;depth:number}|undefined{
 const {selection}=editor.state;
 if(selection.empty)return undefined;
 const {$from,$to}=selection;
 if(insideUnsupportedContainer($from)||insideUnsupportedContainer($to))return undefined;
 for(let depth=Math.min($from.depth,$to.depth);depth>=0;depth--){
  if($from.node(depth)!==$to.node(depth))continue;
  const parent=$from.node(depth);
  if(parent.type.name!=="doc"&&parent.type.name!=="waveFold")continue;
  const base=$from.start(depth);
  let offset=0,start=-1,end=-1,from=0,to=0;
  for(let index=0;index<parent.childCount;index++){
   const node=parent.child(index),begin=base+offset,finish=begin+node.nodeSize;
   if(selection.from<finish&&selection.to>begin){
    if(start<0){start=index;from=begin;}
    end=index+1;to=finish;
   }
   offset+=node.nodeSize;
  }
  if(start>=0)return {from,to,start,end,depth};
 }
 return undefined;
}

/** Move a contiguous multi-block selection without splitting rich nodes,
 * changing attachment IDs or rearranging top-level page boundaries. */
export function moveSelectedWaveBlock(editor:Editor,direction:"up"|"down"):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const range=selectedWaveSiblingRange(editor);
 if(range&&range.end-range.start>1){
  const {state,view}=editor,{doc}=state;
  const parent=state.selection.$from.node(range.depth);
  const neighborIndex=direction==="up"?range.start-1:range.end;
  if(neighborIndex<0||neighborIndex>=parent.childCount)return false;
  const selected=parent.content.cut(
   waveChildOffset(parent,range.start),waveChildOffset(parent,range.end));
  if(selected.content.some(node=>node.type.name==="wavePageBreak"))return false;
  const neighbor=parent.child(neighborIndex);
  if(neighbor.type.name==="wavePageBreak")return false;
  const swapped=direction==="up"
   ?selected.append(Fragment.from(neighbor))
   :Fragment.from(neighbor).append(selected);
  const first=direction==="up"?neighborIndex:range.start;
  const last=direction==="up"?range.end:neighborIndex+1;
  if(!parent.canReplace(first,last,swapped))return false;
  const from=direction==="up"?range.from-neighbor.nodeSize:range.from;
  const to=direction==="up"?range.to:range.to+neighbor.nodeSize;
  if(from<0||to>doc.content.size)return false;
  const tr=state.tr.replaceWith(from,to,swapped);
  retainMovedSelection(tr,state.selection,range.from,range.to,
   range.from+(direction==="up"?-neighbor.nodeSize:neighbor.nodeSize));
  view.dispatch(tr.scrollIntoView());
  return true;
 }
 const pos=selectedWaveBlockPos(editor);
 return typeof pos==="number"&&moveWaveBlock(editor,()=>pos,direction);
}

/** Outdent one direct child from a folded section as a real sibling. Keep
 * a placeholder if it was the section's only child, because block+ is required.
 * No flattening or text reconstruction: all descendants, styles and files stay
 * attached to their original ProseMirror nodes. */
export function liftWaveBlock(editor:Editor,getPos:()=>number|undefined):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const pos=getPos();
 if(typeof pos!=="number"||pos<0||pos>=editor.state.doc.content.size)return false;
 const {doc,schema}=editor.state;
 const $pos=doc.resolve(pos);
 const section=$pos.parent;
 if(section.type.name!=="waveFold"||$pos.depth<1)return false;
 const index=$pos.index();
 if(index>=section.childCount||waveChildOffset(section,index)!==$pos.parentOffset)return false;
 const moving=section.child(index);
 // A nested page divider must not be promoted to a top-level page by the
 // generic outdent action. Page boundaries use dedicated page commands.
 if(moving.type.name==="wavePageBreak")return false;
 const sectionStart=$pos.before($pos.depth);
 const outer=doc.resolve(sectionStart),outerIndex=outer.index();
 const before=section.content.cut(0,$pos.parentOffset);
 const after=section.content.cut($pos.parentOffset+moving.nodeSize);
 const remaining=before.append(after);
 const filler=schema.nodes.paragraph;
 if(!remaining.childCount&&!filler)return false;
 const nextSection=section.copy(remaining.childCount?remaining:Fragment.from(filler.create()));
 const replacement=Fragment.fromArray([nextSection,moving]);
 if(!nextSection.type.validContent(nextSection.content)||
    !outer.parent.canReplace(outerIndex,outerIndex+1,replacement))return false;
 editor.view.dispatch(editor.state.tr.replaceWith(sectionStart,sectionStart+section.nodeSize,replacement).scrollIntoView());
 return true;
}

/** Count the deepest WaveFold chain within a movable subtree, including its root. */
function maxWaveFoldLevels(node:PMNode):number{
 let deepest=0;
 node.forEach(child=>{deepest=Math.max(deepest,maxWaveFoldLevels(child));});
 return (node.type.name==="waveFold"?1:0)+deepest;
}
/** Place the selected block inside the immediately preceding folded section.
 * All node content (including images, audio references and marks) is reused.
 * ProseMirror schema validation rejects forbidden parent/child combinations. */
export function nestSelectedWaveBlock(editor:Editor):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const pos=selectedWaveBlockPos(editor);
 if(pos===undefined||pos<0)return false;
 const {doc}=editor.state,$pos=doc.resolve(pos),parent=$pos.parent,index=$pos.index();
 if(index<1||index>=parent.childCount||
    waveChildOffset(parent,index)!==$pos.parentOffset)return false;
 const previous=parent.child(index-1),moving=parent.child(index);
 // A top-level page boundary may never disappear inside a folded section.
 if(moving.type.name==="wavePageBreak")return false;
 if(previous.type.name!=="waveFold")return false;
 // Do not make a deeply nested structure unusable on a small phone.
 let nestedDepth=0;
 for(let i=0;i<=$pos.depth;i++)if($pos.node(i).type.name==="waveFold")nestedDepth++;
 // Include nested folds already contained in the moving block.
 // Otherwise nesting a deep section can silently create a sixth level.
 if(nestedDepth+1+maxWaveFoldLevels(moving)>5)return false;
 const childContent=previous.content.append(Fragment.from(moving));
 if(!previous.type.validContent(childContent))return false;
 const wrapped=previous.type.create({...previous.attrs,collapsed:false},childContent,previous.marks);
 const replacement=Fragment.from(wrapped);
 if(!parent.canReplace(index-1,index+1,replacement))return false;
 const start=pos-previous.nodeSize;
 editor.view.dispatch(editor.state.tr.replaceWith(start,pos+moving.nodeSize,replacement).scrollIntoView());
 return true;
}

/** Duplicate selected block in place. This is a document edit, not a note copy. */
export function duplicateSelectedWaveBlock(editor:Editor):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const range=selectedWaveSiblingRange(editor);
 if(range&&range.end-range.start>1){
  const {state,view}=editor;
  const parent=state.selection.$from.node(range.depth);
  const nodes=parent.content.cut(waveChildOffset(parent,range.start),waveChildOffset(parent,range.end));
  if(nodes.content.some(node=>node.type.name==="wavePageBreak"))return false;
  if(!parent.canReplace(range.end,range.end,nodes))return false;
  const tr=state.tr.insert(range.to,nodes);
  const sel=state.selection;
  if(sel instanceof TextSelection){
   const delta=range.to-range.from;
   tr.setSelection(TextSelection.create(tr.doc,sel.anchor+delta,sel.head+delta));
  }
  view.dispatch(tr.scrollIntoView());
  return true;
 }
 const pos=selectedWaveBlockPos(editor);
 if(pos===undefined||pos<0)return false;
 const {doc}=editor.state,$pos=doc.resolve(pos),parent=$pos.parent,index=$pos.index();
 if(index>=parent.childCount||waveChildOffset(parent,index)!==$pos.parentOffset)return false;
 const node=parent.child(index);
 // A page divider is a document boundary, not an ordinary duplicable block.
 if(node.type.name==="wavePageBreak")return false;
 if(!parent.canReplace(index+1,index+1,Fragment.from(node)))return false;
 const {state,view}=editor;
 const tr=state.tr.insert(pos+node.nodeSize,node);
 const sel=state.selection;
 if(sel instanceof NodeSelection&&sel.from===pos)
  tr.setSelection(NodeSelection.create(tr.doc,pos+node.nodeSize));
 else if(sel instanceof TextSelection&&sel.from>=pos&&sel.to<=pos+node.nodeSize)
  tr.setSelection(TextSelection.create(tr.doc,sel.anchor+node.nodeSize,sel.head+node.nodeSize));
 view.dispatch(tr.scrollIntoView());
 return true;
}

/** Change the highlighted callout without rebuilding paragraphs or losing marks. */
export function setSelectedCalloutKind(editor:Editor,kind:"important"|"tip"|"warning"|"info"):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const {selection}=editor.state,{$from,$to}=selection;
 for(let depth=$from.depth;depth>0;depth--){
  const node=$from.node(depth);
  if(node.type.name!=="waveCallout")continue;
  // Do not change only the first callout of a multi-block selection.
  if(!selection.empty&&($to.depth<depth||$to.node(depth)!==node))return false;
  if(node.attrs.kind===kind)return false;
  const pos=$from.before(depth);
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...node.attrs,kind}).scrollIntoView());
  return true;
 }
 return false;
}

/** Nearest enclosing section, including its title, child blocks and media.
 * A multi-block selection is valid only when BOTH ends are inside the SAME
 * section. Otherwise moving/duplicating just the first section would silently
 * affect content the user did not select and leave the other side behind. */
export function containingWaveSectionPos(editor:Editor):number|undefined{
 if(editor.isDestroyed)return undefined;
 const {selection}=editor.state,{$from,$to}=selection;
 for(let depth=$from.depth;depth>0;depth--){
  const section=$from.node(depth);
  if(section.type.name!=="waveFold")continue;
  if(!selection.empty&&($to.depth<depth||$to.node(depth)!==section))
   return undefined;
  return $from.before(depth);
 }
 return undefined;
}
export function moveContainingWaveSection(editor:Editor,direction:"up"|"down"):boolean{
 const pos=containingWaveSectionPos(editor);
 return pos===undefined?false:moveWaveBlock(editor,()=>pos,direction);
}
export function duplicateContainingWaveSection(editor:Editor):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const pos=containingWaveSectionPos(editor);
 if(pos===undefined)return false;
 const {doc}=editor.state,$pos=doc.resolve(pos);
 const index=$pos.index(),parent=$pos.parent;
 if(index>=parent.childCount||waveChildOffset(parent,index)!==$pos.parentOffset)return false;
 const node=parent.child(index);
 if(node.type.name!=="waveFold"||!parent.canReplace(index+1,index+1,Fragment.from(node)))return false;
 const {state,view}=editor;
 const tr=state.tr.insert(pos+node.nodeSize,node);
 const sel=state.selection;
 if(sel instanceof NodeSelection&&sel.from===pos)
  tr.setSelection(NodeSelection.create(tr.doc,pos+node.nodeSize));
 else if(sel instanceof TextSelection&&sel.from>=pos&&sel.to<=pos+node.nodeSize)
  tr.setSelection(TextSelection.create(tr.doc,sel.anchor+node.nodeSize,sel.head+node.nodeSize));
 view.dispatch(tr.scrollIntoView());
 return true;
}

/** Transfer a top-level text/media block, or a selection of adjacent blocks,
 * between EXISTING logical pages. Never carry or delete page dividers.
 * One ProseMirror transaction keeps the entire transfer undoable. */
export function moveWaveBlocksToAdjacentPage(editor:Editor,direction:"previous"|"next"):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const {state,view}=editor,{doc}=state;
 const group=selectedWaveSiblingRange(editor);
 let from:number,to:number;
 if(group&&group.depth===0&&group.end-group.start>1){
  from=group.from;to=group.to;
 }else{
  let pos=selectedWaveBlockPos(editor);
  if(pos===undefined)return false;
  let resolved=doc.resolve(pos);
  if(resolved.depth!==0){
   // A caret inside a folded section must transfer the whole top-level
   // section, never just one nested paragraph or its media. A selection
   // crossing top-level siblings remains ineligible for this fallback.
   const {$from,$to}=state.selection;
   if($from.depth<1||$to.depth<1||$from.node(1)!==$to.node(1))return false;
   pos=$from.before(1);
   resolved=doc.resolve(pos);
  }
  if(resolved.depth!==0||resolved.index()>=doc.childCount)return false;
  from=pos;to=pos+doc.child(resolved.index()).nodeSize;
 }
 if(from>=to)return false;
 const content=doc.content.cut(from,to);
 if(!content.childCount||content.content.some(node=>node.type.name==="wavePageBreak"))return false;
 const pages=topLevelPageRanges(doc);
 const current=pages.findIndex(page=>from>=page.bodyStart&&from<page.end);
 if(current<0||to>pages[current].end)return false;
 const destinationIndex=current+(direction==="previous"?-1:1);
 if(destinationIndex<0||destinationIndex>=pages.length)return false;
 const destination=direction==="previous"?pages[current].start:pages[destinationIndex].bodyStart;
 if(destination>=from&&destination<=to)return false;
 let tr=state.tr.delete(from,to);
 const mapped=tr.mapping.map(destination,-1);
 const $at=tr.doc.resolve(mapped);
 if($at.parent!==tr.doc||!tr.doc.canReplace($at.index(),$at.index(),content))return false;
 tr=tr.insert(mapped,content);
 if(!tr.doc.type.validContent(tr.doc.content))return false;
 retainMovedSelection(tr,state.selection,from,to,mapped);
 view.dispatch(tr.scrollIntoView());
 return true;
}

/** Copy a complete top-level block or selected group to another existing
 * page. The originals remain, their inline marks and media references stay
 * in the same note. Reject dividers, cross-page selections and nested splits. */
export function copyWaveBlocksToPage(editor:Editor,targetPage:number):boolean{
 if(!editor.isEditable||editor.isDestroyed||!Number.isSafeInteger(targetPage))return false;
 const {state,view}=editor,{doc,selection}=state,pages=topLevelPageRanges(doc);
 const target=targetPage-1;
 if(target<0||target>=pages.length)return false;
 const group=selectedWaveSiblingRange(editor);
 let from:number,to:number;
 if(group&&group.depth===0&&group.end-group.start>1){
  from=group.from;to=group.to;
 }else{
  let pos=selectedWaveBlockPos(editor);
  if(pos===undefined)return false;
  let resolved=doc.resolve(pos);
  if(resolved.depth!==0){
   const {$from,$to}=selection;
   if($from.depth<1||$to.depth<1||$from.node(1)!==$to.node(1))return false;
   pos=$from.before(1);resolved=doc.resolve(pos);
  }
  if(resolved.depth!==0||resolved.index()>=doc.childCount)return false;
  from=pos;to=pos+doc.child(resolved.index()).nodeSize;
 }
 if(from>=to)return false;
 const content=doc.content.cut(from,to);
 if(!content.childCount||content.content.some(node=>node.type.name==="wavePageBreak"))return false;
 const source=pages.findIndex(p=>from>=p.bodyStart&&from<p.end);
 if(source<0||source===target||to>pages[source].end)return false;
 const at=pages[target].end,$at=doc.resolve(at);
 if($at.parent!==doc||!doc.canReplace($at.index(),$at.index(),content))return false;
 const tr=state.tr.insert(at,content);
 if(!tr.doc.type.validContent(tr.doc.content))return false;
 const shift=at-from;
 if(selection instanceof TextSelection&&selection.from>=from&&selection.to<=to)
  tr.setSelection(TextSelection.create(tr.doc,selection.anchor+shift,selection.head+shift));
 else if(selection instanceof NodeSelection&&selection.from>=from&&selection.to<=to)
  tr.setSelection(NodeSelection.create(tr.doc,selection.from+shift));
 else tr.setSelection(Selection.near(tr.doc.resolve(at+Math.min(1,content.size))));
 view.dispatch(tr.scrollIntoView());
 return true;
}

/** Transfer a top-level block, section or contiguous selected group
 * directly to a numbered page. Keep its attachments and saved markup intact.
 * The destination is the end of that page, before the next page divider. */
export function moveWaveBlocksToPage(editor:Editor,targetPage:number):boolean{
 if(!editor.isEditable||editor.isDestroyed||!Number.isSafeInteger(targetPage))return false;
 const {state,view}=editor,{doc}=state,pages=topLevelPageRanges(doc);
 const target=targetPage-1;
 if(target<0||target>=pages.length)return false;
 const group=selectedWaveSiblingRange(editor);
 let from:number,to:number;
 if(group&&group.depth===0&&group.end-group.start>1){
  from=group.from;to=group.to;
 }else{
  let pos=selectedWaveBlockPos(editor);
  if(pos===undefined)return false;
  let resolved=doc.resolve(pos);
  if(resolved.depth!==0){
   const {$from,$to}=state.selection;
   if($from.depth<1||$to.depth<1||$from.node(1)!==$to.node(1))return false;
   pos=$from.before(1);
   resolved=doc.resolve(pos);
  }
  if(resolved.depth!==0||resolved.index()>=doc.childCount)return false;
  from=pos;to=pos+doc.child(resolved.index()).nodeSize;
 }
 if(from>=to)return false;
 const content=doc.content.cut(from,to);
 if(!content.childCount||content.content.some(node=>node.type.name==="wavePageBreak"))return false;
 const source=pages.findIndex(p=>from>=p.bodyStart&&from<p.end);
 if(source<0||source===target||to>pages[source].end)return false;
 const destination=pages[target].end;
 if(destination>=from&&destination<=to)return false;
 let tr=state.tr.delete(from,to);
 const at=tr.mapping.map(destination,-1),$at=tr.doc.resolve(at);
 if($at.parent!==tr.doc||!tr.doc.canReplace($at.index(),$at.index(),content))return false;
 tr=tr.insert(at,content);
 if(!tr.doc.type.validContent(tr.doc.content))return false;
 retainMovedSelection(tr,state.selection,from,to,at);
 view.dispatch(tr.scrollIntoView());
 return true;
}

/** Move a whole selected block or contiguous group directly to the start/end
 * of its CURRENT logical page. Never cross page dividers, split rich nodes or
 * rebuild attachment references. One document transaction = one Undo. */
export function moveWaveBlocksToPageEdge(editor:Editor,edge:"start"|"end"):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const {state,view}=editor,{doc}=state;
 const selected=selectedWaveSiblingRange(editor);
 let from:number,to:number;
 if(selected&&selected.depth===0&&selected.end-selected.start>1){
  from=selected.from;to=selected.to;
 }else{
  let pos=selectedWaveBlockPos(editor);
  if(pos===undefined)return false;
  let resolved=doc.resolve(pos);
  if(resolved.depth!==0){
   const {$from,$to}=state.selection;
   if($from.depth<1||$to.depth<1||$from.node(1)!==$to.node(1))return false;
   pos=$from.before(1);
   resolved=doc.resolve(pos);
  }
  if(resolved.depth!==0||resolved.index()>=doc.childCount)return false;
  from=pos;to=pos+doc.child(resolved.index()).nodeSize;
 }
 if(from>=to)return false;
 const fragment=doc.content.cut(from,to);
 if(!fragment.childCount||fragment.content.some(node=>node.type.name==="wavePageBreak"))return false;
 const page=topLevelPageRanges(doc).find(item=>from>=item.bodyStart&&from<item.end);
 if(!page||to>page.end)return false;
 if((edge==="start"&&from===page.bodyStart)||(edge==="end"&&to===page.end))return false;
 const destination=edge==="start"?page.bodyStart:page.end;
 let tr=state.tr.delete(from,to);
 const at=tr.mapping.map(destination,edge==="start"?1:-1);
 const $target=tr.doc.resolve(at);
 if($target.parent!==tr.doc||!tr.doc.canReplace($target.index(),$target.index(),fragment))return false;
 tr=tr.insert(at,fragment);
 if(!tr.doc.type.validContent(tr.doc.content))return false;
 retainMovedSelection(tr,state.selection,from,to,at);
 view.dispatch(tr.scrollIntoView());
 return true;
}

/** Move selected blocks to the first/last sibling position of their current
 * folded section, preserving attachment IDs, formatting and one-step Undo. */
export function moveWaveBlocksToSectionEdge(editor:Editor,edge:"start"|"end"):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const {state,view}=editor,{doc,selection}=state;
 const group=selectedWaveSiblingRange(editor);
 let from:number,to:number,depth:number;
 if(group&&group.depth>0&&selection.$from.node(group.depth).type.name==="waveFold"
     &&group.end-group.start>1){
  from=group.from;to=group.to;depth=group.depth;
 }else{
  const pos=selectedWaveBlockPos(editor);
  if(pos===undefined)return false;
  const $pos=doc.resolve(pos);
  if($pos.parent.type.name!=="waveFold"||$pos.index()>=$pos.parent.childCount)return false;
  from=pos;to=pos+$pos.parent.child($pos.index()).nodeSize;depth=$pos.depth;
 }
 if(from>=to)return false;
 const section=selection.$from.node(depth);
 if(section.type.name!=="waveFold")return false;
 const start=selection.$from.start(depth),end=selection.$from.end(depth);
 if(from<start||to>end)return false;
 if((edge==="start"&&from===start)||(edge==="end"&&to===end))return false;
 // Extract siblings from their actual parent, not doc.content: slicing the
 // whole document across a nested boundary creates a wrapped waveFold and
 // silently adds another section around the moved block.
 const moved=section.content.cut(from-start,to-start);
 if(!moved.childCount||moved.content.some(node=>node.type.name==="wavePageBreak"))return false;
 let tr=state.tr.delete(from,to);
 const at=tr.mapping.map(edge==="start"?start:end,edge==="start"?1:-1);
 const $target=tr.doc.resolve(at);
 if($target.parent.type.name!=="waveFold"||
    !$target.parent.canReplace($target.index(),$target.index(),moved))return false;
 tr=tr.insert(at,moved);
 if(!tr.doc.type.validContent(tr.doc.content))return false;
 retainMovedSelection(tr,selection,from,to,at);
 view.dispatch(tr.scrollIntoView());
 return true;
}
