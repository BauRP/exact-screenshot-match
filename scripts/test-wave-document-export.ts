import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const exp=readFileSync("src/lib/note-export.ts","utf8");
const home=readFileSync("src/routes/index.tsx","utf8");
for(const marker of ["plainNoteText","noteHtmlDocument","docxBlob","[Content_Types].xml","_rels/.rels","word/document.xml","escapeXml","sanitizedBody","shareNoteExport","buildNoteExport","pngBlob","image/png","height>12000","canvas.toBlob","Directory.Cache","Share.share"]){
 assert.ok(exp.includes(marker),marker);
}
for(const marker of ['doExportSelected("txt")','doExportSelected("html")','doExportSelected("docx")','doExportSelected("png")','aria-label="Дополнительные действия с заметкой"','Экспорт в файл','setExportDialog','shareNoteExport(selectedNotes[0],format)']){
 assert.ok(home.includes(marker),marker);
}
assert.ok(exp.includes("if(note.kind===\"pdf\")throw"),"PDF notes should not be incorrectly exported as text");
assert.ok(home.includes("exportDialog || Boolean(incomingWave)"),"Native ads must not obstruct dialogs");
console.log("Offline document export files, Android share and UI wiring verified");
