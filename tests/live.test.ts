import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveSession} from '../lib/live';
import {defaults} from '../lib/settings';

await test('stopping while audio resumes never starts a server session', async () => {
 let resume!:()=>void;
 let requests=0;
 let stopped=0;
 const track={stop(){stopped++;},onended:null};
 const globals={navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),AudioContext:Object.getOwnPropertyDescriptor(globalThis,'AudioContext'),window:Object.getOwnPropertyDescriptor(globalThis,'window'),cancelAnimationFrame:Object.getOwnPropertyDescriptor(globalThis,'cancelAnimationFrame'),fetch:Object.getOwnPropertyDescriptor(globalThis,'fetch')};
 try {
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}}});
  Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:class {resume(){return new Promise<void>(resolve=>{resume=resolve;});}async close(){}}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{removeEventListener(){}}});
  Object.defineProperty(globalThis,'cancelAnimationFrame',{configurable:true,value:()=>{}});
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:()=>{requests++;throw new Error('Unexpected network request');}});
  const live=new LiveSession(()=>{});
  const starting=live.start('',defaults);
  await Promise.resolve();
  await live.stop();
  resume();
  await starting;
  assert.equal(requests,0);
  assert.equal(stopped,1);
 } finally {
  for(const [name,descriptor] of Object.entries(globals)) {
   if(descriptor)Object.defineProperty(globalThis,name,descriptor);
   else Reflect.deleteProperty(globalThis,name);
  }
 }
});
