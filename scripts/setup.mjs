import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if(!existsSync('.env')){const template=readFileSync('.env.example','utf8');writeFileSync('.env',template.replace('OPERATOR_PASSWORD=','OPERATOR_PASSWORD='+randomBytes(24).toString('base64url')),{mode:0o600});}
writeFileSync('.dev.vars',readFileSync('.env'),{mode:0o600});
console.log('Server settings are in .env. Local development opens without a password. Add API keys there, then run npm run configure again and restart. No AI request was made.');
