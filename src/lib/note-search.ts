import type {Note} from "./notes-store";
import {validReminderTime,reminderIsDue,reminderIsUpcoming} from "./note-reminders";
import {checklistSummary} from "./note-checklist-summary";

/**
 * Offline searches do not open the editor or alter saved notes.
 * Commands are optional shortcuts for the same filters shown in the UI.
 * @locked intentionally returns no results until protected notes exist.
 */
export type NoteSearchFilter = "all" | "todo" | "images" | "locked" | "reminders" | "overdue" | "pending" | "upcoming";
export type ParsedNoteQuery = {query:string;filter:NoteSearchFilter};
export function parseNoteQuery(input:string, selected:NoteSearchFilter="all"):ParsedNoteQuery {
  const trimmed=input.trim();
  const match=/^@(todo|images|locked|reminders|overdue|pending|upcoming)(?:\s+|$)/i.exec(trimmed);
  return {filter:match?match[1].toLowerCase() as NoteSearchFilter:selected,
    query:match?trimmed.slice(match[0].length).trim():trimmed};
}
function readableText(html:string):string {
  return html.replace(/<[^>]+>/g," ").replace(/&(?:nbsp|#160);/gi," ")
    .replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
    .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g," ");
}
export function noteMatchesSearch(note:Note,input:string,selected:NoteSearchFilter="all"):boolean {
  const {query,filter}=parseNoteQuery(input,selected);
  const body=note.body||"";
  if(filter==="locked")return false; // Lock flags do not exist yet.
  if(filter==="reminders"&&validReminderTime(note.reminderAt)===undefined)return false;
  if(filter==="overdue"&&!reminderIsDue(note.reminderAt))return false;
  if(filter==="upcoming"&&!reminderIsUpcoming(note.reminderAt))return false;
  if(filter==="images"&&!/<img\b|data-type=["']image|data-wave-image/i.test(body))return false;
  if(filter==="pending"&&checklistSummary(body).pending===0)return false;
  if(filter==="todo"&&!/data-type=["']wave-check-item|<ul\b[^>]*data-type=["']taskList|data-type=["']taskItem/i.test(body))return false;
  if(!query)return true;
  return (note.title+" "+readableText(body)).toLocaleLowerCase().includes(query.toLocaleLowerCase());
}
