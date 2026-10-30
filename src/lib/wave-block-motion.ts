import { Fragment } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

/**
 * Reorder only direct siblings inside the same parent. Never splice through a
 * folded section, list, table or other ProseMirror container.
 * A single transaction keeps the operation in the editor undo history.
 */
export function moveWaveBlock(
  editor: Editor,
  getPos: () => number | undefined,
  direction: "up" | "down",
): boolean {
  if (!editor.isEditable || editor.isDestroyed) return false;
  const position = getPos();
  if (typeof position !== "number") return false;

  const { state, view } = editor;
  const doc = state.doc;
  if (position < 0 || position >= doc.content.size) return false;

  const resolved = doc.resolve(position);
  const parent = resolved.parent;
  const index = resolved.index();
  const siblingOffset = resolved.parentOffset;

  // getPos() must be a node boundary at this depth.
  if (index >= parent.childCount) return false;
  if (parent.content.offsetAt(index) !== siblingOffset) return false;

  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= parent.childCount) return false;

  const current = parent.child(index);
  const neighbor = parent.child(nextIndex);
  const from = direction === "up" ? position - neighbor.nodeSize : position;
  const to = direction === "up" ? position + current.nodeSize : position + current.nodeSize + neighbor.nodeSize;
  const firstIndex = Math.min(index, nextIndex);
  const replacement = direction === "up"
    ? Fragment.fromArray([current, neighbor])
    : Fragment.fromArray([neighbor, current]);

  if (from < 0 || to > doc.content.size ||
      !parent.canReplace(firstIndex, firstIndex + 2, replacement)) return false;

  view.dispatch(state.tr.replaceWith(from, to, replacement).scrollIntoView());
  return true;
}
