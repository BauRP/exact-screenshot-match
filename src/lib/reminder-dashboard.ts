import type {Note} from "./notes-store";
import {reminderIsDue,reminderIsUpcoming} from "./note-reminders";

/** One stable offline snapshot for the home reminder panels. The folder
 * subtree was resolved once by the caller, not for every note. No mutation,
 * storage write, or notification scheduling occurs in this view model. */
export function reminderHomePreview(
 notes:readonly Note[],folderScope:ReadonlySet<string>|"all",now=Date.now(),limit=3
):{overdue:Note[];upcoming:Note[]}{
 const inScope=(note:Note)=>folderScope==="all"||folderScope.has(note.folderId??"all");
 const count=Number.isSafeInteger(limit)?Math.max(0,Math.min(10,limit)):3;
 const byTime=(a:Note,b:Note)=>(a.reminderAt??0)-(b.reminderAt??0)||a.id.localeCompare(b.id);
 const scoped=notes.filter(inScope);
 return {
  overdue:scoped.filter(n=>reminderIsDue(n.reminderAt,now)).sort(byTime).slice(0,count),
  upcoming:scoped.filter(n=>reminderIsUpcoming(n.reminderAt,7,now)).sort(byTime).slice(0,count)
 };
}
