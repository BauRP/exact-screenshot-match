/** Calculate the preview width during a photo drag without writing the
 * note. Original size and pointer start are captured on pointerdown.
 * Numbers are clamped to the same 120..720 px and 10 px step as before. */
export function imageWidthForDrag(width:number,startX:number,currentX:number):number{
 const base=Number.isFinite(width)?width:320;
 if(!Number.isFinite(startX)||!Number.isFinite(currentX))
  return Math.max(120,Math.min(720,base));
 return Math.max(120,Math.min(720,Math.round((base+currentX-startX)/10)*10));
}
