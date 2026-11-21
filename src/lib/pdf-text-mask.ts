/** Shared PDF-source erase rectangle for on-screen and exported PDF.
 * This is a visual replacement, NOT privacy/security redaction of PDF text.
 */
export type TextEraseLike={xPct:number;yPct:number;widthPct:number;heightPct:number;
  eraseXPct?:number;eraseYPct?:number;eraseWidthPct?:number;eraseHeightPct?:number};
export function sourceErasePixels(overlay:TextEraseLike,pageWidth:number,pageHeight:number,pad=1){
  const x=overlay.eraseXPct??overlay.xPct,y=overlay.eraseYPct??overlay.yPct;
  const w=overlay.eraseWidthPct??overlay.widthPct,h=overlay.eraseHeightPct??overlay.heightPct;
  return {left:x/100*pageWidth-pad,top:y/100*pageHeight-pad,
    width:w/100*pageWidth+pad*2,height:h/100*pageHeight+pad*2};
}
/** Samples surrounding pixels, avoiding glyph ink, only if nearly uniform. */
export function sampleSolidPdfBackground(canvas:HTMLCanvasElement,rect:{x:number;y:number;width:number;height:number}):string|null{
  try{
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(!ctx)return null;
    const w=parseFloat(canvas.style.width)||canvas.clientWidth||canvas.width;
    const h=parseFloat(canvas.style.height)||canvas.clientHeight||canvas.height;
    if(w<=0||h<=0)return null;
    const sx=canvas.width/w,sy=canvas.height/h;
    const mx=rect.x+rect.width/2,my=rect.y+rect.height/2;
    const pts=[[rect.x-4,rect.y-4],[rect.x+rect.width+4,rect.y-4],
      [rect.x-4,rect.y+rect.height+4],[rect.x+rect.width+4,rect.y+rect.height+4],
      [mx,rect.y-4],[mx,rect.y+rect.height+4],[rect.x-4,my],[rect.x+rect.width+4,my]];
    const samples:number[][]=[];
    for(const [x,y] of pts){
      const px=Math.round(x*sx),py=Math.round(y*sy);
      if(px<0||py<0||px>=canvas.width||py>=canvas.height)continue;
      const d=ctx.getImageData(px,py,1,1).data;
      if(d[3]>=245)samples.push([d[0],d[1],d[2]]);
    }
    if(samples.length<4)return null;
    const median=(v:number[])=>v.slice().sort((a,b)=>a-b)[Math.floor(v.length/2)];
    const rgb=[0,1,2].map(i=>median(samples.map(x=>x[i])));
    if(samples.some(s=>s.some((v,i)=>Math.abs(v-rgb[i])>14)))return null;
    return "#"+rgb.map(x=>x.toString(16).padStart(2,"0")).join("");
  }catch{return null;}
}
