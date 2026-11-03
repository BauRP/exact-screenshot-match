/** Editor-wide display controls. Content changes remain per-note. */
export const TOOLBAR_TOOLS=[
 {id:"audio",label:"Микрофон"},
 {id:"drawing",label:"Рисование"},
 {id:"camera",label:"Камера"},
 {id:"gallery",label:"Галерея"},
 {id:"outline",label:"Оглавление"},
 {id:"search",label:"Поиск"},
 {id:"checklist",label:"Списки дел"},
 {id:"insert",label:"Вставка блоков"},
] as const;
export type EditorTool=(typeof TOOLBAR_TOOLS)[number]["id"];
export type EditorPreferences={
 spellcheck:boolean;
 caseSensitive:boolean;
 hiddenToolbar:EditorTool[];
 toolbarOrder:EditorTool[];
};
const KEY="wave.editor.preferences.v1";
export const EDITOR_PREFS_CHANGED="wave-editor-preferences-changed";
const ALL=new Set<string>(TOOLBAR_TOOLS.map(tool=>tool.id));
const DEFAULT:EditorPreferences={spellcheck:true,caseSensitive:false,hiddenToolbar:[],toolbarOrder:TOOLBAR_TOOLS.map(tool=>tool.id)};
export function validHiddenToolbar(input:unknown):EditorTool[]{
 if(!Array.isArray(input))return [];
 return [...new Set(input.filter((id):id is EditorTool=>typeof id==="string"&&ALL.has(id)))];
}
/** Persist a full permutation of known controls. Old settings can omit
 * toolbarOrder: unknown IDs are discarded and new tools added at the end. */
export function validToolbarOrder(input:unknown):EditorTool[]{
 const supplied=Array.isArray(input)?input:[];
 const unique=validHiddenToolbar(supplied);
 return [...unique,...TOOLBAR_TOOLS.map(tool=>tool.id).filter(id=>!unique.includes(id))];
}
export function moveToolbarTool(order:readonly EditorTool[],tool:EditorTool,direction:"up"|"down"):EditorTool[]{
 const next=validToolbarOrder(order),index=next.indexOf(tool);
 const target=index+(direction==="up"?-1:1);
 if(index<0||target<0||target>=next.length)return next;
 [next[index],next[target]]=[next[target],next[index]];
 return next;
}
export function readEditorPreferences():EditorPreferences{
 if(typeof window==="undefined")return {...DEFAULT,hiddenToolbar:[],toolbarOrder:validToolbarOrder(null)};
 try{
  const raw=JSON.parse(window.localStorage.getItem(KEY)||"null");
  return {
   spellcheck:typeof raw?.spellcheck==="boolean"?raw.spellcheck:true,
   caseSensitive:typeof raw?.caseSensitive==="boolean"?raw.caseSensitive:false,
   hiddenToolbar:validHiddenToolbar(raw?.hiddenToolbar),
   toolbarOrder:validToolbarOrder(raw?.toolbarOrder),
  };
 }catch{return {...DEFAULT,hiddenToolbar:[],toolbarOrder:validToolbarOrder(null)};}
}
export function saveEditorPreferences(patch:Partial<EditorPreferences>):EditorPreferences{
 const base=readEditorPreferences();
 const next:EditorPreferences={
  spellcheck:typeof patch.spellcheck==="boolean"?patch.spellcheck:base.spellcheck,
  caseSensitive:typeof patch.caseSensitive==="boolean"?patch.caseSensitive:base.caseSensitive,
  hiddenToolbar:patch.hiddenToolbar===undefined?base.hiddenToolbar:validHiddenToolbar(patch.hiddenToolbar),
  toolbarOrder:patch.toolbarOrder===undefined?base.toolbarOrder:validToolbarOrder(patch.toolbarOrder),
 };
 if(typeof window!=="undefined"){
  window.localStorage.setItem(KEY,JSON.stringify(next));
  window.dispatchEvent(new Event(EDITOR_PREFS_CHANGED));
 }
 return next;
}

/** One-tap professional toolbar layouts, stored by the existing preferences
 * system. They change controls only, not note content or spelling settings. */
export function toolbarPreset(mode:"writing"|"media"|"all"):Pick<EditorPreferences,"hiddenToolbar"|"toolbarOrder">{
 const all=TOOLBAR_TOOLS.map(tool=>tool.id);
 if(mode==="writing")return {
  hiddenToolbar:["audio","drawing","camera","gallery"],
  toolbarOrder:validToolbarOrder(["search","outline","checklist","insert","audio","drawing","camera","gallery"]),
 };
 if(mode==="media")return {
  hiddenToolbar:[],
  toolbarOrder:validToolbarOrder(["camera","gallery","drawing","audio","insert","search","outline","checklist"]),
 };
 return {hiddenToolbar:[],toolbarOrder:all};
}
