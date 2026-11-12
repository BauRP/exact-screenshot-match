import {strict as assert} from "node:assert";
import {loadNewestValidatedBackup,orderedBackupCandidates} from "../src/lib/backup-candidate";
import {readFileSync} from "node:fs";
const active="WaveNotes.backup",stage="WaveNotes.backup.pending";
assert.deepEqual(orderedBackupCandidates([{path:stage,mtime:100},{path:active,mtime:200}]).map(c=>c.path),[active,stage],"Old staging must not override newer active");
assert.deepEqual(orderedBackupCandidates([{path:stage,mtime:300},{path:active,mtime:200}]).map(c=>c.path),[stage,active],"Interrupted new save should be recoverable");
assert.deepEqual(orderedBackupCandidates([{path:stage,mtime:200},{path:active,mtime:200}]).map(c=>c.path),[active,stage],"Tie should choose published copy");
assert.deepEqual(orderedBackupCandidates([{path:stage},{path:active}]).map(c=>c.path),[active,stage],"Missing timestamps should choose published copy");
assert.deepEqual(orderedBackupCandidates([{path:stage,mtime:NaN},{path:active,mtime:5}]).map(c=>c.path),[active,stage],"Invalid timestamps cannot win");
const cases=[
 {active:{valid:true,id:"new"},stage:{valid:true,id:"stale"},a:30,s:20,expected:"new",tried:["new"]},
 {active:{valid:true,id:"old"},stage:{valid:true,id:"new"},a:20,s:30,expected:"new",tried:["new"]},
 {active:{valid:false,id:"bad"},stage:{valid:true,id:"recover"},a:30,s:20,expected:"recover",tried:["bad","recover"]},
 {active:{valid:true,id:"recover"},stage:{valid:false,id:"damaged"},a:20,s:30,expected:"recover",tried:["damaged","recover"]},
] as const;
for(const t of cases){
 const attempted:string[]=[];
 const paths=[{path:active,mtime:t.a},{path:stage,mtime:t.s}];
 const value=await loadNewestValidatedBackup(
  paths,async(path)=>{const data=path===active?t.active:t.stage;attempted.push(data.id);return data;},
  async(item)=>{if(!item.valid)throw Error("corrupted ZIP");}
 );
 assert.equal(value?.id,t.expected);
 assert.deepEqual(attempted,t.tried);
}
assert.equal(await loadNewestValidatedBackup([],async()=>{throw Error("must not read");},async()=>{}),null);
await assert.rejects(loadNewestValidatedBackup(
 [{path:stage,mtime:10},{path:active,mtime:20}],
 async()=>({valid:false}),async()=>{throw Error("invalid ZIP");}
),/повреждена/);
const backupSource=readFileSync("src/lib/local-backup.ts","utf8");
const fullSource=readFileSync("src/lib/backup.ts","utf8");
assert.ok(backupSource.includes('loadNewestValidatedBackup('));
assert.ok(backupSource.includes('candidates.push({path,mtime:stat.mtime})'));
const stageValidated=backupSource.indexOf('await validateFullBackup(await readStored(STAGING_FILE))');
const publish=backupSource.indexOf('await Filesystem.writeFile({ path: BACKUP_FILE');
assert.ok(stageValidated>=0&&publish>stageValidated,"Never overwrite active before validating pending snapshot");
assert.ok(fullSource.indexOf("touchedFolders=true;")<fullSource.indexOf("restoreFolderBackup(manifest.folders, manifest.hiddenSystem);"));
console.log("Backup selection: newer verified copy wins, corrupt stage falls back, failed cleanup cannot invalidate save");
