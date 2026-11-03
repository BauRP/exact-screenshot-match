import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {imageBlobFromBytes} from "../src/lib/image-files";
function png(w=64,h=64){
 const b=new Uint8Array(45);b.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
 const u32=(off:number,n:number)=>{b[off]=n>>>24;b[off+1]=n>>>16;b[off+2]=n>>>8;b[off+3]=n;};
 u32(16,w);u32(20,h);b[24]=8;b[25]=6;
 b.set([0,0,0,0,73,69,78,68,0,0,0,0],b.length-12);
 return b;
}
assert.equal(imageBlobFromBytes(png()).type,"image/png");
for(const damaged of [new Uint8Array([137,80,78,71,13,10,26,10]),png(0,64),png(30000,2),png(20000,20000),png().subarray(0,33)]){
 assert.throws(()=>imageBlobFromBytes(damaged));
}
const jpg=new Uint8Array([255,216,255,224,0,8,1,2,3,4,5,6,255,217]);
assert.equal(imageBlobFromBytes(jpg).type,"image/jpeg");
assert.throws(()=>imageBlobFromBytes(jpg.slice(0,-2)));
const webp=new Uint8Array(24);
webp.set([82,73,70,70,16,0,0,0,87,69,66,80,86,80,56,76,4,0,0,0,1,2,3,4]);
assert.equal(imageBlobFromBytes(webp).type,"image/webp");
assert.throws(()=>imageBlobFromBytes(webp.slice(0,20)));
const backup=readFileSync("src/lib/local-backup.ts","utf8");
const staging=backup.indexOf("await validateFullBackup(await readStored(STAGING_FILE))");
const publish=backup.indexOf("await Filesystem.writeFile({ path: BACKUP_FILE");
assert.ok(staging>=0&&publish>staging,"Validate pending backup before overwriting active");
console.log("Binary image-container validation and staged backup integrity passed");
