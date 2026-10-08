export type Settings = {fontSize:number; color:string; background:string; transparent:boolean; position:'bottom'|'center'|'top'; margin:number; lines:number; clearSeconds:number; glossary:string; topic:string; names:string; cleanInput:boolean; budget:number; claudeModel:ClaudeModel; claudeEffort:ClaudeEffort};
export const CLAUDE_MODELS=['claude-haiku-4-5','claude-sonnet-5-5','claude-opus-5-5','claude-fable-5-1'] as const;
export type ClaudeModel=typeof CLAUDE_MODELS[number];
/** xhigh and max are left out: they routinely exceed the 12-second budget for one live phrase. */
export const CLAUDE_EFFORTS=['low','medium','high'] as const;
export type ClaudeEffort=typeof CLAUDE_EFFORTS[number];
export const defaults:Settings = {fontSize:58,color:'#ffffff',background:'#000000',transparent:true,position:'bottom',margin:7,lines:3,clearSeconds:12,glossary:'благодать = grace\nспасение = salvation\nпокаяние = repentance\nСвятой Дух = Holy Spirit\nЕвангелие от Иоанна = Gospel of John\nПослание к Римлянам = Romans',topic:'',names:'',cleanInput:true,budget:5,claudeModel:'claude-haiku-4-5',claudeEffort:'low'};
export function sanitizeSettings(s:Partial<Settings>):Settings {
 const n=(v:unknown,f:number,a:number,b:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(a,Math.min(b,v)):f;
 const color=(v:unknown,f:string)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:f;
 return {fontSize:n(s.fontSize,58,32,96),color:color(s.color,'#ffffff'),background:color(s.background,'#000000'),transparent:typeof s.transparent==='boolean'?s.transparent:true,position:['bottom','center','top'].includes(s.position||'')?s.position!:'bottom',margin:n(s.margin,7,3,18),lines:Math.round(n(s.lines,3,1,4)),clearSeconds:n(s.clearSeconds,12,4,60),glossary:String(s.glossary??defaults.glossary).slice(0,6000),topic:String(s.topic??'').slice(0,500),names:String(s.names??'').slice(0,1000),cleanInput:typeof s.cleanInput==='boolean'?s.cleanInput:true,budget:n(s.budget,5,.1,100),claudeModel:CLAUDE_MODELS.includes(s.claudeModel as ClaudeModel)?s.claudeModel!:'claude-haiku-4-5',claudeEffort:CLAUDE_EFFORTS.includes(s.claudeEffort as ClaudeEffort)?s.claudeEffort!:'low'};
}
export function publicSettings(s:Settings){const {fontSize,color,background,transparent,position,margin,lines,clearSeconds}=s;return {fontSize,color,background,transparent,position,margin,lines,clearSeconds};}
export function percentile(values:number[],q:number){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(q*sorted.length)-1)];}
