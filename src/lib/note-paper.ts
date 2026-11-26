/** Appearance choices are visual-only and separate from the text colour.
 * Paper rulings may layer with pastel themes; choosing a solid palette colour
 * automatically disables the pastel theme while preserving the paper ruling.
 */
import {noteCaretColor} from "./note-caret-color";

export type PaperMood="solid"|"mist"|"warm"|"sage"|"sky"|"lavender";
export type PaperRule="plain"|"lined"|"grid"|"dots"|"margin";
export const PAPER_MOODS:{id:PaperMood;name:string;background:string;gradient:string}[]=[
 {id:"solid",name:"Обычный цвет",background:"#FDE68A",gradient:""},
 {id:"mist",name:"Мягкий туман",background:"#E8E6DD",gradient:"radial-gradient(ellipse at 45% 5%,rgba(255,255,255,.6),transparent 75%)"},
 {id:"warm",name:"Тёплая бумага",background:"#EFE8DF",gradient:"linear-gradient(140deg,rgba(255,255,255,.18),rgba(204,187,165,.15))"},
 {id:"sage",name:"Пастельный зелёный",background:"#DCE8E1",gradient:"radial-gradient(ellipse at 80% 20%,rgba(255,255,255,.45),transparent 70%)"},
 {id:"sky",name:"Спокойный голубой",background:"#DCE6F3",gradient:"linear-gradient(150deg,rgba(255,255,255,.45),rgba(186,205,231,.15))"},
 {id:"lavender",name:"Сиреневая бумага",background:"#E9E2F4",gradient:"radial-gradient(ellipse at 25% 0%,rgba(255,255,255,.48),transparent 75%)"},
];
export const PAPER_RULES:{id:PaperRule;name:string}[]=[
 {id:"plain",name:"Чистый лист"},{id:"lined",name:"В линейку"},
 {id:"grid",name:"В клетку"},{id:"dots",name:"В точку"},
 {id:"margin",name:"Линейка с полем"},
];
export const validPaperMood=(value:unknown):value is PaperMood=>PAPER_MOODS.some(m=>m.id===value);
export const validPaperRule=(value:unknown):value is PaperRule=>PAPER_RULES.some(m=>m.id===value);
/** Dark custom paper needs brighter ruling, without modifying stored styles. */
export function paperAppearance(mood:PaperMood,rule:PaperRule,background?:string):{backgroundImage?:string;backgroundSize?:string}{
 const active=PAPER_MOODS.find(m=>m.id===mood);
 const theme=active?.gradient||"";
 const dark=noteCaretColor(background||active?.background||"#FDE68A")==="#FFFFFF";
 const line=dark?"rgba(226,232,240,.26)":"rgba(66,84,112,.15)";
 const dot=dark?"rgba(226,232,240,.34)":"rgba(66,84,112,.22)";
 const marginInk=dark?"rgba(251,113,133,.56)":"rgba(216,79,90,.3)";
 const margin=`linear-gradient(to right,transparent 0,transparent 35px,${marginInk} 35px,${marginInk} 37px,transparent 37px)`;
 const overlay=rule==="margin"
  ? margin+`,repeating-linear-gradient(to bottom,transparent 0,transparent 27px,${line} 28px,transparent 29px)`
  :rule==="lined"
  ? `repeating-linear-gradient(to bottom,transparent 0,transparent 27px,${line} 28px,transparent 29px)`
  :rule==="grid"
  ? `linear-gradient(to right,${line} 1px,transparent 1px),linear-gradient(to bottom,${line} 1px,transparent 1px)`
  :rule==="dots"?`radial-gradient(${dot} 1px,transparent 1.3px)`:"";
 const layers=[overlay,theme].filter(Boolean);
 const sizes=rule==="grid"?["24px 24px","24px 24px"]:rule==="dots"?["20px 20px"]:[];
 if(theme&&sizes.length)sizes.push("auto");
 return {backgroundImage:layers.length?layers.join(","):undefined,
   backgroundSize:sizes.length?sizes.join(","):undefined};
}
