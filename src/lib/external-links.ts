/**
 * Strict allowlist shared by pasted links, editor taps and Android.
 * A tel:/mailto: link opens the dialer/composer, not a call or sent email.
 */
export function normalizedSafeNoteLink(input:string):string{
 if(typeof input!=="string"||!input||input.length>2048||
    /[\u0000-\u0020\u007f]/.test(input))return "";
 const email=/^mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})$/i.exec(input);
 if(email)return email[1].length<=254?"mailto:"+email[1]:"";
 const phone=/^tel:(\+?[0-9().-]+)$/i.exec(input);
 if(phone){
  const digits=phone[1].replace(/\D/g,"");
  return digits.length>=7&&digits.length<=20
   ?"tel:"+phone[1].replace(/[().-]/g,""):"";
 }
 try{
  const url=new URL(input);
  return (url.protocol==="https:"||url.protocol==="http:")&&
   Boolean(url.hostname)&&!url.username&&!url.password&&url.href.length<=2048
    ?url.href:"";
 }catch{return "";}
}
export function isSafeExternalUrl(input:string):boolean{
 return /^https?:\/\//i.test(normalizedSafeNoteLink(input));
}
export async function openExternalUrl(input:string):Promise<void>{
 const url=normalizedSafeNoteLink(input);
 if(!url)throw Error("Неподдерживаемая ссылка");
 const {Capacitor,registerPlugin}=await import("@capacitor/core");
 if(Capacitor.getPlatform()==="android"&&Capacitor.isNativePlatform()){
  const external=registerPlugin<{open(options:{url:string}):Promise<void>}>("ExternalNoteLink");
  await external.open({url});
  return;
 }
 if(url.startsWith("mailto:")||url.startsWith("tel:"))
  window.location.href=url;
 else window.open(url,"_blank","noopener,noreferrer");
}
