import type { Note } from "./notes-store";

/**
 * A returned .wnote has the same originId as the sender's original.
 * Exact original ID has priority over older received copies.
 * Never guess a match from titles: they are editable and non-unique.
 */
export function findReturnedOriginal(
 notes: readonly Note[], originId: string, kind: "note" | "pdf",
): Note | undefined {
 if(!/^[\w-]{1,128}$/.test(originId))return undefined;
 return notes.find(n=>n.id===originId&& (n.kind??"note")===kind) ??
  notes.find(n=>n.originId===originId&& (n.kind??"note")===kind);
}

/**
 * A reversible, two-version copy. Leave both source notes unchanged.
 * Block structure and original HTML are retained, including audio references,
 * text styles, checklists, callouts and links.
 */
export function combineReturnedBodies(local: Note, received: Note): string {
 if(local.kind==="pdf"||received.kind==="pdf"){
  throw new Error("Объединение PDF пока не поддерживается: сохраните отдельную копию");
 }
 if(local.body===received.body)return local.body;
 return "<h2>Моя версия</h2>"+local.body+
  "<hr><h2>Полученная версия</h2>"+received.body;
}

/** User-visible safety copy before replacing an existing text note. */
export function replacementBackup(source: Note, id: string): Partial<Note> {
 if(source.kind==="pdf")throw new Error("Заменять PDF таким способом нельзя");
 const now=Date.now();
 return {
  ...source,id,title:source.title+" — до замены",
  originId:source.originId??source.id,
  pinned:false,manualOrder:undefined,createdAt:now,updatedAt:now,
 };
}
