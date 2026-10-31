import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export type NoteSearchState={query:string;active:number;caseSensitive:boolean};
export type FoundWord={from:number;to:number};
export const noteSearchKey=new PluginKey<NoteSearchState>("wave-in-note-search");
const EMPTY:NoteSearchState={query:"",active:0,caseSensitive:false};
export function findWords(doc:PMNode,query:string,caseSensitive=false):FoundWord[]{
 if(!query||query.length>100)return [];
 const matches:FoundWord[]=[];
 const needle=caseSensitive?query:query.toLowerCase();
 doc.descendants((node,pos)=>{
  if(!node.isTextblock||matches.length>=200)return;
  let text="";const offsets:number[]=[];
  node.forEach((child,offset)=>{
   if(child.isText){const part=child.text||"";text+=part;for(let i=0;i<part.length;i++)offsets.push(pos+offset+1+i);}
   else {text+="\uFFFC";offsets.push(pos+offset+1);}
  });
  const haystack=caseSensitive?text:text.toLowerCase();
  let from=0;
  while(from<haystack.length&&matches.length<200){
   const at=haystack.indexOf(needle,from);if(at<0)break;
   const start=offsets[at],end=offsets[at+needle.length-1];
   if(start!==undefined&&end!==undefined)matches.push({from:start,to:end+1});
   from=at+Math.max(needle.length,1);
  }
 });
 return matches;
}
export const InNoteSearch=Extension.create({
 name:"waveInNoteSearch",
 addProseMirrorPlugins(){
  return [new Plugin<NoteSearchState>({
   key:noteSearchKey,
   state:{init:()=>EMPTY,apply(tr,old){return {...old,...(tr.getMeta(noteSearchKey)||{})};}},
   props:{decorations(state){
    const q=noteSearchKey.getState(state)||EMPTY;
    if(!q.query)return DecorationSet.empty;
    const matches=findWords(state.doc,q.query,q.caseSensitive);
    return DecorationSet.create(state.doc,matches.map((m,i)=>Decoration.inline(m.from,m.to,{class:i===q.active?"wave-find-hit wave-find-current":"wave-find-hit"})));
   }},
  })];
 },
});
