import type {Node as PMNode} from "@tiptap/pm/model";
export type OutlineItem={pos:number;depth:number;title:string;type:"heading"|"fold"|"page"};
/** Navigation is derived from actual document content, without modifying it. */
export function collectNoteOutline(doc:PMNode):OutlineItem[]{
 const items:OutlineItem[]=[];
 let page=1;
 doc.descendants((node,pos)=>{
  if(node.type.name==="wavePageBreak"){
   page+=1;
   items.push({pos,depth:1,title:(String(node.attrs.label||"").trim()||"Страница "+page),type:"page"});
  }else if(node.type.name==="heading"){
   const title=node.textContent.trim();
   if(title)items.push({pos,depth:Math.max(1,Math.min(6,Number(node.attrs.level)||2)),title:title.slice(0,140),type:"heading"});
  }else if(node.type.name==="waveFold"){
   items.push({pos,depth:2,title:String(node.attrs.title||"Раздел").slice(0,140),type:"fold"});
  }
 });
 return items;
}

/** Explicit page boundaries are ProseMirror positions, never guessed pixels. */
export function notePagePositions(doc:PMNode):number[]{
 const positions=[0];
 doc.descendants((node,pos)=>{if(node.type.name==="wavePageBreak")positions.push(pos+node.nodeSize);});
 return positions;
}
export function noteCurrentPage(doc:PMNode,selectionPos:number):number{
 const pages=notePagePositions(doc);
 let page=1;
 for(let i=1;i<pages.length;i++)if(selectionPos>=pages[i])page=i+1;
 return page;
}

/** Rename the page containing the caret by editing only its boundary node. */
export function renameCurrentPage(doc:PMNode,selectionPos:number,label:string):{pos:number;label:string}|undefined{
 const pages=notePagePositions(doc);
 const current=noteCurrentPage(doc,selectionPos);
 if(current<=1)return undefined; // First page has no break node.
 const pos=pages[current-1]-1;
 if(doc.nodeAt(pos)?.type.name!=="wavePageBreak")return undefined;
 return {pos,label:label.trim().slice(0,80)};
}
