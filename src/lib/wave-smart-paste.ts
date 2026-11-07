/** Safe offline import of formatted HTML from browsers and other apps.
 * The clipboard is untrusted; never load remote images or execute embeds.
 * Tiptap will parse the returned small allowlisted HTML into editor nodes. */
import {directionForText} from "./wave-text-direction";
/** Only explicit RTL text needs a direction attribute. The editor retains
 * its existing defaults for Latin, Cyrillic, Kazakh, Japanese and Chinese. */
export function clipboardRtlAttribute(value:string):string{
 return directionForText(value)==="rtl"?' dir="rtl"':"";
}
const allowed=new Set(["P","DIV","BR","H1","H2","H3","H4","H5","H6","UL","OL","LI","TABLE","THEAD","TBODY","TFOOT","TR","TH","TD","BLOCKQUOTE","STRONG","B","EM","I","U","S","DEL","CODE","PRE","A","SPAN","HR","SECTION","ASIDE"]);
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
  // Preserve only the built-in Wave Notes structures. An arbitrary browser
  // clipboard never gets to carry event handlers, URLs, styles or IDs through.
  if(tag==="DIV"&&element.hasAttribute("data-wave-page-break")){
   const page=target.createElement("div");
   page.setAttribute("data-wave-page-break","true");
   page.setAttribute("data-page-label",(element.getAttribute("data-page-label")||"").slice(0,80));
   return page; // Page breaks are atomic: no imported children.
  }
  if(tag==="DIV"&&element.getAttribute("data-type")==="wave-check-item"){
   out.setAttribute("data-type","wave-check-item");
   out.setAttribute("data-done",element.getAttribute("data-done")==="true"?"true":"false");
   const shape=element.getAttribute("data-shape")||"";
   out.setAttribute("data-shape",["square","circle","diamond","check"].includes(shape)?shape:"square");
   if(element.getAttribute("dir")==="rtl")out.setAttribute("dir","rtl");
  }
  if(tag==="SECTION"&&element.hasAttribute("data-wave-fold")){
   out.setAttribute("data-wave-fold","true");
   out.setAttribute("data-title",(element.getAttribute("data-title")||"Раздел").slice(0,100));
   out.setAttribute("data-collapsed",element.getAttribute("data-collapsed")==="true"?"true":"false");
  }
  if(tag==="ASIDE"&&element.hasAttribute("data-wave-callout")){
   out.setAttribute("data-wave-callout","true");
   const kind=element.getAttribute("data-kind")||"";
   out.setAttribute("data-kind",["important","tip","warning","info"].includes(kind)?kind:"important");
  }
  if(tag==="SPAN"&&element.hasAttribute("data-wave-tape")){
   // Never make a concealed answer visible when copying within the app.
   out.setAttribute("data-wave-tape","true");
  }
  if(tag==="A"){
   const href=element.getAttribute("href")||"";
   try{
    const url=new URL(href);
    if((url.protocol==="http:"||url.protocol==="https:")&&!url.username&&!url.password&&url.href.length<=2048)out.setAttribute("href",url.href);
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
   // Preserve only safe text formatting from copied browser spans.
   const ink=element.style.color;
   if(/^#[0-9a-f]{6}$/i.test(ink))out.style.color=ink;
   const highlight=element.style.backgroundColor;
   if(/^#[0-9a-f]{6}$/i.test(highlight))out.style.backgroundColor=highlight;
   const size=element.style.fontSize;
   if(/^(?:[8-9]|[1-6][0-9]|7[0-2])px$/.test(size))out.style.fontSize=size;
   const weight=element.style.fontWeight;
   if(weight==="bold"||/^[6-9]00$/.test(weight))out.style.fontWeight="bold";
   if(element.style.fontStyle==="italic")out.style.fontStyle="italic";
   const line=element.style.textDecorationLine;
   if(line==="underline"||line==="line-through"||line==="underline line-through")
     out.style.textDecorationLine=line;
  }
  Array.from(element.childNodes).forEach(child=>out.appendChild(clean(child)));
  return out;
 };
 const root=target.createElement("div");
 Array.from(source.body.childNodes).forEach(child=>root.appendChild(clean(child)));
 return root.innerHTML;
}



/** Structured clipboard indentation is meaningful: never flatten nested list
 * items into separate top-level items or renumber explicitly numbered rows.
 * Only explicit two-space steps are accepted; ambiguous indentation falls back
 * to the user's original plain text without silently changing its meaning. */
function nestedPlainClipboardHtml(lines:readonly string[]):string {
 type Item={depth:number;kind:"ul"|"ol";number:number;text:string};
 const items:Item[]=[];
 const marker=/^( *)([-*•–]|\d{1,5}[.)]) +(.+)$/;
 for(const line of lines){
  const match=marker.exec(line);
  if(!match||match[1].length%2!==0||match[1].length>8||
     /^[-*•–] +\[[ xX]\] +/.test(line.trimStart()))return "";
  const depth=match[1].length/2;
  const kind=/^\d/.test(match[2])?"ol":"ul";
  const number=kind==="ol"?Number(match[2].slice(0,-1)):0;
  if(kind==="ol"&&(number<1||number>99999))return "";
  items.push({depth,kind,number,text:match[3].trim()});
 }
 if(items[0]?.depth!==0||!items.some(item=>item.depth>0))return "";
 const escape=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
 const stack:{kind:"ul"|"ol";next:number}[]=[];
 let html="";
 for(const item of items){
  if(item.depth>stack.length||item.depth>4)return "";
  while(stack.length>item.depth+1){
   const frame=stack.pop()!;
   html+="</li></"+frame.kind+">";
  }
  if(stack.length===item.depth+1&&stack[stack.length-1].kind!==item.kind){
   const frame=stack.pop()!;
   html+="</li></"+frame.kind+">";
  }else if(stack.length===item.depth+1){
   html+="</li>";
  }
  if(stack.length===item.depth){
   // A nested list belongs inside the immediately preceding list item.
   if(item.depth>0&&items.indexOf(item)===0)return "";
   html+="<"+item.kind+(item.kind==="ol"&&item.number!==1?' start="'+item.number+'"':"")+">";
   stack.push({kind:item.kind,next:item.number});
  }
  const frame=stack[stack.length-1];
  if(frame.kind==="ol"){
   if(item.number!==frame.next)return "";
   frame.next++;
  }
  html+="<li><p"+clipboardRtlAttribute(item.text)+">"+escape(item.text)+"</p>";
 }
 while(stack.length){
  const frame=stack.pop()!;
  html+="</li></"+frame.kind+">";
 }
 return html;
}

