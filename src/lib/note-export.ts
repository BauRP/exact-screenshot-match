/**
 * True offline text exports. These are independent copies: the save checkmark
 * continues to save only inside Wave Notes. For audio/PDF attachments and
 * lossless editor round-tripping use the existing .wnote exchange format.
 */
import {zip} from "fflate";
import type {Note} from "./notes-store";

export type NoteExportFormat="txt"|"html"|"docx";
type Exported={blob:Blob;name:string;mime:string};

const escapeHtml=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const escapeXml=(s:string)=>escapeHtml(s).replace(/'/g,"&apos;");
const blocks=new Set(["P","DIV","H1","H2","H3","H4","H5","H6","LI","UL","OL","PRE","SECTION","ASIDE","BLOCKQUOTE","TABLE","TR"]);
const keep=new Set(["P","BR","DIV","H1","H2","H3","H4","H5","H6","STRONG","B","EM","I","U","S","DEL","SPAN","A","OL","UL","LI","BLOCKQUOTE","PRE","CODE","HR","TABLE","THEAD","TBODY","TR","TH","TD","SECTION","ASIDE"]);
const isColor=(s:string)=>/^#[0-9a-f]{3,8}$/i.test(s.trim());
function parseBody(note:Note):HTMLElement {
  return new DOMParser().parseFromString(note.body||"","text/html").body;
}
function plainNode(node:Node):string{
  if(node.nodeType===3)return node.textContent||"";
  if(node.nodeType!==1)return "";
  const el=node as Element,tag=el.tagName;
  if(tag==="BR")return "\n";
  if(tag==="IMG")return "[Изображение — сохраните .wnote для передачи вложения]";
  if(tag==="AUDIO")return "[Аудиозапись — сохраните .wnote для передачи вложения]";
  const inner=Array.from(node.childNodes).map(plainNode).join("");
  const check=el.getAttribute("data-type")==="wave-check-item"?(el.getAttribute("data-done")==="true"?"[x] ":"[ ] "):"";
  return blocks.has(tag)?check+inner+"\n":inner;
}
export function plainNoteText(note:Note):string{
  if(note.kind==="pdf")throw Error("PDF уже является отдельным документом");
  return (note.title+"\n\n"+plainNode(parseBody(note))).replace(/\n{3,}/g,"\n\n").trim()+"\n";
}
function sanitizedBody(note:Note):string{
  const doc=document.implementation.createHTMLDocument("Wave Notes");
  const input=parseBody(note);
  const clean=(node:Node):Node=>{
    if(node.nodeType===3)return doc.createTextNode(node.textContent||"");
    if(node.nodeType!==1)return doc.createTextNode("");
    const el=node as HTMLElement, tag=el.tagName;
    if(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","FORM","META","LINK","SVG"].includes(tag))return doc.createTextNode("");
    if(tag==="IMG"||tag==="AUDIO")return doc.createTextNode("[Вложение — используйте .wnote]");
    const safeTag=keep.has(tag)?tag.toLowerCase():"span";
    const out=doc.createElement(safeTag);
    if(tag==="A"){
      const href=el.getAttribute("href")||"";
      try{const url=new URL(href);if(["https:","http:"].includes(url.protocol)){
        out.setAttribute("href",url.href);out.setAttribute("rel","noopener noreferrer");
      }}catch{/* A non-web URL is rendered as plain link text. */}
    }
    const styles:string[]=[];
    for(const property of ["color","background-color"]){
      const v=el.style.getPropertyValue(property).trim();
      if(isColor(v))styles.push(property+":"+v);
    }
    const size=el.style.getPropertyValue("font-size").trim();
    if(/^(?:[8-9]|[1-6][0-9]|7[0-2])px$/.test(size))styles.push("font-size:"+size);
    const align=el.style.getPropertyValue("text-align").trim();
    if(["left","right","center","justify"].includes(align))styles.push("text-align:"+align);
    if(styles.length)out.setAttribute("style",styles.join(";"));
    if(el.getAttribute("data-type")==="wave-check-item"){
      out.prepend(doc.createTextNode(el.getAttribute("data-done")==="true"?"☑ ":"☐ "));
    }
    Array.from(el.childNodes).forEach(child=>out.appendChild(clean(child)));
    return out;
  };
  const container=doc.createElement("div");
  Array.from(input.childNodes).forEach(child=>container.appendChild(clean(child)));
  return container.innerHTML;
}
export function noteHtmlDocument(note:Note):string{
  if(note.kind==="pdf")throw Error("Для PDF используйте исходный PDF или .wnote");
  const bg=note.style?.background;
  const color=note.style?.color;
  const paper=isColor(bg||"")?bg:"#ffffff";
  const ink=isColor(color||"")?color:"#222222";
  return "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"+
    "<title>"+escapeHtml(note.title)+"</title><style>body{box-sizing:border-box;max-width:850px;margin:36px auto;padding:24px;"+
    "font:16px/1.55 system-ui,sans-serif;background:"+paper+";color:"+ink+";overflow-wrap:anywhere}"+
    "table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:6px}blockquote{border-left:3px solid #888;padding-left:12px}"+
    "@media(max-width:650px){body{margin:0;padding:16px}}</style></head><body><h1>"+
    escapeHtml(note.title)+"</h1>"+sanitizedBody(note)+"</body></html>";
}
type RunStyle={bold?:boolean;italic?:boolean;underline?:boolean;color?:string};
function docxRun(s:string,style:RunStyle={}):string{
  if(!s)return "";
  const pr=(style.bold?"<w:b/>":"")+(style.italic?"<w:i/>":"")+(style.underline?"<w:u w:val=\"single\"/>":"")+
    (style.color?"<w:color w:val=\""+style.color+"\"/>":"");
  return "<w:r>"+(pr?"<w:rPr>"+pr+"</w:rPr>":"")+
    "<w:t xml:space=\"preserve\">"+escapeXml(s)+"</w:t></w:r>";
}
function inlineWord(node:Node,style:RunStyle={}):string {
  if(node.nodeType===3)return docxRun(node.textContent||"",style);
  if(node.nodeType!==1)return "";
  const el=node as HTMLElement,tag=el.tagName;
  if(tag==="BR")return "<w:r><w:br/></w:r>";
  if(tag==="IMG"||tag==="AUDIO")return docxRun("[Вложение доступно в .wnote]",style);
  const next={...style};
  if(tag==="STRONG"||tag==="B")next.bold=true;
  if(tag==="EM"||tag==="I")next.italic=true;
  if(tag==="U")next.underline=true;
  const ink=el.style.getPropertyValue("color").trim();
  if(/^#[0-9a-fA-F]{6}$/.test(ink))next.color=ink.slice(1).toUpperCase();
  return Array.from(node.childNodes).map(child=>inlineWord(child,next)).join("");
}
function wordParagraph(content:string,heading=false):string{
  return "<w:p>"+(heading?"<w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr>":"")+
    (content||docxRun(" "))+"</w:p>";
}
function wordBody(note:Note):string{
  const root=parseBody(note),paragraphs=[wordParagraph(docxRun(note.title,{bold:true}),true)];
  const traverse=(node:Node):void=>{
    if(node.nodeType===3){
      const t=(node.textContent||"").trim();
      if(t)paragraphs.push(wordParagraph(docxRun(t)));
      return;
    }
    if(node.nodeType!==1)return;
    const el=node as Element,tag=el.tagName;
    if(["P","H1","H2","H3","H4","H5","H6","LI","BLOCKQUOTE","PRE"].includes(tag)||el.getAttribute("data-type")==="wave-check-item"){
      const prefix=el.getAttribute("data-type")==="wave-check-item"?(el.getAttribute("data-done")==="true"?"[x] ":"[ ] "):tag==="LI"?"• ":"";
      paragraphs.push(wordParagraph(docxRun(prefix)+inlineWord(node),/^H[1-6]$/.test(tag)));
      return;
    }
    const children=Array.from(node.childNodes);
    if(children.every(c=>c.nodeType===3||c.nodeType===1&&!blocks.has((c as Element).tagName))){
      const rendered=inlineWord(node);if(rendered)paragraphs.push(wordParagraph(rendered));
    }else children.forEach(traverse);
  };
  Array.from(root.childNodes).forEach(traverse);
  return paragraphs.join("");
}
async function docxBlob(note:Note):Promise<Blob>{
  const xml="<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>"+
    wordBody(note)+"<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/></w:sectPr></w:body></w:document>";
  const files:Record<string,Uint8Array>={};
  const encode=new TextEncoder();
  files["[Content_Types].xml"]=encode.encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  files["_rels/.rels"]=encode.encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  files["word/document.xml"]=encode.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+xml);
  const packed=await new Promise<Uint8Array>((resolve,reject)=>zip(files,{level:6},(error,data)=>error?reject(error):resolve(data)));
  return new Blob([packed.slice().buffer],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}
function filename(title:string,format:NoteExportFormat):string {
  const name=title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"").replace(/\s+/g," ").trim().slice(0,70);
  return (name||"Wave Notes")+"-"+Date.now()+"."+format;
}
export async function buildNoteExport(note:Note,format:NoteExportFormat):Promise<Exported>{
  if(note.kind==="pdf")throw Error("Для PDF используйте исходный PDF либо .wnote");
  if(note.body.length>2_000_000)throw Error("Заметка слишком велика для этого экспорта");
  const mime=format==="txt"?"text/plain;charset=utf-8":format==="html"?"text/html;charset=utf-8":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const blob=format==="txt"?new Blob(["\uFEFF"+plainNoteText(note)],{type:mime}):
    format==="html"?new Blob([noteHtmlDocument(note)],{type:mime}):await docxBlob(note);
  return {blob,mime,name:filename(note.title,format)};
}
export async function shareNoteExport(note:Note,format:NoteExportFormat):Promise<void>{
  const {blob,name,mime}=await buildNoteExport(note,format);
  const {Capacitor}=await import("@capacitor/core");
  if(Capacitor.isNativePlatform()&&Capacitor.getPlatform()==="android"){
    const [{Filesystem,Directory},{Share}]=await Promise.all([
      import("@capacitor/filesystem"),import("@capacitor/share")
    ]);
    const encoded=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(reader.error||Error("Не удалось прочитать файл"));
      reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
      reader.readAsDataURL(blob);
    });
    const output=await Filesystem.writeFile({directory:Directory.Cache,path:name,data:encoded});
    await Share.share({title:note.title,url:output.uri,dialogTitle:"Экспорт Wave Notes"});
    return;
  }
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=name;a.type=mime;
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
