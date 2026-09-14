export type SpeechItem={id:string;previous:string|null;source:string;endedAt:number|null;receivedAt:number};
/** Reconcile final text against committed item order, never completion arrival order. */
export type TranscriptEvent={event_id?:string;type?:string;item_id?:string;previous_item_id?:string|null;delta?:string;transcript?:string};
export class TranscriptOrder {
 private order:string[]=[];private items=new Map<string,SpeechItem>();private finals=new Set<string>();private events=new Set<string>();private done=new Set<string>();private tails=new Map<string,string>();
 reset(){this.order=[];this.items.clear();this.finals.clear();this.events.clear();this.done.clear();this.tails.clear();}
 handle(e:TranscriptEvent,now:number):{partial?:string;ready:SpeechItem[]} {
  if(e.event_id){if(this.events.has(e.event_id))return {ready:[]};this.events.add(e.event_id);if(this.events.size>4096)this.events.delete(this.events.values().next().value!);}
  if(!['input_audio_buffer.speech_stopped','input_audio_buffer.committed','conversation.item.input_audio_transcription.delta','conversation.item.input_audio_transcription.completed'].includes(e.type||''))return {ready:[]};
  const id=e.item_id;if(!id||this.done.has(id))return {ready:[]};let item=this.items.get(id);if(!item){item={id,previous:null,source:'',endedAt:null,receivedAt:now};this.items.set(id,item);}let partial:string|undefined;
  if(e.type==='input_audio_buffer.speech_stopped')item.endedAt=now-450;
  if(e.type==='input_audio_buffer.committed'){item.endedAt??=now;item.previous=e.previous_item_id??null;if(!this.order.includes(id))this.order.push(id);}
  if(e.type==='conversation.item.input_audio_transcription.delta'){const text=(this.tails.get(id)||'')+(e.delta||'');this.tails.set(id,text);partial=text;}
  if(e.type==='conversation.item.input_audio_transcription.completed'){item.source=String(e.transcript??'').trim();this.finals.add(id);this.tails.delete(id);}
  // WebRTC's reliable ordered data channel gives committed events in audio order.
  const ready:SpeechItem[]=[];while(this.order.length&&this.finals.has(this.order[0])){const next=this.order.shift()!;ready.push(this.items.get(next)!);this.done.add(next);this.items.delete(next);this.finals.delete(next);if(this.done.size>4096)this.done.delete(this.done.values().next().value!);}
  if(this.items.size>64)throw new Error('Распознавание не подтверждает фразы. Сеанс остановлен, чтобы не накапливать отставание.');return {partial,ready};
 }
 get oldest(){return this.items.size?Math.min(...Array.from(this.items.values(),x=>x.receivedAt)):null;}
}
/** Split text at punctuation/words, never slice away content. No audio slicing. */
export function splitPhrases(text:string,max=650){const words=text.trim().split(/\s+/);const result:string[]=[];let current='';for(const w of words){if(current&&(current.length+w.length+1>max||(/[.!?;:]$/.test(current)&&current.length>100))){result.push(current);current='';}current+=(current?' ':'')+w;}if(current)result.push(current);return result;}
export function captionPages(text:string,columns:number,lines:number){const pages:string[]=[];let line='',page:string[]=[];const flush=()=>{if(line){page.push(line);line='';}if(page.length>=lines){pages.push(page.join('\n'));page=[];}};for(const word of text.trim().split(/\s+/).filter(Boolean)){let rest=word;while(rest.length>columns){if(line)flush();line=rest.slice(0,columns);rest=rest.slice(columns);flush();}if(line&&line.length+rest.length+1>columns)flush();line+=(line?' ':'')+rest;}if(line)flush();if(page.length)pages.push(page.join('\n'));return pages;}
export function scheduleCaption(text:string,s:{margin:number;fontSize:number;lines:number}){const columns=Math.max(16,Math.floor(1920*(1-s.margin*.02)/(s.fontSize*.69)));const pages=captionPages(text,columns,s.lines);const holdMs=Math.max(2200,(pages.length-1)*3000+Math.max(2200,(pages.at(-1)||'').split(/\s+/).length/3*1000));return {pages,holdMs};}