/** Convert a clearly formatted multi-line clipboard list into editable
 * TipTap list blocks. Ordinary text (including a single dash or numbered
 * paragraph) remains untouched. No HTML from the clipboard is interpreted. */
export function structuredPlainClipboardHtml(input:string):string{
 if(typeof input!=="string"||input.length>20_000)return "";
 const lines=input.replace(/\r\n?/g,"\n").trim().split("\n");
 if(lines.length<2||lines.length>100||lines.some(line=>!line.trim()))return "";
 // A two-space indentation step represents an actual nested list. Do not
 // quietly turn it into a flat list or strip the indentation on failure.
 if(lines.some(line=>/^ {2,}\S/.test(line)))return nestedPlainClipboardHtml(lines);
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
  '" data-shape="square"'+clipboardRtlAttribute(m![2])+'>'+escape(m![2].trim())+'</div>').join("");
 if(isNumbered){
  const sequence=numberedItems.map(m=>Number(m![1]));
  // Never silently replace intentional numbering (e.g. 1, 3, 8).
  if(sequence.some((number,i)=>i>0&&number!==sequence[i-1]+1))return "";
 }
 const values=(isBulleted?bulletItems:numberedItems).map(m=>escape((m?.[isBulleted?1:2]||"").trim()));
 const list=values.map((v,i)=>{
  const match=(isBulleted?bulletItems:numberedItems)[i];
  return "<li><p"+clipboardRtlAttribute(match?.[isBulleted?1:2]||"")+">"+v+"</p></li>";
 }).join("");
 if(isBulleted)return "<ul>"+list+"</ul>";
 const start=Number(numberedItems[0]?.[1]||1);
 return "<ol"+(start!==1?' start="'+start+'"':"")+">"+list+"</ol>";
}


/** Convert a constrained subset of Markdown inline style into safe editable
 * HTML. This runs only after Markdown block structure has been recognized.
 * No arbitrary HTML, images, inline HTML or active URL schemes are allowed. */
