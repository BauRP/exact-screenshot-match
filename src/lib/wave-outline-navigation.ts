import type {Editor} from "@tiptap/react";
/** Navigate to a heading inside nested folded sections without landing on
 * invisible content. All containing sections open in one undoable transaction. */
export function revealOutlinePosition(editor:Editor,pos:number):boolean{
 if(editor.isDestroyed)return false;
 const doc=editor.state.doc;
 if(!Number.isSafeInteger(pos)||pos<0||pos>doc.content.size)return false;
 const $pos=doc.resolve(pos);
 const updates:{pos:number;attrs:Record<string,unknown>}[]=[];
 for(let depth=1;depth<=$pos.depth;depth++){
  const node=$pos.node(depth);
  if(node.type.name==="waveFold"&&node.attrs.collapsed)
   updates.push({pos:$pos.before(depth),attrs:{...node.attrs,collapsed:false}});
 }
 let tr=editor.state.tr;
 for(const item of updates)tr=tr.setNodeMarkup(item.pos,undefined,item.attrs);
 if(updates.length)editor.view.dispatch(tr);
 const target=Math.min(pos,editor.state.doc.content.size);
 return editor.chain().focus().setTextSelection(target).run();
}
