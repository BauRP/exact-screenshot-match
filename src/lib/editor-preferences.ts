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
};
const KEY="wave.editor.preferences.v1";
export const EDITOR_PREFS_CHANGED="wave-editor-preferences-changed";
const ALL=new Set<string>(TOOLBAR_TOOLS.map(tool=>tool.id));
const DEFAULT:EditorPreferences={spellcheck:true,caseSensitive:false,hiddenToolbar:[]};
export function validHiddenToolbar(input:unknown):EditorTool[]{
 if(!Array.isArray(input))return [];
 return [...new Set(input.filter((id):id is EditorTool=>typeof id==="string"&&ALL.has(id)))];
}
export function readEditorPreferences():EditorPreferences{
 if(typeof window==="undefined")return {...DEFAULT,hiddenToolbar:[]};
 try{
  const raw=JSON.parse(window.localStorage.getItem(KEY)||"null");
  return {
   spellcheck:typeof raw?.spellcheck==="boolean"?raw.spellcheck:true,
   caseSensitive:typeof raw?.caseSensitive==="boolean"?raw.caseSensitive:false,
   hiddenToolbar:validHiddenToolbar(raw?.hiddenToolbar),
  };
 }catch{return {...DEFAULT,hiddenToolbar:[]};}
}
export function saveEditorPreferences(patch:Partial<EditorPreferences>):EditorPreferences{
 const base=readEditorPreferences();
 const next:EditorPreferences={
  spellcheck:typeof patch.spellcheck==="boolean"?patch.spellcheck:base.spellcheck,
  caseSensitive:typeof patch.caseSensitive==="boolean"?patch.caseSensitive:base.caseSensitive,
  hiddenToolbar:patch.hiddenToolbar===undefined?base.hiddenToolbar:validHiddenToolbar(patch.hiddenToolbar),
 };
 if(typeof window!=="undefined"){
  window.localStorage.setItem(KEY,JSON.stringify(next));
  window.dispatchEvent(new Event(EDITOR_PREFS_CHANGED));
 }
 return next;
}
