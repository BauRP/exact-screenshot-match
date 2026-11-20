/** A newly created note without text may still contain meaningful saved
 * objects. Do not discard it as an empty draft just because getText() is blank.
 * Only inspect the editor's current document; never rebuild its HTML or
 * touch media IDs, formatting, undo history or private Tape answers. */
import type {Node as PMNode} from "@tiptap/pm/model";
const STRUCTURES=new Set([
 "waveChecklistItem","waveFold","waveCallout","wavePageBreak",
 "waveDrawing","waveImage","audioNote","horizontalRule",
 "bulletList","orderedList","taskList","table","blockquote",
]);
export function hasMeaningfulNoteContent(doc:PMNode):boolean{
 let meaningful=false;
 doc.descendants(node=>{
  if(STRUCTURES.has(node.type.name)){meaningful=true;return false;}
  return true;
 });
 return meaningful;
}
