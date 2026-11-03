/** Real DOCX pictures, rendered completely offline. This flattens photo ink
 * and freehand drawings into PNGs; no external image URL leaks private data. */
import {loadImageFile} from "./image-files";
import {paintInk} from "./wave-ink";

export type WordMedia={bytes:Uint8Array;width:number;height:number};

export function wordImageParagraph(relation:string,index:number,width:number,height:number):string{
 if(!/^rId[1-9]\d*$/.test(relation)||!Number.isInteger(index)||index<1||
    !Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
   throw Error("Некорректная фотография Word");
 const factor=Math.min(1,5400000/(width*9525),7400000/(height*9525));
 const cx=Math.max(9525,Math.round(width*9525*factor)),cy=Math.max(9525,Math.round(height*9525*factor));
 return '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'+
  '<wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:docPr id="'+index+'" name="Wave Notes image '+index+'"/>'+
  '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'+
  '<pic:pic><pic:nvPicPr><pic:cNvPr id="'+index+'" name="image'+index+'.png"/><pic:cNvPicPr/></pic:nvPicPr>'+
  '<pic:blipFill><a:blip r:embed="'+relation+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'+
  '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm>'+
  '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'+
  '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}
export function wordMediaRelationships(count:number):string{
 if(!Number.isInteger(count)||count<0||count>24)throw Error("Слишком много фотографий в Word");
 return '<?xml version="1.0" encoding="UTF-8"?>'+
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
  Array.from({length:count},(_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image'+(i+1)+'.png"/>').join("")+
  '</Relationships>';
}
/** Decodes only up to a 1.6-MP canvas and 6-MB output. */
export async function renderWordMedia(node:Element):Promise<WordMedia>{
 const photo=node.hasAttribute("data-wave-image");
 if(!photo&&!node.hasAttribute("data-wave-drawing"))throw Error("Нет рисунка для Word");
 let image:HTMLImageElement|null=null,url:string|null=null;
 try{
  if(photo){
   const id=node.getAttribute("data-image-id")||"";
   if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error("У фотографии в Word отсутствует идентификатор");
   const blob=await loadImageFile(id);
   if(!blob)throw Error("Фотография не найдена. Экспорт Word остановлен без потери данных");
   url=URL.createObjectURL(blob);
   image=await new Promise<HTMLImageElement>((resolve,reject)=>{
    const el=new Image();el.onload=()=>resolve(el);
    el.onerror=()=>reject(Error("Не удалось прочитать фотографию для Word"));
    el.src=url!;
   });
  }
  const width=photo?Math.min(960,Math.max(1,image!.naturalWidth)):960;
  const naturalHeight=photo?Math.max(1,image!.naturalHeight):600;
  const height=Math.max(1,Math.min(1500,Math.round(photo?width*naturalHeight/Math.max(image!.naturalWidth,1):600)));
  const factor=Math.min(1,Math.sqrt(1600000/(width*height)));
  const w=Math.max(1,Math.round(width*factor)),h=Math.max(1,Math.round(height*factor));
  const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("Графический экспорт Word недоступен на телефоне");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,w,h);
  if(image)ctx.drawImage(image,0,0,w,h);
  paintInk(ctx,node.getAttribute(photo?"data-ink":"data-wave-ink")||"[]",0,0,w,h);
  const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>
    result?resolve(result):reject(Error("Не удалось подготовить фотографию для Word")),"image/png"));
  if(!png.size||png.size>6*1024*1024)throw Error("Фотография слишком велика для Word");
  return {bytes:new Uint8Array(await png.arrayBuffer()),width:w,height:h};
 }finally{if(url)URL.revokeObjectURL(url);}
}
