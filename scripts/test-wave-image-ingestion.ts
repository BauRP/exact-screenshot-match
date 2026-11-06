import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const importer=readFileSync("src/lib/note-image-import.ts","utf8");
const editor=readFileSync("src/routes/editor.$id.tsx","utf8");
for(const marker of ["verifiedNoteImage","imageBlobFromBytes(bytes)","Camera.getPhoto","CameraSource.Camera","CameraResultType.Uri","clipboardImage","droppedImage"])assert.ok(importer.includes(marker),marker);
for(const marker of ["enqueueImageRef.current?.","handlePaste(_view,event)","handleDrop(_view,event)","pendingImagesRef","await Promise.allSettled([...pendingImagesRef.current])","imageSessionRef.current=false","addCameraImage","Сфотографировать для заметки"])assert.ok(editor.includes(marker),marker);
assert.ok(!importer.includes("correctOrientation:true"),"Camera options must follow installed Capacitor API");
console.log("Camera, clipboard and drop attachment wiring checked");