export function safeMarkdownInline(text:string):string{
 if(typeof text!=="string"||text.length>20_000)return "";
 const escape=(value:string)=>value.replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
 const tokens=/\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\x60([^\x60\n]+)\x60|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]\n]+)\]\((https?:\/\/[^\s)\n]+)\)/g;
 let output="",last=0,match:RegExpExecArray|null;
 while((match=tokens.exec(text))!==null){
  output+=escape(text.slice(last,match.index));
  if(match[1]!==undefined||match[2]!==undefined)output+="<strong>"+escape(match[1]??match[2])+"</strong>";
  else if(match[3]!==undefined)output+="<s>"+escape(match[3])+"</s>";
  else if(match[4]!==undefined)output+="<code>"+escape(match[4])+"</code>";
  else if(match[5]!==undefined||match[6]!==undefined)output+="<em>"+escape(match[5]??match[6])+"</em>";
  else{
   try{
    const url=new URL(match[8]);
    // Invalid clipboard URLs must never crash the editor paste handler.
    if(["http:","https:"].includes(url.protocol)&&!url.username&&!url.password)
     output+='<a href="'+escape(url.href)+'">'+escape(match[7])+"</a>";
    else output+=escape(match[0]);
   }catch{output+=escape(match[0]);}
  }
  last=tokens.lastIndex;
 }
 return output+escape(text.slice(last));
}

/** Offline, opt-in Markdown block detection for text-only clipboard content.
 * Recognizes document structure without evaluating markdown HTML, URLs or JS.
 * If the clipboard has no unambiguous block syntax, native text paste wins. */
export function structuredMarkdownClipboardHtml(input:string):string{
 if(typeof input!=="string"||input.length>20_000)return "";
 const lines=input.replace(/\r\n?/g,"\n").split("\n");
 if(lines.length<2||lines.length>120)return "";
 const safe=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
 const heading=/^\s{0,3}(#{1,4})\s+(.+?)\s*$/;
 const quote=/^\s{0,3}>\s+(.+)$/;
 const checkbox=/^\s{0,3}[-*•]\s+\[([ xX])\]\s+(.+)$/;
 const unordered=/^\s{0,3}[-*•]\s+(.+)$/;
 const ordered=/^\s{0,3}(\d{1,5})[.)]\s+(.+)$/;
 const fence=/^\s{0,3}\x60{3}\s*[\w-]{0,20}\s*$/;
 let meaningful=0,html="",listType:"ul"|"ol"|null=null,expected=0;
 const close=()=>{if(listType){html+="</"+listType+">";listType=null;}};
 for(let i=0;i<lines.length;i++){
  const line=lines[i],trimmed=line.trim();
  if(fence.test(line)){
   close();const code:string[]=[];
   let closed=false;
   for(i++;i<lines.length;i++){if(/^\s{0,3}\x60{3}\s*$/.test(lines[i])){closed=true;break;}code.push(lines[i]);}
   if(!closed)return "";
   html+="<pre><code>"+safe(code.join("\n"))+"</code></pre>";meaningful++;continue;
  }
  if(!trimmed){close();continue;}
  const h=heading.exec(line),q=quote.exec(line),check=checkbox.exec(line),u=unordered.exec(line),o=ordered.exec(line);
  if(check){
   close();
   html+='<div data-type="wave-check-item" data-done="'+(check[1].toLowerCase()==="x"?"true":"false")+
     '" data-shape="square"'+clipboardRtlAttribute(check[2])+'>'+safeMarkdownInline(check[2])+"</div>";
   meaningful++;continue;
  }
  if(h){close();html+="<h"+h[1].length+clipboardRtlAttribute(h[2])+">"+safeMarkdownInline(h[2])+"</h"+h[1].length+">";meaningful++;continue;}
  if(q){close();html+="<blockquote><p"+clipboardRtlAttribute(q[1])+">"+safeMarkdownInline(q[1])+"</p></blockquote>";meaningful++;continue;}
  if(trimmed==="---"||trimmed==="***"){close();html+="<hr>";meaningful++;continue;}
  if(u){
   if(listType!=="ul"){close();html+="<ul>";listType="ul";}
   html+="<li><p"+clipboardRtlAttribute(u[1])+">"+safeMarkdownInline(u[1])+"</p></li>";meaningful++;continue;
  }
  if(o){
   const num=Number(o[1]);
   if(listType!=="ol"||num!==expected){
    close();html+='<ol'+(num!==1?' start="'+num+'"':"")+">";listType="ol";
   }
   expected=num+1;
   html+="<li><p"+clipboardRtlAttribute(o[2])+">"+safeMarkdownInline(o[2])+"</p></li>";meaningful++;continue;
  }
  close();html+="<p"+clipboardRtlAttribute(line)+">"+safeMarkdownInline(line)+"</p>";
 }
 close();
 return meaningful>=2?html:"";
}
