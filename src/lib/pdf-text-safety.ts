/** Non-destructive source line editing: keep other PDF text out of the edit rectangle.
 * All rectangles are fractions of the UNROTATED PDF page, expressed in percents.
 */
export type PdfRect = {x:number;y:number;width:number;height:number};
export type StoredSourceEdit = {cover:boolean;page:number;eraseXPct?:number;eraseYPct?:number;eraseWidthPct?:number;eraseHeightPct?:number;xPct:number;yPct:number;widthPct:number;heightPct:number};
const approx=(a:number,b:number,tolerance=0.35)=>Math.abs(a-b)<=tolerance;
export function sameSourceText(edit: StoredSourceEdit, source: PdfRect, page:number): boolean {
  return edit.cover && edit.page===page &&
    approx(edit.eraseXPct ?? edit.xPct,source.x) &&
    approx(edit.eraseYPct ?? edit.yPct,source.y) &&
    approx(edit.eraseWidthPct ?? edit.widthPct,source.width,0.6) &&
    approx(edit.eraseHeightPct ?? edit.heightPct,source.height,0.6);
}
/** Choose the right edge of the *current source line*, not the width of an
 * arbitrary selection. Stop before a neighboring source item on that row.
 */
export function safeSourceRight(source:PdfRect, others:PdfRect[], pageRight=98): number {
  let end=Math.min(pageRight,100);
  const sourceEnd=source.x+source.width;
  for(const other of others) {
    const same=approx(other.x,source.x,0.4)&&approx(other.y,source.y,0.4)&&approx(other.width,source.width,0.5);
    if(same)continue;
    const verticalOverlap=Math.min(source.y+source.height,other.y+other.height)-Math.max(source.y,other.y);
    if(verticalOverlap<Math.min(source.height,other.height)*0.45)continue;
    if(other.x>=sourceEnd-0.2&&other.x<end) end=other.x-0.3;
  }
  return Math.max(sourceEnd,Math.min(pageRight,end));
}
/** Reject hard line breaks and horizontal overflow for replacement of one
 * existing PDF line. A line may be enlarged only if there is actual room.
 */
export function sourceLineFits(next:string,maxWidthPx:number,measure:(text:string)=>number): boolean {
  return !/[\r\n]/.test(next) && Number.isFinite(maxWidthPx) &&
    measure(next) <= maxWidthPx+1.5;
}
