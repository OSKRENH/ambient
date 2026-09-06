import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTime,parseYouTube,clipRequest,formatTime} from '../dist/youtube.js';
import worker from '../server/worker.js';

test('YouTube URL formats, start hints and strict host allowlist',()=>{
 for(const url of ['https://youtu.be/BaW_jenozKc?t=1m30s','https://www.youtube.com/watch?v=BaW_jenozKc&t=90','https://m.youtube.com/shorts/BaW_jenozKc?start=90'])assert.deepEqual(parseYouTube(url),{id:'BaW_jenozKc',url:'https://www.youtube.com/watch?v=BaW_jenozKc',start:90});
 for(const url of ['https://youtube.com.evil.com/watch?v=BaW_jenozKc','file:///tmp/a','https://youtube.com@evil.com/watch?v=BaW_jenozKc','https://www.youtube.com/playlist?list=test','https://youtu.be/BaW_jenozKc/x'])assert.throws(()=>parseYouTube(url));
});
test('fractional timestamps and clip boundaries',()=>{
 assert.equal(parseTime('01:02:30.125'),3750.125);assert.equal(parseTime('90,5'),90.5);assert.equal(formatTime(90),'1:30');assert.equal(formatTime(3605.25),'1:00:05.25');
 for(const value of ['-1','1:60','1:2:60','Infinity',''])assert.throws(()=>parseTime(value));
 const url='https://youtu.be/BaW_jenozKc';assert.equal(clipRequest(url,'0','120').end,120);for(const [s,e]of [['1','1'],['0','121'],['86400','86401']])assert.throws(()=>clipRequest(url,s,e));
});
test('Worker stays unavailable without runtime config and rejects invalid paths and cross-origin writes',async()=>{
 const base='https://ambient.example';
 const r=await worker.fetch(new Request(base+'/api/youtube/capabilities'),{});assert.deepEqual(await r.json(),{available:false});
 assert.equal((await worker.fetch(new Request(base+'/api/youtube/jobs',{method:'POST'}),{})).status,503);
 assert.equal((await worker.fetch(new Request(base+'/api/youtube/anything'),{})).status,404);
 assert.equal((await worker.fetch(new Request(base+'/api/youtube/jobs',{method:'POST',headers:{Origin:'https://other.example'}}),{})).status,403);
});
test('Worker adds token only upstream and forwards bounded requests',async()=>{
 const original=globalThis.fetch;let sent;
 globalThis.fetch=async(url,options)=>{sent={url:String(url),options};return new Response('{"id":"abc"}',{status:202,headers:{'Content-Type':'application/json'}});};
 try{const env={YOUTUBE_IMPORT_URL:'https://clip.example',YOUTUBE_IMPORT_TOKEN:'secret-in-test'};
  const response=await worker.fetch(new Request('https://ambient.example/api/youtube/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"start":0}'}),env);
  assert.equal(response.status,202);assert.equal(sent.url,'https://clip.example/api/youtube/jobs');assert.equal(sent.options.headers.Authorization,'Bearer secret-in-test');assert.equal(response.headers.get('Authorization'),null);
  assert.equal((await worker.fetch(new Request('https://ambient.example/api/youtube/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(4097)}),env)).status,413);
 }finally{globalThis.fetch=original;}
});
