import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {matchingSlashCommands,nextSlashIndex,slashCommandAtCaret} from "../src/lib/wave-slash-commands";
const list=[{id:"checklist",label:"Список дел"},{id:"heading",label:"Заголовок"},{id:"fold",label:"Сворачиваемый раздел"},{id:"date",label:"Дата"}];
assert.deepEqual(matchingSlashCommands(list,"список").map(x=>x.id),["checklist"]);
assert.deepEqual(matchingSlashCommands(list,"  ЗАГОЛОВОК  ").map(x=>x.id),["heading"]);
assert.deepEqual(matchingSlashCommands(list,"che").map(x=>x.id),["checklist"]);
const aliases=[{id:"checklist",label:"Список дел",keywords:["задача","чеклист"]},
 {id:"heading1",label:"Заголовок 1",keywords:["h1","главный"]}];
assert.deepEqual(matchingSlashCommands(aliases,"задача").map(x=>x.id),["checklist"]);
assert.deepEqual(matchingSlashCommands(aliases,"h1").map(x=>x.id),["heading1"]);
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

const ranked=[{id:"other",label:"Предварительный список"},
 {id:"checklist",label:"Список дел",keywords:["задача"]},
 {id:"list",label:"Список избранных",keywords:["список"]}];
assert.deepEqual(matchingSlashCommands(ranked,"список").map(x=>x.id),["list","checklist","other"]);
assert.deepEqual(matchingSlashCommands(ranked,"пред").map(x=>x.id),["other"]);
assert.deepEqual(matchingSlashCommands(ranked,"список избранных").map(x=>x.id),["list"]);


// Media insertion is a first-class slash action, not only a toolbar button.
for(const command of ['id:"gallery"','id:"camera"','id:"drawing"']){
 assert.ok(editor.includes(command),command);
}
assert.ok(editor.includes('if(kind==="gallery"){chain.run();addImage();return;}'));
assert.ok(editor.includes('if(kind==="camera"){chain.run();addCameraImage();return;}'));
assert.ok(editor.includes('if(kind==="drawing"){chain.insertWaveDrawing().run();return;}'));
assert.ok(editor.includes('if(kind==="tape"&&editor.state.selection.empty)'),
 "Tape must not delete the slash query when the selection is empty");
const media=[{id:"gallery",label:"Фотография из галереи",keywords:["фото","картинка"]},
 {id:"camera",label:"Сфотографировать",keywords:["камера","снимок"]},
 {id:"drawing",label:"Рисунок",keywords:["рисовать","полотно"]}];
assert.deepEqual(matchingSlashCommands(media,"камера").map(item=>item.id),["camera"]);
assert.deepEqual(matchingSlashCommands(media,"рисовать").map(item=>item.id),["drawing"]);
assert.deepEqual(matchingSlashCommands(media,"фото").map(item=>item.id),["gallery","camera"],
 "Both gallery and camera match a photo search; gallery is the first suggestion");

assert.deepEqual(slashCommandAtCaret("/"),{query:"",length:1});
assert.deepEqual(slashCommandAtCaret("Текст /задачи"),{query:"задачи",length:7});
assert.deepEqual(slashCommandAtCaret("План\n/задачи"),{query:"задачи",length:7});
assert.deepEqual(slashCommandAtCaret("План /заголовок"),{query:"заголовок",length:10});
for(const invalid of ["https://example.com","a/b","text /задачи!","x/heading","//задача"]){
 assert.equal(slashCommandAtCaret(invalid),null,invalid);
}
assert.deepEqual(matchingSlashCommands([{id:"x",label:"Ёлка"}],"елка").map(v=>v.id),["x"]);
assert.ok(editor.includes("slashCommandAtCaret(before)?.query??null"));
assert.ok(editor.includes("slashCommandAtCaret(textBefore)?.length"));
assert.ok(editor.includes('id:"checklist3"'));
assert.ok(editor.includes('id:"checklist5"'));

assert.ok(editor.includes("setSlashText(currentSelection.empty?slashCommandAtCaret(before)?.query??null:null)"),
 "Moving the cursor must close the stale slash palette");
assert.ok(editor.includes("setSlashText(currentEditor.state.selection.empty?"),
 "Text selections must never leave an active insertion command");
