/** Bound continuous speech without stopping the audio track or clearing buffered speech. */
export const AUDIO_CHUNK_MS=3000;
type AudioEvent={type?:string;error?:{code?:string;event_id?:string}};
export class AudioChunks {
 private speaking=false;
 private boundary=0;
 private pending:{id:string;sent:number}|null=null;
 private sent=new Set<string>();
 reset(){this.speaking=false;this.boundary=0;this.pending=null;this.sent.clear();}
 handle(event:AudioEvent,now:number){
  if(event.type==='input_audio_buffer.speech_started'){this.speaking=true;this.boundary=now;}
  if(event.type==='input_audio_buffer.speech_stopped')this.speaking=false;
  if(event.type==='input_audio_buffer.committed'){this.boundary=now;this.pending=null;}
  // VAD may commit between our timer firing and the server receiving the command.
  const id=event.error?.event_id;
  if(event.type==='error'&&event.error?.code==='input_audio_buffer_commit_empty'&&id&&this.sent.has(id)){
   this.sent.delete(id);if(this.pending?.id===id)this.pending=null;this.boundary=now;return true;
  }
  return false;
 }
 tick(now:number,send:(event:{type:'input_audio_buffer.commit';event_id:string})=>void){
  if(this.pending){if(now-this.pending.sent>10000)throw new Error('AI не подтвердил аудиофрагмент за 10 секунд. Начните новый сеанс.');return;}
  if(!this.speaking||now-this.boundary<AUDIO_CHUNK_MS)return;
  const id=crypto.randomUUID();this.pending={id,sent:now};this.sent.add(id);
  if(this.sent.size>16)this.sent.delete(this.sent.values().next().value!);
  send({type:'input_audio_buffer.commit',event_id:id});
 }
}
