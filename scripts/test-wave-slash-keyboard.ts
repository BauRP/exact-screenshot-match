import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {matchingSlashCommands,nextSlashIndex} from "../src/lib/wave-slash-commands";
const list=[{id:"checklist",label:"Список дел"},{id:"heading",label:"Заголовок"},{id:"fold",label:"Сворачиваемый раздел"},{id:"date",label:"Дата"}];
assert.deepEqual(matchingSlashCommands(list,"список").map(x=>x.id),["checklist"]);
assert.deepEqual(matchingSlashCommands(list,"  ЗАГОЛОВОК  ").map(x=>x.id),["heading"]);
assert.deepEqual(matchingSlashCommands(list,"che").map(x=>x.id),["checklist"]);
assert.deepEqual(matchingSlashCommands(list,"СвоРАчиваемый Раздел").map(x=>x.id),["fold"]);
assert.deepEqual(matchingSlashCommands(list,"нет совпадений"),[]);
assert.equal(nextSlashIndex(4,0,-1),3);
assert.equal(nextSlashIndex(4,3,1),0);
assert.equal(nextSlashIndex(0,0,1),0);
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const token of ["matchingSlashCommands(blockChoices,slashText)","onKeyDownCapture={event=>","nextSlashIndex(","setSlashActive(","aria-selected={slashActive===index}","Команда не найдена"])
 assert.ok(editor.includes(token),token);
assert.ok(!editor.includes("window.prompt("),"Page labels should use an in-app dialog");
assert.ok(editor.includes("aria-label=\"Название страницы\""));
console.log("Slash commands keyboard support and in-app page naming checked");
