import {defaults,norm,hz} from './parameters.js';

export class AmbientEngine{
 constructor(){this.p={...defaults};this.onPosition=()=>{};this.onRecord=()=>{};this.onState=()=>{};this.buffer=null;this.position=0;this.active=false;this.recording=false;this.chunks=[];}
 async init(){
  if(this.ctx)return;
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)throw new Error('В этом браузере нет Web Audio. Откройте приложение в современном браузере.');
  const ctx=new AC({latencyHint:'playback'});
  // Unlock synchronously from the initiating user gesture, including on iOS.
  const unlocking=ctx.resume();
  try{await ctx.audioWorklet.addModule(new URL('./granulator.js',import.meta.url));}catch(e){await ctx.close();throw new Error('Не удалось запустить аудиодвижок. Попробуйте обновить страницу или другой браузер.');}
  await unlocking;this.ctx=ctx;
  ctx.onstatechange=()=>this.onState(ctx.state);
  this.gran=new AudioWorkletNode(ctx,'ambient-granulator',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
  this.gran.port.onmessage=({data})=>{if(data.type==='position'){this.position=data.value;this.onPosition(data.value,data.grains);}};
  this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';
  this.dry=ctx.createGain();this.delay=ctx.createDelay(4);this.delayTone=ctx.createBiquadFilter();this.delayTone.type='lowpass';this.feedback=ctx.createGain();this.delayMix=ctx.createGain();this.bus=ctx.createGain();
  this.revDry=ctx.createGain();this.convolver=ctx.createConvolver();this.revTone=ctx.createBiquadFilter();this.revTone.type='lowpass';this.revMix=ctx.createGain();
  this.early=ctx.createDelay(.3);this.earlyMix=ctx.createGain();this.master=ctx.createGain();
  this.limiter=ctx.createDynamicsCompressor();Object.assign(this.limiter.threshold,{value:-7});this.limiter.knee.value=3;this.limiter.ratio.value=20;this.limiter.attack.value=.003;this.limiter.release.value=.15;
  this.safety=ctx.createWaveShaper();const curve=new Float32Array(4097);for(let i=0;i<curve.length;i++){const v=i/(curve.length-1)*2-1;curve[i]=Math.tanh(v*1.15)*.9;}this.safety.curve=curve;this.safety.oversample='2x';
  this.analyser=ctx.createAnalyser();this.analyser.fftSize=1024;
  this.rec=new AudioWorkletNode(ctx,'ambient-recorder',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
  this.rec.port.onmessage=({data})=>{if(data.type==='chunk')this.chunks.push(data.channels);if(data.type==='done'){this.recording=false;this.onRecord(this.chunks,ctx.sampleRate);this.chunks=[];}};
  this.gran.connect(this.filter);this.filter.connect(this.dry).connect(this.bus);this.filter.connect(this.delay);this.delay.connect(this.delayTone);this.delayTone.connect(this.feedback).connect(this.delay);this.delayTone.connect(this.delayMix).connect(this.bus);
  this.bus.connect(this.revDry).connect(this.master);this.bus.connect(this.convolver).connect(this.revTone).connect(this.revMix).connect(this.master);this.bus.connect(this.early).connect(this.earlyMix).connect(this.master);
  this.master.connect(this.limiter).connect(this.safety).connect(this.analyser).connect(this.rec).connect(ctx.destination);
  this.setParams(this.p,true);if(this.buffer)this.sendSource();
 }
 sendSource(){const channels=Array.from({length:Math.min(2,this.buffer.numberOfChannels)},(_,i)=>this.buffer.getChannelData(i).slice());this.gran.port.postMessage({type:'source',channels,sampleRate:this.buffer.sampleRate},channels.map(x=>x.buffer));this.gran.port.postMessage({type:'seek',value:this.position});}
 setBuffer(buffer){this.buffer=buffer;this.position=0;if(this.ctx)this.sendSource();}
 setParams(p,force=false){const old=this.p;this.p={...p};if(!this.ctx)return;const t=this.ctx.currentTime,smooth=(param,val)=>param.setTargetAtTime(val,t,.06);
  this.gran.port.postMessage({type:'params',values:this.p});
  this.filter.type=p.filter_type<43?'lowpass':p.filter_type<85?'bandpass':'highpass';smooth(this.filter.frequency,hz(p.filter_cutoff));smooth(this.filter.Q,.15+norm(p.filter_resonance)*10);
  const mix=norm(p.delay_mix);smooth(this.dry.gain,1-mix*.45);smooth(this.delayMix.gain,mix*.7);smooth(this.delay.delayTime,.035+norm(p.delay_time)**2*2.3);smooth(this.delayTone.frequency,hz(p.delay_filter));smooth(this.feedback.gain,norm(p.delay_feedback)*.84);
  const rev=norm(p.reverb_mix);smooth(this.revDry.gain,1-rev*.65);smooth(this.revMix.gain,rev*1.1);smooth(this.revTone.frequency,18000*Math.pow(.035,norm(p.reverb_damping)));smooth(this.master.gain,norm(p.amplitude)*1.3);smooth(this.early.delayTime,.012+norm(p.reverb_roomsize)*.13);smooth(this.earlyMix.gain,norm(p.reverb_early)*rev*.3);
  if(force||['reverb_time','reverb_roomsize','reverb_tail'].some(k=>old[k]!==p[k])){clearTimeout(this.revTimer);this.revTimer=setTimeout(()=>this.updateImpulse(),150);}
 }
 updateImpulse(){const ctx=this.ctx;if(!ctx)return;const p=this.p,duration=.4+norm(p.reverb_time)*9,length=Math.ceil(ctx.sampleRate*duration),buffer=ctx.createBuffer(2,length,ctx.sampleRate);let seed=7781;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296*2-1;};const decay=2+norm(p.reverb_tail)*3;for(let ch=0;ch<2;ch++){const d=buffer.getChannelData(ch);for(let i=0;i<length;i++){const x=i/length,attack=Math.min(1,i/(ctx.sampleRate*(.004+norm(p.reverb_roomsize)*.045)));d[i]=rand()*Math.pow(1-x,decay)*attack;}}this.convolver.buffer=buffer;}
 async play(){await this.init();if(!this.buffer)throw new Error('Сначала загрузите аудио.');await this.ctx.resume();this.gran.port.postMessage({type:'play',value:true});this.active=true;}
 async pause(){if(!this.ctx)return;if(this.recording)await this.stopRecording();await this.ctx.suspend();this.active=false;}
 seek(value){this.position=Math.max(0,Math.min(.999999,value));this.gran?.port.postMessage({type:'seek',value:this.position});}
 async stop(){this.position=0;if(!this.ctx){this.onPosition(0,0);return;}if(this.recording)await this.stopRecording();this.active=false;clearTimeout(this.revTimer);const old=this.ctx;this.ctx=null;await old.close();this.position=0;this.onPosition(0,0);}
 async startRecording(){await this.play();this.chunks=[];this.recording=true;this.rec.port.postMessage({type:'start'});}
 async stopRecording(){if(!this.recording)return;await this.ctx.resume();return new Promise(resolve=>{const saved=this.onRecord;this.onRecord=(chunks,rate)=>{this.onRecord=saved;saved(chunks,rate);resolve();};this.rec.port.postMessage({type:'stop'});});}
}

export function makeDemo(ctx){
 const rate=ctx.sampleRate,seconds=24,b=ctx.createBuffer(2,rate*seconds,rate);
 let seed=144;const random=()=>{seed=Math.imul(seed,1664525)+1013904223|0;return(seed>>>0)/4294967296-.5;};
 const notes=[130.8128,195.9977,246.9417,293.6648,391.9954,329.6276,261.6256,440];
 for(let ch=0;ch<2;ch++){const a=b.getChannelData(ch);for(let i=0;i<a.length;i++){const t=i/rate;let s=0;for(let n=0;n<notes.length;n++){const age=t-n*2.65;if(age<0)continue;const f=notes[n]*(1+(ch?1:-1)*.0008);const env=(1-Math.exp(-age*9))*Math.exp(-age*.57);s+=env*(Math.sin(2*Math.PI*f*age)*.28+Math.sin(2*Math.PI*f*2.003*age)*.10*Math.exp(-age)+Math.sin(2*Math.PI*f*3.99*age)*.035*Math.exp(-age*2));}a[i]=(s+random()*.001)*Math.min(1,(seconds-t)/1.5);}}
 return b;
}
