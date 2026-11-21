/** Exact binary-attachment references in serialized note HTML.
 *
 * Replacing a bare string such as "audiodb:a" corrupts "audiodb:a-long",
 * ordinary note text, and quoted examples. Only actual markup attributes
 * participate. Keep the original HTML bytes (including hidden Tape marks,
 * paragraph formatting and attribute quotation) otherwise untouched.
 *
 * Do not use DOMParser/innerHTML: rebuilding editor HTML can lose marks and
 * private metadata. Only genuine opening tags are inspected, including tags
 * whose quoted attribute contains a ">" character.
 */
const HTML_TOKEN=/<!--[\s\S]*?-->|<[a-z][a-z0-9:-]*\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
const ATTRIBUTE=/([^\s"'<>\/=]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\u0060]+))/g;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const AUDIO=/^audiodb:([A-Za-z0-9_-]{1,128})$/;
type Kind="audio"|"image";

function attributeKind(name:string,value:string):{kind:Kind;id:string}|null{
 const lower=name.toLowerCase();
 if(lower==="data-image-id"&&ID.test(value))return {kind:"image",id:value};
 if(lower==="src"||lower==="data-audio"||lower==="data-src"){
  const match=AUDIO.exec(value);
  if(match)return {kind:"audio",id:match[1]};
 }
 return null;
}
function transformAttributes(
 html:string, transform:(name:string,value:string)=>string|undefined,
):string{
 return html.replace(HTML_TOKEN, tag=>tag.startsWith("<!--")?tag:tag.replace(ATTRIBUTE,(original,name:string,equals:string,
  doubleQuoted:string|undefined,singleQuoted:string|undefined,bare:string|undefined)=>{
  const value=doubleQuoted??singleQuoted??bare;
  if(value===undefined)return original;
  const next=transform(name,value);
  if(next===undefined||next===value)return original;
  if(doubleQuoted!==undefined)return name+equals+'"'+next+'"';
  if(singleQuoted!==undefined)return name+equals+"'"+next+"'";
  return name+equals+next;
 }));
}

/** Each attachment is collected only when used in an actual markup field. */
export function noteAttachmentIds(html:string):{audio:string[];image:string[]}{
 const audio=new Set<string>(),image=new Set<string>();
 transformAttributes(html,(name,value)=>{
  const ref=attributeKind(name,value);
  if(ref)(ref.kind==="audio"?audio:image).add(ref.id);
  return undefined;
 });
 return {audio:[...audio],image:[...image]};
}

/** One atomic pass: short IDs cannot corrupt long IDs, and newly generated
 * IDs cannot get rewritten again if they overlap an incoming identifier. */
export function rewriteNoteAttachmentIds(
 html:string,audio:ReadonlyMap<string,string>,image:ReadonlyMap<string,string>,
):string{
 return transformAttributes(html,(name,value)=>{
  const ref=attributeKind(name,value);
  if(!ref)return undefined;
  const replacement=(ref.kind==="audio"?audio:image).get(ref.id);
  if(replacement===undefined)return undefined;
  if(!ID.test(replacement))throw new Error("Недопустимый ID восстановленного вложения");
  return ref.kind==="audio"?"audiodb:"+replacement:replacement;
 });
}
