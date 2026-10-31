import { Fragment } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

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
  if (parent.content.offsetAt(index) !== siblingOffset) return false;

  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= parent.childCount) return false;

  const current = parent.child(index);
  const neighbor = parent.child(nextIndex);
  const from = direction === "up" ? position - neighbor.nodeSize : position;
  const to = direction === "up" ? position + current.nodeSize : position + current.nodeSize + neighbor.nodeSize;
  const firstIndex = Math.min(index, nextIndex);
  const replacement = direction === "up"
    ? Fragment.fromArray([current, neighbor])
    : Fragment.fromArray([neighbor, current]);

  if (from < 0 || to > doc.content.size ||
      !parent.canReplace(firstIndex, firstIndex + 2, replacement)) return false;

  view.dispatch(state.tr.replaceWith(from, to, replacement).scrollIntoView());
  return true;
}

/** Find the editable block containing the caret without crossing a table or
 * unrelated nested container. Only document and WaveFold are reorderable. */
export function selectedWaveBlockPos(editor:Editor):number|undefined {
 const {$from}=editor.state.selection;
 for(let depth=$from.depth;depth>=0;depth--){
  const parent=$from.node(depth);
  if(parent.type.name!=="doc"&&parent.type.name!=="waveFold")continue;
  const index=$from.index(depth);
  if(index>=parent.childCount)return undefined;
  return $from.start(depth)+parent.content.offsetAt(index);
 }
 return undefined;
}
export function moveSelectedWaveBlock(editor:Editor,direction:"up"|"down"):boolean{
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
 if(index>=section.childCount||section.content.offsetAt(index)!==$pos.parentOffset)return false;
 const moving=section.child(index);
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

/** Place the selected block inside the immediately preceding folded section.
 * All node content (including images, audio references and marks) is reused.
 * ProseMirror schema validation rejects forbidden parent/child combinations. */
export function nestSelectedWaveBlock(editor:Editor):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const pos=selectedWaveBlockPos(editor);
 if(pos===undefined||pos<0)return false;
 const {doc}=editor.state,$pos=doc.resolve(pos),parent=$pos.parent,index=$pos.index();
 if(index<1||index>=parent.childCount||
    parent.content.offsetAt(index)!==$pos.parentOffset)return false;
 const previous=parent.child(index-1),moving=parent.child(index);
 if(previous.type.name!=="waveFold")return false;
 // Do not make a deeply nested structure unusable on a small phone.
 let nestedDepth=0;
 for(let i=0;i<=$pos.depth;i++)if($pos.node(i).type.name==="waveFold")nestedDepth++;
 if(nestedDepth>=5)return false;
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
 const pos=selectedWaveBlockPos(editor);
 if(pos===undefined||pos<0)return false;
 const {doc}=editor.state,$pos=doc.resolve(pos),parent=$pos.parent,index=$pos.index();
 if(index>=parent.childCount||parent.content.offsetAt(index)!==$pos.parentOffset)return false;
 const node=parent.child(index);
 if(!parent.canReplace(index+1,index+1,Fragment.from(node)))return false;
 editor.view.dispatch(editor.state.tr.insert(pos+node.nodeSize,node).scrollIntoView());
 return true;
}
