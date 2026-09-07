import {norm,semitones,grainSeconds,intervalSeconds,envelopePoints,defaults,sanitize} from './parameters.js';

class Granulator extends AudioWorkletProcessor{
 constructor(){super();this.source=null;this.p={...defaults};this.grains=[];this.position=0;this.countdown=0;this.running=false;this.counter=0;this.envelope=envelopePoints(defaults.amplitude_envelope);this.fade=0;
  this.port.onmessage=({data:d})=>{
   if(d.type==='source'){this.source=d.channels;this.sourceRate=d.sampleRate;this.position=0;this.grains=[];this.countdown=0;}
   if(d.type==='params'){this.p=sanitize(d.values);this.envelope=envelopePoints(this.p.amplitude_envelope);}
   if(d.type==='play'){this.running=d.value;if(!d.value)this.grains=[];this.countdown=0;}
   if(d.type==='seek'){this.position=d.value*(this.source?.[0].length||1);this.grains=[];this.countdown=0;}
   if(d.type==='reset'){this.position=0;this.grains=[];this.countdown=0;this.fade=0;}
  };
 }
 spawn(){
  const p=this.p,src=this.source[0],duration=Math.round(grainSeconds(p.granular_grain_size)*sampleRate);
  let shift=(Math.random()*2-1)*norm(p.granular_random_pitch)*24;
  if(p.granular_random_pitch_quantise>0&&p.granular_random_pitch_quantise<85)shift=Math.round(shift);
  if(p.granular_random_pitch_quantise>=85){const scale=[0,2,4,7,9,12];const oct=Math.floor(shift/12);const pitch=shift-oct*12;shift=oct*12+scale.reduce((a,b)=>Math.abs(b-pitch)<Math.abs(a-pitch)?b:a);}
  const pitch=semitones(p.granular_pitch)+shift;
  const offset=((this.position+(Math.random()-.5)*norm(p.granular_randomness)*src.length)%src.length+src.length)%src.length;
  const pan=(Math.random()*2-1)*norm(p.random_panning);
  const overlap=grainSeconds(p.granular_grain_size)/intervalSeconds(p.trigger_time);
  const normalization=.6/Math.max(1,overlap*.65);
  const layers=[1,2,3].map(i=>({shift:semitones(p['pitchshift_'+i]),gain:norm(p['pitchshift_mix_'+i])}));
  const mix=1+layers.reduce((s,l)=>s+l.gain,0);
  const add=(semitone,gain)=>{
   if(this.grains.length>=192||gain<.002)return;
   this.grains.push({pos:offset,rate:Math.pow(2,semitone/12)*this.sourceRate/sampleRate,age:0,duration,gain:normalization*gain/mix,left:Math.cos((pan+1)*Math.PI/4),right:Math.sin((pan+1)*Math.PI/4)});
  };
  add(pitch,1);for(const layer of layers)add(pitch+layer.shift,layer.gain);
 }
 envelopeAt(phase){
  const a=this.envelope;let y=a[0][1];
  for(let i=1;i<a.length;i++){if(phase<=a[i][0]){const t=Math.max(0,Math.min(1,(phase-a[i-1][0])/Math.max(.00001,a[i][0]-a[i-1][0])));y=a[i-1][1]+(a[i][1]-a[i-1][1])*t;break;}y=a[i][1];}
  return y*Math.min(1,phase*60,(1-phase)*60);
 }
 process(inputs,outputs){
  const out=outputs[0];if(!out?.[0])return true;const left=out[0],right=out[1]||left;
  if(!this.running||!this.source?.[0]?.length)return true;
  const l=this.source[0],r=this.source[1]||l,len=l.length;
  const interval=intervalSeconds(this.p.trigger_time)*sampleRate;
  const speed=this.p.granular_speed/64*this.sourceRate/sampleRate;
  for(let i=0;i<left.length;i++){
   if(this.countdown<=0){this.spawn();this.countdown+=interval;}
   this.countdown--;this.fade=Math.min(1,this.fade+1/(sampleRate*.03));
   let sumL=0,sumR=0;
   for(let j=this.grains.length-1;j>=0;j--){
    const g=this.grains[j];if(g.age>=g.duration){this.grains[j]=this.grains[this.grains.length-1];this.grains.pop();continue;}
    const base=Math.floor(g.pos)%len,next=(base+1)%len,t=g.pos-Math.floor(g.pos),env=this.envelopeAt(g.age/g.duration)*g.gain;
    sumL+=(l[base]+(l[next]-l[base])*t)*env*g.left;
    sumR+=(r[base]+(r[next]-r[base])*t)*env*g.right;
    g.pos=(g.pos+g.rate)%len;g.age++;
   }
   left[i]=sumL*this.fade;right[i]=sumR*this.fade;this.position=(this.position+speed)%len;
  }
  this.counter+=left.length;
  if(this.counter>sampleRate/20){this.port.postMessage({type:'position',value:this.position/len,grains:this.grains.length});this.counter=0;}
  return true;
 }
}
registerProcessor('ambient-granulator',Granulator);

class Recorder extends AudioWorkletProcessor{
 constructor(){super();this.active=false;this.frames=0;this.offset=0;this.buffers=[new Float32Array(4096),new Float32Array(4096)];this.port.onmessage=({data})=>{if(data.type==='start'){this.active=true;this.frames=0;this.offset=0;}if(data.type==='stop'){this.finish();}};}
 flush(){if(!this.offset)return;const channels=this.buffers.map(b=>b.slice(0,this.offset));this.port.postMessage({type:'chunk',channels},channels.map(c=>c.buffer));this.offset=0;}
 finish(){if(!this.active)return;this.active=false;this.flush();this.port.postMessage({type:'done',frames:this.frames});}
 process(inputs,outputs){const input=inputs[0],out=outputs[0];if(!out?.length)return true;for(let ch=0;ch<out.length;ch++){const src=input?.[ch]||input?.[0];if(src)out[ch].set(src);}
  if(this.active){for(let i=0;i<out[0].length;i++){this.buffers[0][this.offset]=out[0][i];this.buffers[1][this.offset]=out[1]?.[i]||0;this.offset++;this.frames++;if(this.offset===4096)this.flush();if(this.frames>=sampleRate*300){this.finish();break;}}}return true;
 }
}
registerProcessor('ambient-recorder',Recorder);
