import {Fragment,type Node as PMNode} from "@tiptap/pm/model";
import type {Editor} from "@tiptap/react";
import {TextSelection} from "@tiptap/pm/state";

/** A page consists of its divider and all following top-level blocks up to
 * the next divider. Nested dividers are intentionally not rearranged:
 * nested dividers remain inside their parent sections and do not split pages. */
type PageRange={start:number;bodyStart:number;end:number};
export function topLevelPageRanges(doc:PMNode):PageRange[]{
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

/** Insert an empty page immediately before the current logical page.
 * The first page has no divider: prepend [empty paragraph, divider] instead
 * of introducing an invalid leading marker or rewriting the first page. */
export function insertBlankPageBefore(editor:Editor):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const {doc,schema,selection}=editor.state;
 const pages=topLevelPageRanges(doc),divider=schema.nodes.wavePageBreak,paragraph=schema.nodes.paragraph;
 if(!divider||!paragraph||!pages.length)return false;
 const index=currentPageIndex(pages,selection.from),at=pages[index].start;
 const content=Fragment.fromArray(index===0?
   [paragraph.create(),divider.create()]:[divider.create(),paragraph.create()]);
 const $at=doc.resolve(at);
 if($at.parent!==doc||!doc.canReplace($at.index(),$at.index(),content))return false;
 editor.view.dispatch(editor.state.tr.insert(at,content).scrollIntoView());
 return true;
}

/** Split a top-level text paragraph at the caret into two pages.
 * The original rich ProseMirror fragments are reused verbatim. Everything
 * after the caret (including inline marks) stays on the new page, and the
 * operation remains one undoable transaction. Refuse nested/table selections. */
export function splitPageAtCaret(editor:Editor):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const {state,view}=editor,{doc,schema,selection}=state;
 if(!selection.empty)return false;
 const $pos=selection.$from;
 if($pos.depth!==1||!$pos.parent.isTextblock)return false;
 const paragraph=$pos.parent;
 const offset=$pos.parentOffset;
 // Splitting at a boundary creates an unexpected blank page. Use the
 // explicit "before" / "after" actions instead.
 if(offset<=0||offset>=paragraph.content.size)return false;
 const divider=schema.nodes.wavePageBreak;
 if(!divider)return false;
 const left=paragraph.copy(paragraph.content.cut(0,offset));
 const right=paragraph.copy(paragraph.content.cut(offset));
 if(!left.type.validContent(left.content)||!right.type.validContent(right.content))return false;
 const replacement=Fragment.fromArray([left,divider.create(),right]);
 const index=$pos.index(0),root=doc;
 if(!root.canReplace(index,index+1,replacement))return false;
 const from=$pos.before(1),to=from+paragraph.nodeSize;
 const tr=state.tr.replaceWith(from,to,replacement);
 // Place the cursor at the beginning of the continuation paragraph.
 const cursor=from+left.nodeSize+divider.create().nodeSize+1;
 if(cursor<=tr.doc.content.size){
  tr.setSelection(TextSelection.create(tr.doc,cursor));
 }
 view.dispatch(tr.scrollIntoView());
 return true;
}

/** Merge current page with its NEXT page by removing only the top-level
 * divider. This never removes text/media and works for the initial page. */
export function mergeCurrentPageWithNext(editor:Editor):boolean{
 if(!editor.isEditable||editor.isDestroyed)return false;
 const {doc,selection}=editor.state,pages=topLevelPageRanges(doc);
 const index=currentPageIndex(pages,selection.from);
 if(index>=pages.length-1)return false;
 const nextDivider=pages[index+1].start,node=doc.nodeAt(nextDivider);
 if(node?.type.name!=="wavePageBreak")return false;
 const tr=editor.state.tr.delete(nextDivider,nextDivider+node.nodeSize);
 if(!tr.doc.type.validContent(tr.doc.content))return false;
 editor.view.dispatch(tr.scrollIntoView());
 return true;
}


/** Only paragraph-only whitespace pages are safe to discard; never erase
 * photos, audio, drawings, checklists, section nodes or nonblank text. */
export function isEmptyPageBody(body:Fragment):boolean{
 for(let i=0;i<body.childCount;i++){
  const node=body.child(i);
  if(node.type.name!=="paragraph")return false;
  let blank=true;
  node.forEach(child=>{if(!child.isText||Boolean(child.text?.trim()))blank=false;});
  if(!blank)return false;
 }
 return true;
}

/** Remove all truly empty pages in ONE undoable document transaction.
 * Page 1 is never removed. Work backwards so positions don't shift;
 * keep every non-empty page, binary reference, style and nested block. */
export function removeAllEmptyPages(editor:Editor):number{
 if(!editor.isEditable||editor.isDestroyed)return 0;
 const {doc}=editor.state,pages=topLevelPageRanges(doc),removed:number[]=[];
 for(let i=1;i<pages.length;i++){
  const p=pages[i],body=doc.content.cut(p.bodyStart,p.end);
  if(isEmptyPageBody(body))removed.push(i);
 }
 if(!removed.length)return 0;
 let tr=editor.state.tr;
 for(let i=removed.length-1;i>=0;i--){
  const page=pages[removed[i]];
  tr=tr.delete(page.start,page.end);
 }
 if(!tr.doc.type.validContent(tr.doc.content))return 0;
 editor.view.dispatch(tr.scrollIntoView());
 return removed.length;
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
 if(!isEmptyPageBody(nodes))return false;
 editor.view.dispatch(editor.state.tr.delete(page.start,page.end).scrollIntoView());
 return true;
}
