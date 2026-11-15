/** Read-only summary of saved checklist blocks; does not alter the note HTML. */
export type ChecklistSummary={total:number;done:number;pending:number};
export function checklistSummary(html:string):ChecklistSummary{
 let total=0,done=0;
 // Quoted attribute values can contain ">" (e.g. a pasted title). Never
 // truncate the opening tag and lose its actual task/completion attributes.
 const pattern=/<(?:div|li)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
 let match:RegExpExecArray|null;
 while((match=pattern.exec(html))!==null){
  const attrs=new Map<string,string>();
  // Parse each complete attribute so a fake data-type inside title="..."
  // cannot turn an unrelated block into a checklist row.
  const attr=/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\u0060]+))/g;
  for(const item of match[1].matchAll(attr))
   attrs.set(item[1].toLowerCase(),item[2]??item[3]??item[4]??"");
  if(!["wave-check-item","taskitem"].includes((attrs.get("data-type")||"").toLowerCase()))continue;
  total++;
  if(attrs.get("data-done")==="true"||attrs.get("data-checked")==="true")done++;
  if(total>=10000)break;
 }
 return {total,done,pending:total-done};
}
