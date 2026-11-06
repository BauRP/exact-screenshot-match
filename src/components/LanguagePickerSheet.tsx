import {useEffect,useState} from "react";
import {createPortal} from "react-dom";
import {Check,ChevronDown,X} from "lucide-react";
type Option={value:string;label:string};
type Props={value:string;onChange:(value:string)=>void;options:readonly Option[];
label:string;description?:string;compact?:boolean;disabled?:boolean};
export function LanguagePickerSheet({value,onChange,options,label,description,compact=false,disabled=false}:Props){
 const[open,setOpen]=useState(false);
 useEffect(()=>{if(!open)return;const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false)};
 document.addEventListener("keydown",escape);
 return()=>document.removeEventListener("keydown",escape)},[open]);
 const selected=options.find(o=>o.value===value)?.label??label;
 const modal=open&&typeof document!=="undefined"?createPortal(
 <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
  <button type="button" aria-label="Закрыть выбор языка" className="absolute inset-0 bg-black/75" onClick={()=>setOpen(false)}/>
  <section role="dialog" aria-label={label} aria-modal="true"
   className="relative z-10 flex w-full max-w-[28rem] flex-col overflow-hidden rounded-t-[1.75rem] border border-[#313844] bg-[#14171e] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:mb-4 sm:rounded-[1.75rem]"
   style={{maxHeight:"min(85dvh,760px)"}}>
   <div className="mx-auto mb-4 h-1 w-11 rounded-full bg-[#525967]"/>
   <div className="mb-4 flex items-start justify-between gap-3">
    <div><h2 className="font-semibold">{label}</h2>
    {description&&<p className="mt-1 text-xs text-[#aeb4bf]">{description}</p>}</div>
    <button type="button" aria-label="Закрыть" onClick={()=>setOpen(false)}
     className="rounded-full bg-[#292d35] p-2"><X className="h-4 w-4"/></button>
   </div>
   <div role="radiogroup" aria-label={label} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain">
    {options.map(option=>{const active=option.value===value;return <button type="button" key={option.value}
     role="radio" aria-checked={active} onClick={()=>{onChange(option.value);setOpen(false)}}
     className={"flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm "+
      (active?"border-[#ffc247] bg-[#302719] text-[#ffd174]":"border-[#333945] bg-[#1b2028] text-[#f0f0f2]")}>
      <span>{option.label}</span><span aria-hidden="true"
       className={"grid h-5 w-5 shrink-0 place-items-center rounded-full border "+(active?"border-[#ffc247] bg-[#ffc247] text-[#1b1b1b]":"border-[#aab0b9]")}>
       {active&&<Check className="h-3.5 w-3.5" strokeWidth={3}/>}
      </span>
     </button>})}
   </div>
   <button type="button" onClick={()=>setOpen(false)}
    className="mt-4 min-h-11 rounded-full bg-[#ffc247] font-semibold text-[#171717]">Готово</button>
  </section>
 </div>,document.body):null;
 return <><button type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
  disabled={disabled} onClick={()=>setOpen(true)}
  className={"flex items-center justify-between gap-2 border border-border bg-secondary/60 text-foreground disabled:opacity-50 "+
   (compact?"h-9 max-w-[10rem] rounded-full px-3 text-xs font-semibold":"min-h-11 w-full rounded-xl px-3 py-2 text-sm")}>
  <span className="truncate">{selected}</span><ChevronDown className="h-4 w-4 shrink-0"/></button>{modal}</>;
}
