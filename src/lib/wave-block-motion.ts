import {Fragment} from "@tiptap/pm/model";
import type {Editor} from "@tiptap/react";
/** Move a complete top-level block; one ProseMirror transaction keeps undo history coherent. */
export function moveWaveBlock(editor:Editor,getPos:()=>number|undefined,direction:"up"|"down"):boolean{
 const pos=getPos();if(typeof pos!=="number"||!editor.isEditable)return false;
 const {state,view}=editor;
 const $pos=state.doc.resolve(pos);
 const start=pos;
 const target=state.doc.nodeAt(start);
 if(!target)return false;
 const otherPos=direction==="up"?start-1:start+target.nodeSize;
 if(otherPos<0||otherPos>=state.doc.content.size)return false;
 const adjacent=direction==="down"?state.doc.nodeAt(otherPos):state.doc.resolve(otherPos).nodeBefore;
 if(!adjacent)return false;
 const from=direction==="up"?start-adjacent.nodeSize:start;
 const to=direction==="up"?start+target.nodeSize:start+target.nodeSize+adjacent.nodeSize;
 if(from<0||to>state.doc.content.size)return false;
 const nodes=direction==="up"?[target,adjacent]:[adjacent,target];
 const tr=state.tr.replaceWith(from,to,Fragment.fromArray(nodes));
 view.dispatch(tr.scrollIntoView());return true;
}
