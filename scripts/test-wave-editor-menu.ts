import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const index=readFileSync("src/routes/index.tsx","utf8");
assert.ok(index.includes('aria-label="Дополнительные действия с заметкой"'));
assert.ok(index.includes("Создать копию"));
assert.ok(index.includes("Поделиться заметкой"));
assert.ok(index.includes("Цвет карточки"));
assert.ok(index.includes("Переместить в папку"));
assert.ok(index.includes("setNativeAdDialogBlocked("));
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const item of ["Маркированный список","Нумерованный список","Список дел","Заголовок","toggleBulletList()","toggleOrderedList()","toggleHeading({level:2})"]){
 assert.ok(editor.includes(item),item);
}
const checklist=readFileSync("src/lib/wave-checklist.ts","utf8");
assert.ok(checklist.includes("addKeyboardShortcuts()"));
assert.ok(checklist.includes("setNode(\"paragraph\")"));
assert.ok(checklist.includes("setTextSelection(at+1)"));
console.log("Compact selected actions and Android list continuation wiring verified");
