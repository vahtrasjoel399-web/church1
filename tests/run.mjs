import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'church-tests-'));
try{await build({stdin:{contents:"import './tests/core.test.ts'; import './tests/live.test.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:join(dir,'test.mjs'),logLevel:'silent'});const result=spawnSync(process.execPath,['--test',join(dir,'test.mjs')],{stdio:'inherit'});process.exitCode=result.status??1;}finally{rmSync(dir,{recursive:true,force:true});}
