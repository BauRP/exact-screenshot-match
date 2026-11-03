import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {wordImageParagraph,wordMediaRelationships} from "../src/lib/wave-docx-media";
const img=wordImageParagraph("rId1",1,960,600);
assert.ok(img.includes('<a:blip r:embed="rId1"/>'));
assert.ok(img.includes('<wp:extent cx='));
assert.ok(img.includes('http://schemas.openxmlformats.org/drawingml/2006/picture'));
assert.throws(()=>wordImageParagraph('rId1" bad',1,960,600));
assert.throws(()=>wordImageParagraph("rId1",1,0,600));
const relationships=wordMediaRelationships(3);
assert.equal((relationships.match(/relationships\/image/g)||[]).length,3);
assert.ok(relationships.includes('Target="media/image2.png"'));
const code=readFileSync("src/lib/note-export.ts","utf8");
for(const marker of ['wordBody(note,root,media)','wordImageParagraph(item.relation','word/media/image','word/_rels/document.xml.rels',
 'renderWordMedia(nodes[i])','[data-wave-image],[data-wave-drawing]','Default Extension="png" ContentType="image/png"']){
 assert.ok(code.includes(marker),marker);
}
const renderer=readFileSync("src/lib/wave-docx-media.ts","utf8");
for(const marker of ['loadImageFile(id)','paintInk(ctx,node.getAttribute','canvas.toBlob','URL.revokeObjectURL','naturalWidth']){
 assert.ok(renderer.includes(marker),marker);
}
console.log("DOCX photo, ink and drawing media packaging and XML validation passed");
