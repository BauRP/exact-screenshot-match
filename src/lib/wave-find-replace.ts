import type {Editor} from "@tiptap/react";
import {findWords} from "./in-note-search";

/** Replace one match, preserving surrounding paragraphs and marks. */
export function replaceOneInNote(editor:Editor,query:string,replacement:string,index:number,caseSensitive=false):boolean{
 if(!editor.isEditable||editor.isDestroyed||!query||replacement.length>500)return false;
 const hits=findWords(editor.state.doc,query,caseSensitive);
 const hit=hits[index];if(!hit)return false;
 editor.view.dispatch(editor.state.tr.insertText(replacement,hit.from,hit.to).scrollIntoView());
 return true;
}
/** Reverse-order replacements preserve original positions, and one transaction
 * means Undo reverts the entire batch. Capped at findWords's 200 matches. */
export function replaceAllInNote(editor:Editor,query:string,replacement:string,caseSensitive=false):number{
 if(!editor.isEditable||editor.isDestroyed||!query||replacement.length>500)return 0;
 const hits=findWords(editor.state.doc,query,caseSensitive);
 if(!hits.length)return 0;
 const tr=editor.state.tr;
 for(let i=hits.length-1;i>=0;i--)tr.insertText(replacement,hits[i].from,hits[i].to);
 editor.view.dispatch(tr.scrollIntoView());
 return hits.length;
}
