/** Read-only summary of saved checklist blocks; does not alter the note HTML. */
export type ChecklistSummary={total:number;done:number;pending:number};
export function checklistSummary(html:string):ChecklistSummary{
 let total=0,done=0;
 const pattern=/<(?:div|li)\b([^>]{0,1000})>/gi;
 let match:RegExpExecArray|null;
 while((match=pattern.exec(html))!==null){
  const attrs=match[1];
  if(!/\bdata-type\s*=\s*(?:"wave-check-item"|'wave-check-item'|"taskItem"|'taskItem')/i.test(attrs))continue;
  total++;
  if(/\bdata-done\s*=\s*(?:"true"|'true')/i.test(attrs)||/\bdata-checked\s*=\s*(?:"true"|'true')/i.test(attrs))done++;
  if(total>=10000)break;
 }
 return {total,done,pending:total-done};
}
