import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioChunks} from '../lib/audio-chunks';
import {TranscriptOrder} from '../lib/core';

test('continuous speech yields ordered translatable fragments without a speech_stopped event',()=>{
 const chunks=new AudioChunks();const order=new TranscriptOrder();const translated:string[]=[];
 chunks.handle({type:'input_audio_buffer.speech_started'},0);
 for(let i=1;i<=20;i++){
  let commits=0;
  chunks.tick(i*3100,event=>{
   assert.equal(event.type,'input_audio_buffer.commit');commits++;
   chunks.handle({type:'input_audio_buffer.committed'},i*3100);
   order.handle({type:'input_audio_buffer.committed',item_id:String(i),previous_item_id:i===1?null:String(i-1)},i*3100);
   const result=order.handle({type:'conversation.item.input_audio_transcription.completed',item_id:String(i),transcript:`фрагмент ${i}`},i*3100+100);
   translated.push(...result.ready.map(x=>x.source));
   assert.equal(result.ready[0].endedAt,i*3100);
  });
  assert.equal(commits,1);
 }
 assert.deepEqual(translated,Array.from({length:20},(_,i)=>`фрагмент ${i+1}`));
 assert.equal(order.oldest,null);
});
test('silence sends no commits; natural pause flush resets the deadline',()=>{
 const chunks=new AudioChunks();let calls=0;const send=()=>{calls++;};
 chunks.tick(30000,send);assert.equal(calls,0);
 chunks.handle({type:'input_audio_buffer.speech_started'},30000);
 chunks.tick(32999,send);assert.equal(calls,0);
 chunks.handle({type:'input_audio_buffer.speech_stopped'},32000);
 chunks.handle({type:'input_audio_buffer.committed'},32000);
 chunks.tick(40000,send);assert.equal(calls,0);
 chunks.handle({type:'input_audio_buffer.speech_started'},41000);
 chunks.tick(43999,send);assert.equal(calls,0);chunks.tick(44000,send);assert.equal(calls,1);
});
test('unacknowledged commit is bounded and not repeatedly sent',()=>{
 const chunks=new AudioChunks();let calls=0;chunks.handle({type:'input_audio_buffer.speech_started'},0);
 chunks.tick(3000,()=>calls++);chunks.tick(6000,()=>calls++);assert.equal(calls,1);
 assert.throws(()=>chunks.tick(13001,()=>calls++),/10 секунд/);
 chunks.reset();chunks.tick(20000,()=>calls++);assert.equal(calls,1);
});
test('only correlated empty-buffer errors from a VAD race are recoverable',()=>{
 const chunks=new AudioChunks();let id='';chunks.handle({type:'input_audio_buffer.speech_started'},0);
 chunks.tick(3000,event=>{id=event.event_id;});
 chunks.handle({type:'input_audio_buffer.speech_stopped'},3010);
 chunks.handle({type:'input_audio_buffer.committed'},3020);
 assert.equal(chunks.handle({type:'error',error:{code:'input_audio_buffer_commit_empty',event_id:id}},3030),true);
 assert.equal(chunks.handle({type:'error',error:{code:'input_audio_buffer_commit_empty',event_id:'other'}},3040),false);
 assert.equal(chunks.handle({type:'error',error:{code:'invalid_api_key',event_id:id}},3040),false);
 chunks.tick(7000,()=>assert.fail('silence must not be committed'));
});
test('speech-start metadata cannot leave a phantom item after manual commit uses another id',()=>{
 const order=new TranscriptOrder();order.handle({type:'input_audio_buffer.speech_started',item_id:'vad-id'},0);
 order.handle({type:'input_audio_buffer.committed',item_id:'manual-id'},3000);
 assert.equal(order.handle({type:'conversation.item.input_audio_transcription.completed',item_id:'manual-id',transcript:'текст'},3100).ready.length,1);
 assert.equal(order.oldest,null);
});
