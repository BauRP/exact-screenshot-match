import type {Node as PMNode} from "@tiptap/pm/model";
export type OutlineItem={pos:number;depth:number;title:string;type:"heading"|"fold"};
/** Scan a note without mutating any document nodes or cursor selection. */
export function collectNoteOutline(doc:PMNode):OutlineItem[]{
 const items:OutlineItem[]=[];
 doc.descendants((node,pos)=>{
  if(node.type.name==="heading"){
   const title=node.textContent.trim();
   if(title)items.push({pos,depth:Math.max(1,Math.min(6,Number(node.attrs.level)||2)),title:title.slice(0,140),type:"heading"});
  }
  if(node.type.name==="waveFold"){
   items.push({pos,depth:2,title:String(node.attrs.title||"Раздел").slice(0,140),type:"fold"});
  }
 });
 return items;
}
