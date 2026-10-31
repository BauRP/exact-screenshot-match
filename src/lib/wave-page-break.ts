import {Node,mergeAttributes} from "@tiptap/core";
/** Explicit logical page boundary; works without paginating live rich text. */
export const WavePageBreak=Node.create({
 name:"wavePageBreak",group:"block",atom:true,selectable:true,draggable:true,
 addAttributes(){return {label:{default:"",parseHTML:el=>(el.getAttribute("data-page-label")||"").slice(0,80),renderHTML:attrs=>attrs.label?{"data-page-label":String(attrs.label).slice(0,80)}:{}}};},
 parseHTML(){return [{tag:"div[data-wave-page-break]"}];},
 renderHTML({HTMLAttributes}){return ["div",mergeAttributes(HTMLAttributes,{"data-wave-page-break":"true","class":"wave-page-break"})];},
 addCommands(){return {insertWavePageBreak:()=>({chain})=>chain().insertContent([{type:this.name},{type:"paragraph"}]).run()};},
});
declare module "@tiptap/core"{
 interface Commands<ReturnType>{wavePageBreak:{insertWavePageBreak:()=>ReturnType}}
}
