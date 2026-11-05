// Executes the exact dependency-free filesystem helper and its tests from capture.rs.
// This does not replace cargo check or validate Tauri/Windows integration.
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const source=readFileSync('src-tauri/src/capture.rs','utf8').split('// CAPTURE-DELETE-PURE-BEGIN')[1].split('// CAPTURE-DELETE-PURE-END')[0];
const dir=mkdtempSync(join(tmpdir(),'capture-delete-')),file=join(dir,'test.rs'),binary=join(dir,'test');writeFileSync(file,source);
for(const [cmd,args] of [[process.env.RUSTC||'rustc',['--edition=2021','--test',file,'-o',binary]],[binary,['--nocapture']]]){
 const r=spawnSync(cmd,args,{encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);
}
