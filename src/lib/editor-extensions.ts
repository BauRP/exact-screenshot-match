import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";

/* -------------------------------------------------------------------------- */
/*  Font-size mark attribute (piggy-backs on TextStyle)                       */
/* -------------------------------------------------------------------------- */

// TextStyle from @tiptap/extension-text-style v3 provides fontSize, setFontSize
// and unsetFontSize. This module only exposes the extra auto-link plugin.

/* -------------------------------------------------------------------------- */
/*  Auto-link plugin: turns emails / phone numbers into links as user types.  */
/*  Tiptap Link handles http/https URLs via autolink.                         */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const PHONE_RE = /(\+?\d[\d\s\-().]{6,}\d)/g;

export const AutoLinkExtras = Extension.create({
  name: "autoLinkExtras",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("autoLinkExtras"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const linkType = newState.schema.marks.link;
          if (!linkType) return null;

          // A one-character edit in a long note previously rescanned EVERY
          // paragraph. Find only blocks affected by changed ProseMirror steps.
          const maps=transactions.flatMap((tx:Transaction)=>tx.mapping.maps);
          const affected=new Set<number>();
          for(let i=0;i<maps.length;i++){
            maps[i].forEach((_oldFrom,_oldTo,newFrom,newTo)=>{
              let start=newFrom,end=newTo;
              // Each step map uses an intermediate document. Bring its
              // changed positions forward to the final document state.
              for(let j=i+1;j<maps.length;j++){
                start=maps[j].map(start,-1);
                end=maps[j].map(end,1);
              }
              const from=Math.max(0,Math.min(start,end)-1);
              const to=Math.min(newState.doc.content.size,Math.max(start,end)+1);
              if(from>=to)return;
              newState.doc.nodesBetween(from,to,(node,pos)=>{
                if(node.isTextblock)affected.add(pos);
              });
            });
          }
          if(!affected.size)return null;
          const tr=newState.tr;
          let modified=false;
          for(const blockPos of affected){
            const block=newState.doc.nodeAt(blockPos);
            if(!block?.isTextblock)continue;
            block.forEach((node,offset)=>{
              if(!node.isText||!node.text||
                 node.marks.some(m=>m.type===linkType||m.type.name==="waveTape"))return;
              const pos=blockPos+1+offset;
              const scan=(re:RegExp,prefix:"mailto:"|"tel:")=>{
                re.lastIndex=0;
                let match:RegExpExecArray|null;
                while((match=re.exec(node.text!))!==null){
                  const raw=match[1];
                  const href=prefix==="tel:"
                    ? "tel:"+raw.replace(/[\s\-().]/g,"")
                    : prefix+raw;
                  tr.addMark(pos+match.index,pos+match.index+raw.length,
                    linkType.create({href}));
                  modified=true;
                }
              };
              scan(EMAIL_RE,"mailto:");
              scan(PHONE_RE,"tel:");
            });
          }
          return modified?tr:null;
        },
      }),
    ];
  },
});
