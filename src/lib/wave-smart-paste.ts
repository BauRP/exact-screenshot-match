/** Safe offline import of formatted HTML from browsers and other apps.
 * The clipboard is untrusted; never load remote images or execute embeds.
 * Tiptap will parse the returned small allowlisted HTML into editor nodes. */
const allowed=new Set(["P","DIV","BR","H1","H2","H3","H4","H5","H6","UL","OL","LI","TABLE","THEAD","TBODY","TFOOT","TR","TH","TD","BLOCKQUOTE","STRONG","B","EM","I","U","S","DEL","CODE","PRE","A","SPAN","HR"]);
const forbidden=new Set(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","FORM","INPUT","META","LINK","SVG","MATH","VIDEO","AUDIO","NOSCRIPT","TEMPLATE","BUTTON","SELECT","TEXTAREA"]);
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
  if(tag==="OL"&&/^\d{1,5}$/.test(element.getAttribute("start")||""))out.setAttribute("start",element.getAttribute("start")!);
 if(tag==="TH"||tag==="TD"){
  for(const attr of ["rowspan","colspan"]){const raw=element.getAttribute(attr)||"";if(/^\d{1,2}$/.test(raw)&&Number(raw)>=1&&Number(raw)<=20)out.setAttribute(attr,raw);}
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


/** Convert a clearly formatted multi-line clipboard list into editable
 * TipTap list blocks. Ordinary text (including a single dash or numbered
 * paragraph) remains untouched. No HTML from the clipboard is interpreted. */
export function structuredPlainClipboardHtml(input:string):string{
 if(typeof input!=="string"||input.length>20_000)return "";
 const lines=input.replace(/\r\n?/g,"\n").trim().split("\n");
 if(lines.length<2||lines.length>100||lines.some(line=>!line.trim()))return "";
 const checkbox=/^\s{0,3}[-*•–]\s+\[([ xX])\]\s+(.+)$/;
 const checkboxItems=lines.map(line=>checkbox.exec(line));
 const bullet=/^\s{0,3}[-*•–]\s+(.+)$/;
 const numbered=/^\s{0,3}(\d{1,5})[.)]\s+(.+)$/;
 const bulletItems=lines.map(line=>bullet.exec(line));
 const numberedItems=lines.map(line=>numbered.exec(line));
 const isCheckbox=checkboxItems.every(Boolean);
 const isBulleted=bulletItems.every(Boolean)&&!checkboxItems.some(Boolean);
 const isNumbered=numberedItems.every(Boolean);
 if(!isCheckbox&&!isBulleted&&!isNumbered)return "";
 const escape=(text:string)=>text.replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
 if(isCheckbox)return checkboxItems.map(m=>
  '<div data-type="wave-check-item" data-done="'+(m![1].toLowerCase()==="x"?"true":"false")+
  '" data-shape="square">'+escape(m![2].trim())+'</div>').join("");
 if(isNumbered){
  const sequence=numberedItems.map(m=>Number(m![1]));
  // Never silently replace intentional numbering (e.g. 1, 3, 8).
  if(sequence.some((number,i)=>i>0&&number!==sequence[i-1]+1))return "";
 }
 const values=(isBulleted?bulletItems:numberedItems).map(m=>escape((m?.[isBulleted?1:2]||"").trim()));
 const list=values.map(v=>"<li><p>"+v+"</p></li>").join("");
 if(isBulleted)return "<ul>"+list+"</ul>";
 const start=Number(numberedItems[0]?.[1]||1);
 return "<ol"+(start!==1?' start="'+start+'"':"")+">"+list+"</ol>";
}
