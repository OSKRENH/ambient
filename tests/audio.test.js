import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,sanitize,encodeWav,grainSeconds,intervalSeconds} from '../dist/parameters.js';

const registry=new Map();
globalThis.sampleRate=48000;
globalThis.AudioWorkletProcessor=class{constructor(){this.messages=[];this.port={postMessage:message=>this.messages.push(message)};}};
globalThis.registerProcessor=(name,implementation)=>registry.set(name,implementation);
await import('../dist/granulator.js');
const Granulator=registry.get('ambient-granulator'),Recorder=registry.get('ambient-recorder');
const send=(p,data)=>p.port.onmessage({data});
function source(length=48000){return Float32Array.from({length},(_,i)=>Math.sin(i*2*Math.PI*220/48000)*.4);}
function render(p,blocks=100){let peak=0,energy=0,count=0;for(let b=0;b<blocks;b++){const out=[new Float32Array(128),new Float32Array(128)];p.process([],[out]);for(const c of out)for(const value of c){assert.ok(Number.isFinite(value),'audio must be finite');peak=Math.max(peak,Math.abs(value));energy+=value*value;count++;}}return{peak,rms:Math.sqrt(energy/count)};}

test('all 18 imported presets generate bounded non-silent audio',()=>{
 const presets=JSON.parse(fs.readFileSync(new URL('../dist/presets.json',import.meta.url)));
 assert.equal(presets.length,18);
 for(const preset of presets){const p=new Granulator();send(p,{type:'source',channels:[source()],sampleRate:48000});send(p,{type:'params',values:preset.values});send(p,{type:'play',value:true});const result=render(p,250);assert.ok(result.rms>.000001,preset.name+' must produce audio');assert.ok(result.peak<1,preset.name+' must remain bounded');assert.ok(p.grains.length<=192);}
});
test('extreme density, pitch layers, short sources and stereo interpolation stay finite',()=>{
 const p=new Granulator();const values={...defaults,granular_grain_size:127,trigger_time:0,granular_pitch:127,granular_random_pitch:127,pitchshift_mix_1:127,pitchshift_mix_2:127,pitchshift_mix_3:127};send(p,{type:'source',channels:[source(13),source(13)],sampleRate:44100});send(p,{type:'params',values});send(p,{type:'play',value:true});const result=render(p,700);assert.ok(result.peak<1);assert.ok(p.grains.length<=192);assert.ok(p.position>=0&&p.position<13);
});
test('pause is silent, reset rewinds, zero-speed freezes and seek moves read position',()=>{
 const p=new Granulator();send(p,{type:'source',channels:[source()],sampleRate:48000});send(p,{type:'params',values:{...defaults,granular_speed:0}});send(p,{type:'seek',value:.5});send(p,{type:'play',value:true});render(p);assert.equal(p.position,24000);send(p,{type:'play',value:false});assert.equal(render(p).peak,0);send(p,{type:'reset'});assert.equal(p.position,0);assert.equal(p.grains.length,0);
});
test('non-numeric settings are rejected and parameters have safe ranges',()=>{
 const p=sanitize({granular_pitch:Infinity,filter_resonance:128,delay_feedback:-10,amplitude_envelope:[NaN]});assert.equal(p.granular_pitch,64);assert.equal(p.filter_resonance,127);assert.equal(p.delay_feedback,0);assert.deepEqual(p.amplitude_envelope,defaults.amplitude_envelope);assert.equal(grainSeconds(0),.02);assert.equal(grainSeconds(127),1.5);assert.equal(intervalSeconds(127),.96);
});
test('recorder preserves stereo samples, flushes final partial chunk and WAV has exact header',()=>{
 const p=new Recorder();send(p,{type:'start'});let expected=0;
 for(let i=0;i<35;i++){const channels=[new Float32Array(128).fill(.25),new Float32Array(128).fill(-.5)];p.process([channels],[[new Float32Array(128),new Float32Array(128)]]);expected+=128;}
 send(p,{type:'stop'});const chunks=p.messages.filter(m=>m.type==='chunk').map(m=>m.channels);assert.equal(chunks.reduce((s,c)=>s+c[0].length,0),expected);assert.equal(p.messages.at(-1).type,'done');assert.equal(p.messages.at(-1).frames,expected);const wav=encodeWav(chunks,48000),view=new DataView(wav);assert.equal(new TextDecoder().decode(wav.slice(0,4)),'RIFF');assert.equal(view.getUint16(22,true),2);assert.equal(view.getUint32(24,true),48000);assert.equal(view.getUint32(40,true),expected*4);assert.equal(wav.byteLength,44+expected*4);assert.equal(view.getInt16(44,true),8192);assert.equal(view.getInt16(46,true),-16384);
});
test('recording stops exactly at five minutes, including partial final block',()=>{
 const p=new Recorder();send(p,{type:'start'});p.frames=48000*300-50;p.process([[new Float32Array(128),new Float32Array(128)]],[[new Float32Array(128),new Float32Array(128)]]);assert.equal(p.active,false);assert.equal(p.messages.at(-1).frames,48000*300);assert.equal(p.messages[0].channels[0].length,50);
});
