/**
 * Browser handoff for note links. Only the system browser can display pages:
 * Wave Notes never renders linked sites inside its note editor/WebView.
 */
export function isSafeExternalUrl(input:string):boolean{
 try{
  const url=new URL(input);
  return (url.protocol==="http:"||url.protocol==="https:")&&Boolean(url.hostname);
 }catch{return false;}
}
export async function openExternalUrl(input:string):Promise<void>{
 if(!isSafeExternalUrl(input))throw Error("Неподдерживаемая ссылка");
 const {Capacitor,registerPlugin}=await import("@capacitor/core");
 if(Capacitor.getPlatform()==="android"&&Capacitor.isNativePlatform()){
  const external=registerPlugin<{open(options:{url:string}):Promise<void>}>("ExternalNoteLink");
  await external.open({url:input});
  return;
 }
 window.open(input,"_blank","noopener,noreferrer");
}
