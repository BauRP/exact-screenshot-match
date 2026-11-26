/** Small, pure command matching for the editor's slash palette.
 * Search covers localized labels and stable command IDs. The editor
 * remains offline and no text typed into a note is sent anywhere. */
export type SlashCommand={id:string;label:string;keywords?:readonly string[]};
/** Slash commands can follow existing text. Only the slash segment itself
 * is removed, keeping earlier text and marks untouched. URLs like a/b
 * or https:// are not parsed as editor commands. */
export function slashCommandAtCaret(textBefore:string):{query:string;length:number}|null{
 const match=/(?:^|\s)(\/([\p{L}\p{N} -]{0,40}))$/u.exec(textBefore);
 return match?{query:match[2],length:match[1].length}:null;
}
const normalizeTerm=(value:string)=>value.normalize("NFKC").toLocaleLowerCase().replace(/ё/g,"е");
export function matchingSlashCommands<T extends SlashCommand>(
 commands:readonly T[], query:string
):T[]{
 const phrase=normalizeTerm(query.trim());
 if(phrase.length>40)return [];
 if(!phrase)return [...commands];
 const words=phrase.split(/\s+/);
 return commands.map((item,index)=>{
  const fields=[item.label,item.id,...(item.keywords??[])].map(value=>normalizeTerm(value));
  if(!words.every(word=>fields.some(field=>field.includes(word))))return null;
  const rank=fields.some(field=>field===phrase)?0:
   fields.some(field=>field.startsWith(phrase))?1:
   fields.some(field=>field.split(/\s+/).some(token=>token.startsWith(phrase)))?2:3;
  return {item,index,rank};
 }).filter((match):match is {item:T;index:number;rank:number}=>match!==null)
  .sort((a,b)=>a.rank-b.rank||a.index-b.index)
  .map(match=>match.item);
}
/** Existing page break + empty paragraph, repeated atomically by one
 * Tiptap insertContent chain. No page is created until user confirms. */
export function slashBlankPages(count:3|5):Array<{type:string}>{
 if(count!==3&&count!==5)throw Error("Поддерживаются только 3 или 5 страниц");
 return Array.from({length:count},()=>[{type:"wavePageBreak"},{type:"paragraph"}]).flat();
}
/** An editable outer section with a genuine nested child, not indented
 * plain text. Saved as existing WaveFold nodes and remains offline. */
export function slashNestedSection(){
 return {type:"waveFold",attrs:{title:"Новый раздел",collapsed:false},content:[
  {type:"paragraph"},
  {type:"waveFold",attrs:{title:"Вложенный раздел",collapsed:false},content:[{type:"paragraph"}]}
 ]};
}
export function nextSlashIndex(length:number,current:number,direction:-1|1):number{
 if(!Number.isSafeInteger(length)||length<=0)return 0;
 return ((current+direction)%length+length)%length;
}
