/** Contrast follows the *paper* background, independently from font colour. */
export function noteCaretColor(bg:string):"#000000"|"#FFFFFF"{
 const hex=/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.exec(bg.trim());
 let rgb:number[]|undefined;
 if(hex){
  const h=hex[1];
  const full=h.length===3?h.split("").map(c=>c+c).join(""):h;
  const n=parseInt(full.slice(0,6),16);
  rgb=[(n>>16)&255,(n>>8)&255,n&255];
 }else{
  const css=/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*(?:0?(?:\.\d+)?|1(?:\.0+)?))?\s*\)$/i.exec(bg.trim());
  if(css){
   rgb=css.slice(1,4).map(Number);
   if(rgb.some(c=>c>255))rgb=undefined;
  }
 }
 if(!rgb)return "#FFFFFF";
 const c=rgb.map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});
 const brightness=.2126*c[0]+.7152*c[1]+.0722*c[2];
 return brightness>Math.sqrt(.0525)-.05?"#000000":"#FFFFFF";
}
