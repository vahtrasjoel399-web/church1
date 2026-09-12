import {spawnSync} from 'node:child_process';
// Wrangler records applied migrations, so this is safe to repeat.
const r=spawnSync('node_modules/.bin/wrangler',['d1','migrations','apply','DB','--local','--config','wrangler.local.json'],{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}});process.exit(r.status??1);
