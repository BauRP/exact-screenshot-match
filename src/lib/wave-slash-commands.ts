/** Small, pure command matching for the editor's slash palette.
 * Search covers localized labels and stable command IDs. The editor
 * remains offline and no text typed into a note is sent anywhere. */
export type SlashCommand={id:string;label:string};
export function matchingSlashCommands<T extends SlashCommand>(
 commands:readonly T[], query:string
):T[]{
 const phrase=query.trim().normalize("NFKC").toLocaleLowerCase();
 if(phrase.length>40)return [];
 if(!phrase)return [...commands];
 const words=phrase.split(/\s+/);
 return commands.filter(item=>{
  const search=(item.label+" "+item.id).normalize("NFKC").toLocaleLowerCase();
  return words.every(word=>search.includes(word));
 });
}
export function nextSlashIndex(length:number,current:number,direction:-1|1):number{
 if(!Number.isSafeInteger(length)||length<=0)return 0;
 return ((current+direction)%length+length)%length;
}
