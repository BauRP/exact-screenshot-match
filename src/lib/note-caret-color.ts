export function noteCaretColor(bg:string):"#000000"|"#FFFFFF"{
 const m=/^#([0-9a-fA-F]{6})$/.exec(bg);if(!m)return "#FFFFFF";
 const n=parseInt(m[1],16),c=[(n>>16)&255,(n>>8)&255,n&255].map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});
 return .2126*c[0]+.7152*c[1]+.0722*c[2] > Math.sqrt(.0525)-.05?"#000000":"#FFFFFF";
}