import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import {normalizedSafeNoteLink} from "./external-links";

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
              const text=node.text;
              const emailSpans:{from:number;to:number}[]=[];
              EMAIL_RE.lastIndex=0;
              let match:RegExpExecArray|null;
              // Email takes precedence over phone. Both regexes can match
              // digits inside the SAME email, and two overlapping "link"
              // marks would otherwise split its mailto: target.
              while((match=EMAIL_RE.exec(text))!==null){
                const raw=match[1],from=match.index,to=from+raw.length;
                emailSpans.push({from,to});
                const href=normalizedSafeNoteLink("mailto:"+raw);
                if(!href)continue;
                const safeHref=normalizedSafeNoteLink(href);
                if(!safeHref)continue;
                tr.addMark(pos+from,pos+to,linkType.create({href:safeHref}));
                modified=true;
              }
              PHONE_RE.lastIndex=0;
              while((match=PHONE_RE.exec(text))!==null){
                const raw=match[1],from=match.index,to=from+raw.length;
                if(emailSpans.some(span=>from<span.to&&to>span.from))continue;
                // Several spaces between two digits are NOT a valid phone.
                if(raw.replace(/\D/g,"").length<7)continue;
                // Do not link numbers embedded inside identifiers or
                // email-like strings. A standalone "+7 ..." still works.
                if((from>0&&/[\p{L}\p{N}_@]/u.test(text[from-1]))||
                   (to<text.length&&/[\p{L}\p{N}_@]/u.test(text[to])))continue;
                const href="tel:"+raw.replace(/[\s\-().]/g,"");
                tr.addMark(pos+from,pos+to,linkType.create({href}));
                modified=true;
              }
            });
          }
          return modified?tr:null;
        },
      }),
    ];
  },
});
