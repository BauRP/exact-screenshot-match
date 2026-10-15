import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/* -------------------------------------------------------------------------- */
/*  Font-size mark attribute (piggy-backs on TextStyle)                       */
/* -------------------------------------------------------------------------- */



// TextStyle from @tiptap/extension-text-style v3 already provides a
// `fontSize` attribute and `setFontSize` / `unsetFontSize` commands, so no
// custom extension is needed. This module only exposes the auto-link plugin.


/* -------------------------------------------------------------------------- */
/*  Auto-link plugin: turns emails / phone numbers into <a> as user types     */
/*  (Link extension already handles http/https URLs via `autolink: true`.)    */
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
          const tr = newState.tr;
          let modified = false;

          newState.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return;
            if (node.marks.some((m) => m.type === linkType)) return;

            const scan = (re: RegExp, hrefPrefix: string) => {
              re.lastIndex = 0;
              let match: RegExpExecArray | null;
              while ((match = re.exec(node.text as string)) !== null) {
                const raw = match[1];
                const from = pos + match.index;
                const to = from + raw.length;
                const href =
                  hrefPrefix === "tel:"
                    ? `tel:${raw.replace(/[\s\-().]/g, "")}`
                    : `${hrefPrefix}${raw}`;
                tr.addMark(from, to, linkType.create({ href }));
                modified = true;
              }
            };

            scan(EMAIL_RE, "mailto:");
            scan(PHONE_RE, "tel:");
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
