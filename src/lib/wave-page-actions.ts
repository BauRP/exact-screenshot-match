import {Fragment,type Node as PMNode} from "@tiptap/pm/model";
import type {Editor} from "@tiptap/react";

/** A page consists of its divider and all following top-level blocks up to
 * the next divider. Nested dividers are intentionally not rearranged:
 * moving half of a folded section would corrupt its document structure. */
type PageRange={start:number;bodyStart:number;end:number};
export function topLevelPageRanges(doc:PMNode):PageRange[]{
 let nested=false;
 doc.descendants((node,_pos,parent)=>{
  if(node.type.name==="wavePageBreak"&&parent!==doc)nested=true;
 });
 if(nested)return [];
 const positions:number[]=[0];
 doc.forEach((node,pos)=>{
  if(node.type.name==="wavePageBreak")positions.push(pos);
 });
 return positions.map((start,index)=>({
  start,bodyStart:index===0?0:start+(doc.nodeAt(start)?.nodeSize||1),
  end:positions[index+1]??doc.content.size
 }));
}
function currentPageIndex(pages:PageRange[],pos:number):number{
 let index=0;
 for(let i=1;i<pages.length;i++)if(pos>=pages[i].start)index=i;
 return index;
}
/** Duplicate the whole logical page as ONE undoable ProseMirror transaction.
 * No attachment IDs are regenerated: both copies are in the SAME saved note
 * and retain a valid reference to the same locally stored binary files. */
export function duplicateCurrentPage(editor:Editor):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const {doc,schema,selection}=editor.state;
 const pages=topLevelPageRanges(doc),divider=schema.nodes.wavePageBreak;
 if(!pages.length||!divider)return false;
 const i=currentPageIndex(pages,selection.from),page=pages[i];
 const body=doc.content.cut(page.bodyStart,page.end);
 const original=i>0?doc.nodeAt(page.start):undefined;
 const oldLabel=String(original?.attrs.label||"Страница "+(i+1));
 const label=(oldLabel+" — копия").slice(0,80);
 const marker=divider.create({...original?.attrs,label});
 const copied=Fragment.from(marker).append(body);
 const at=doc.resolve(page.end);
 if(at.parent!==doc||!doc.canReplace(at.index(),at.index(),copied))return false;
 editor.view.dispatch(editor.state.tr.replaceWith(page.end,page.end,copied).scrollIntoView());
 return true;
}
/** Reorder pages after the initial page without rebuilding individual blocks
 * or losing formatting, media, section trees or saved page labels. The initial
 * page is special (it has no divider), so it is deliberately never swapped. */
export function moveCurrentPage(editor:Editor,direction:"up"|"down"):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const {doc,selection}=editor.state;
 const pages=topLevelPageRanges(doc);
 if(pages.length<3)return false;
 const index=currentPageIndex(pages,selection.from);
 const other=index+(direction==="up"?-1:1);
 if(index<1||other<1||other>=pages.length)return false;
 const left=pages[Math.min(index,other)],right=pages[Math.max(index,other)];
 if(left.end!==right.start)return false;
 const replacement=doc.content.cut(right.start,right.end).append(doc.content.cut(left.start,left.end));
 const $from=doc.resolve(left.start),$to=doc.resolve(right.end);
 if($from.parent!==doc||$to.parent!==doc||!doc.canReplace($from.index(),$to.index(),replacement))return false;
 editor.view.dispatch(editor.state.tr.replaceWith(left.start,right.end,replacement).scrollIntoView());
 return true;
}

/** Insert a new, empty top-level page AFTER the active page without splitting
 * text blocks, images, audio, or nested sections. One undoable transaction. */
export function insertBlankPageAfter(editor:Editor):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const {doc,schema,selection}=editor.state;
 const pages=topLevelPageRanges(doc),divider=schema.nodes.wavePageBreak,paragraph=schema.nodes.paragraph;
 if(!pages.length||!divider||!paragraph)return false;
 const index=currentPageIndex(pages,selection.from),at=pages[index].end;
 const content=Fragment.fromArray([divider.create(),paragraph.create()]);
 const resolved=doc.resolve(at);
 if(resolved.parent!==doc||!doc.canReplace(resolved.index(),resolved.index(),content))return false;
 editor.view.dispatch(editor.state.tr.insert(at,content).scrollIntoView());
 return true;
}

/** Erase only a completely empty page. Never remove text, photos, drawings,
 * audio, checklists, or a page that contains even one non-empty nested block. */
export function removeEmptyCurrentPage(editor:Editor):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const {doc,selection}=editor.state,pages=topLevelPageRanges(doc);
 if(pages.length<=1)return false;
 const index=currentPageIndex(pages,selection.from);
 if(index<=0)return false;
 const page=pages[index];
 if(page.end<=page.bodyStart)return false;
 const nodes=doc.content.cut(page.bodyStart,page.end);
 if(nodes.childCount!==1||nodes.firstChild?.type.name!=="paragraph"||
    nodes.firstChild.content.size!==0)return false;
 editor.view.dispatch(editor.state.tr.delete(page.start,page.end).scrollIntoView());
 return true;
}
