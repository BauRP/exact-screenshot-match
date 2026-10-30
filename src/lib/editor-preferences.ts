/** App-wide editor controls, never per-note formatting. */
export type EditorPreferences={spellcheck:boolean;caseSensitive:boolean};
const DEFAULT:EditorPreferences={spellcheck:true,caseSensitive:false};
const KEY="wave.editor.preferences.v1";
export function readEditorPreferences():EditorPreferences{
 if(typeof window==="undefined")return {...DEFAULT};
 try{const p=JSON.parse(window.localStorage.getItem(KEY)||"null");return {spellcheck:typeof p?.spellcheck==="boolean"?p.spellcheck:true,caseSensitive:typeof p?.caseSensitive==="boolean"?p.caseSensitive:false};}catch{return {...DEFAULT};}
}
export function saveEditorPreferences(patch:Partial<EditorPreferences>):EditorPreferences{
 const next={...readEditorPreferences(),...patch};
 if(typeof window!=="undefined")window.localStorage.setItem(KEY,JSON.stringify(next));
 return next;
}
