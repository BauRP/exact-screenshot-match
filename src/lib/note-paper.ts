/** Appearance choices are visual-only and separate from the text colour.
 * Paper rulings may layer with pastel themes; choosing a solid palette colour
 * automatically disables the pastel theme while preserving the paper ruling.
 */
export type PaperMood="solid"|"mist"|"warm"|"sage"|"sky";
export type PaperRule="plain"|"lined"|"grid"|"dots";
export const PAPER_MOODS:{id:PaperMood;name:string;background:string;gradient:string}[]=[
 {id:"solid",name:"Обычный цвет",background:"#FDE68A",gradient:""},
 {id:"mist",name:"Мягкий туман",background:"#E8E6DD",gradient:"radial-gradient(ellipse at 45% 5%,rgba(255,255,255,.6),transparent 75%)"},
 {id:"warm",name:"Тёплая бумага",background:"#EFE8DF",gradient:"linear-gradient(140deg,rgba(255,255,255,.18),rgba(204,187,165,.15))"},
 {id:"sage",name:"Пастельный зелёный",background:"#DCE8E1",gradient:"radial-gradient(ellipse at 80% 20%,rgba(255,255,255,.45),transparent 70%)"},
 {id:"sky",name:"Спокойный голубой",background:"#DCE6F3",gradient:"linear-gradient(150deg,rgba(255,255,255,.45),rgba(186,205,231,.15))"},
];
export const PAPER_RULES:{id:PaperRule;name:string}[]=[
 {id:"plain",name:"Чистый лист"},{id:"lined",name:"В линейку"},
 {id:"grid",name:"В клетку"},{id:"dots",name:"В точку"},
];
export const validPaperMood=(value:unknown):value is PaperMood=>PAPER_MOODS.some(m=>m.id===value);
export const validPaperRule=(value:unknown):value is PaperRule=>PAPER_RULES.some(m=>m.id===value);
export function paperAppearance(mood:PaperMood,rule:PaperRule):{backgroundImage?:string;backgroundSize?:string}{
 const theme=PAPER_MOODS.find(m=>m.id===mood)?.gradient||"";
 const line="rgba(66,84,112,.15)";
 const overlay=rule==="lined"
  ? `repeating-linear-gradient(to bottom,transparent 0,transparent 27px,${line} 28px,transparent 29px)`
  :rule==="grid"
  ? `linear-gradient(to right,${line} 1px,transparent 1px),linear-gradient(to bottom,${line} 1px,transparent 1px)`
  :rule==="dots"?"radial-gradient(rgba(66,84,112,.22) 1px,transparent 1.3px)":"";
 const layers=[overlay,theme].filter(Boolean);
 return {backgroundImage:layers.length?layers.join(","):undefined,
   backgroundSize:rule==="grid"?"24px 24px,24px 24px,auto":rule==="dots"?"20px 20px,auto":undefined};
}
