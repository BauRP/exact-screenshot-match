/** Safe offline import of formatted HTML from browsers and other apps.
 * The clipboard is untrusted; never load remote images or execute embeds.
 * Tiptap will parse the returned small allowlisted HTML into editor nodes. */
const allowed=new Set(["P","DIV","BR","H1","H2","H3","H4","H5","H6","UL","OL","LI","BLOCKQUOTE","STRONG","B","EM","I","U","S","DEL","CODE","PRE","A","SPAN","HR"]);
const forbidden=new Set(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","FORM","INPUT","META","LINK","SVG","MATH","VIDEO","AUDIO","NOSCRIPT"]);
const textBlock=new Set(["P","DIV","H1","H2","H3","H4","H5","H6","BLOCKQUOTE","PRE"]);
export const MAX_PASTE_HTML=250_000;

export function safeBrowserClipboardHtml(html:string):string{
 if(typeof html!=="string"||!html.trim()||html.length>MAX_PASTE_HTML)return "";
 const source=new DOMParser().parseFromString(html,"text/html");
 const target=document.implementation.createHTMLDocument("Wave Notes clipboard");
 const clean=(node:Node):Node=>{
  if(node.nodeType===Node.TEXT_NODE)return target.createTextNode(node.textContent||"");
  if(node.nodeType!==Node.ELEMENT_NODE)return target.createDocumentFragment();
  const element=node as HTMLElement,tag=element.tagName;
  if(forbidden.has(tag))return target.createDocumentFragment();
  if(tag==="IMG" || tag==="PICTURE" || tag==="SOURCE"){
   return target.createTextNode(tag==="IMG"?"[Внешнее изображение не вставлено]":"");
  }
  if(!allowed.has(tag)){
   const group=target.createDocumentFragment();
   Array.from(element.childNodes).forEach(child=>group.appendChild(clean(child)));
   return group;
  }
  const out=target.createElement(tag.toLowerCase());
  if(tag==="A"){
   const href=element.getAttribute("href")||"";
   try{
    const url=new URL(href);
    if(url.protocol==="http:"||url.protocol==="https:")out.setAttribute("href",url.href);
   }catch{/* Unsafe or relative links become plain text. */}
  }
  if(textBlock.has(tag)){
   const align=element.style.textAlign;
   if(["left","right","center","justify"].includes(align))out.style.textAlign=align;
   if(element.getAttribute("dir")==="rtl")out.setAttribute("dir","rtl");
  }
  if(tag==="SPAN"){
   const ink=element.style.color;
   if(/^#[0-9a-f]{6}$/i.test(ink))out.style.color=ink;
  }
  Array.from(element.childNodes).forEach(child=>out.appendChild(clean(child)));
  return out;
 };
 const root=target.createElement("div");
 Array.from(source.body.childNodes).forEach(child=>root.appendChild(clean(child)));
 return root.innerHTML;
}
