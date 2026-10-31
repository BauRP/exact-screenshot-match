import type {Note} from "./notes-store";
import {validReminderTime,reminderIsDue,reminderIsUpcoming} from "./note-reminders";
import {checklistSummary} from "./note-checklist-summary";

/**
 * Offline searches do not open the editor or alter saved notes.
 * Commands are optional shortcuts for the same filters shown in the UI.
 * @locked intentionally returns no results until protected notes exist.
 */
export type NoteSearchFilter = "all" | "todo" | "images" | "locked" | "reminders" | "overdue" | "pending" | "upcoming" | "audio" | "drawings" | "pages" | "pinned";
export type ParsedNoteQuery = {query:string;filter:NoteSearchFilter};
export function parseNoteQuery(input:string, selected:NoteSearchFilter="all"):ParsedNoteQuery {
  const trimmed=input.trim();
  const match=/^@(todo|images|locked|reminders|overdue|pending|upcoming|audio|drawings|pages|pinned)(?:\s+|$)/i.exec(trimmed);
  return {filter:match?match[1].toLowerCase() as NoteSearchFilter:selected,
    query:match?trimmed.slice(match[0].length).trim():trimmed};
}
/** Remove Tape-marked spans (and all nested markup) from previews.
 * A single regex would stop at the first inner </span> and reveal the rest.
 * This scanner is pure and also runs in the Node-based CI tests. */
export function concealTapeHtml(html:string):string{
 const tag=/<\\/?span\\b[^>]*>/gi;
 let out="",last=0,hiddenDepth=0;
 const spans:boolean[]=[];
 for(const match of html.matchAll(tag)){
  const at=match.index,token=match[0];
  if(hiddenDepth===0)out+=html.slice(last,at);
  if(/^<\\/span/i.test(token)){
   const hidden=spans.pop()===true;
   if(hidden)hiddenDepth=Math.max(0,hiddenDepth-1);
   else if(hiddenDepth===0)out+=token;
  }else{
   const hidden=hiddenDepth>0||/\\bdata-wave-tape(?:\\s|=|>)/i.test(token);
   if(hidden&&hiddenDepth===0)out+=" [Скрытый ответ] ";
   spans.push(hidden);
   if(hidden)hiddenDepth++;
   else out+=token;
  }
  last=at+token.length;
 }
 if(hiddenDepth===0)out+=html.slice(last);
 return out;
}
export function readableText(html:string):string {
  // Do not reveal deliberately concealed Tape answers in list previews/search.
  return concealTapeHtml(html)
    .replace(/<[^>]+>/g," ").replace(/&(?:nbsp|#160);/gi," ")
    .replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
    .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g," ");
}
/** Script-friendly Russian/Kazakh lookup. Do not modify saved note spelling. */
export function normalizeSearchText(value:string):string {
 return value.normalize("NFKC").toLocaleLowerCase().replace(/ё/g,"е")
  .replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
}
export function noteSearchSnippet(note:Note,query:string,maxLength=155):string {
 const source=readableText(note.body||"").trim();
 if(!source)return "";
 const normalized=normalizeSearchText(source),needle=normalizeSearchText(parseNoteQuery(query).query);
 const match=needle?normalized.indexOf(needle):-1;
 const offset=match<0?0:Math.max(0,match-40);
 const fragment=source.slice(offset,offset+Math.max(30,maxLength));
 return (offset?"…":"")+fragment+(offset+fragment.length<source.length?"…":"");
}
export function noteMatchesSearch(note:Note,input:string,selected:NoteSearchFilter="all"):boolean {
  const {query,filter}=parseNoteQuery(input,selected);
  const body=note.body||"";
  if(filter==="locked")return false; // Lock flags do not exist yet.
  if(filter==="pinned"&&!note.pinned)return false;
  if(filter==="audio"&&!/(?:data-audio-note|audiodb:)/i.test(body))return false;
  if(filter==="drawings"&&!/(?:data-wave-drawing|data-ink=["'][^"']{5,})/i.test(body))return false;
  if(filter==="pages"&&!/data-wave-page-break/i.test(body))return false;
  if(filter==="reminders"&&validReminderTime(note.reminderAt)===undefined)return false;
  if(filter==="overdue"&&!reminderIsDue(note.reminderAt))return false;
  if(filter==="upcoming"&&!reminderIsUpcoming(note.reminderAt))return false;
  if(filter==="images"&&!/<img\b|data-type=["']image|data-wave-image/i.test(body))return false;
  if(filter==="pending"&&checklistSummary(body).pending===0)return false;
  if(filter==="todo"&&!/data-type=["']wave-check-item|<ul\b[^>]*data-type=["']taskList|data-type=["']taskItem/i.test(body))return false;
  if(!query)return true;
  const haystack=normalizeSearchText(note.title+" "+readableText(body));
  const tokens=normalizeSearchText(query).split(" ").filter(Boolean);
  return tokens.every(token=>haystack.includes(token));
}
