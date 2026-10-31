/** Coordinates are source page percentages, not current screen positions.
 * PDF.js viewport rotation and CSS rotate use the same clockwise degrees.
 */
export type PdfRect = {x: number; y: number; width: number; height: number};
export function normalizedRotation(rotation: number): 0|90|180|270 {
  return (((rotation % 360) + 360) % 360) as 0|90|180|270;
}
export function displayToSourceRect(r:PdfRect, rotation:number):PdfRect {
  switch(normalizedRotation(rotation)) {
    case 90: return {x:r.y,y:100-r.x-r.width,width:r.height,height:r.width};
    case 180:return {x:100-r.x-r.width,y:100-r.y-r.height,width:r.width,height:r.height};
    case 270:return {x:100-r.y-r.height,y:r.x,width:r.height,height:r.width};
    default:return {...r};
  }
}
export function sourceToDisplayRect(r:PdfRect, rotation:number):PdfRect {
  switch(normalizedRotation(rotation)) {
    case 90:return {x:100-r.y-r.height,y:r.x,width:r.height,height:r.width};
    case 180:return {x:100-r.x-r.width,y:100-r.y-r.height,width:r.width,height:r.height};
    case 270:return {x:r.y,y:100-r.x-r.width,width:r.height,height:r.width};
    default:return {...r};
  }
}
/** CSS transform: transform-origin top left, rotate content with the PDF.js page. */
export function sourceOverlayTransform(rotation:number,width:number,height:number):string {
  switch(normalizedRotation(rotation)){
    case 90:return `translate(${height}px,0px) rotate(90deg)`;
    case 180:return `translate(${width}px,${height}px) rotate(180deg)`;
    case 270:return `translate(0px,${width}px) rotate(270deg)`;
    default:return "none";
  }
}
/** Text from PDF.js is measured in its actual rotated viewport, not as an
 * unrotated horizontal rectangle. Handles baseline rotated at 90/180/270.
 */
export function pdfTextBounds(
  transform:number[], textWidth:number, fontHeight:number,
  viewportWidth:number,viewportHeight:number,
): PdfRect {
  const bx=transform[4],by=transform[5];
  const normalizer=Math.hypot(transform[0],transform[1]) || 1;
  const dx=transform[0]/normalizer,dy=transform[1]/normalizer;
  const heightNorm=Math.hypot(transform[2],transform[3]) || 1;
  const hx=transform[2]/heightNorm*fontHeight;
  const hy=transform[3]/heightNorm*fontHeight;
  const corners=[
    [bx,by],[bx+dx*textWidth,by+dy*textWidth],
    [bx+hx,by+hy],[bx+dx*textWidth+hx,by+dy*textWidth+hy],
  ];
  const xs=corners.map(c=>c[0]),ys=corners.map(c=>c[1]);
  const x=Math.min(...xs),y=Math.min(...ys);
  const w=Math.max(...xs)-x,h=Math.max(...ys)-y;
  return {x:x/viewportWidth*100,y:y/viewportHeight*100,width:w/viewportWidth*100,height:h/viewportHeight*100};
}
