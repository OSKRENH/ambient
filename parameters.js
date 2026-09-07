export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const norm=v=>clamp(Number(v)||0,0,127)/127;
export const hz=v=>40*Math.pow(450,norm(v));
export const semitones=v=>(clamp(Number(v)||0,0,127)-64)*24/64;
export const grainSeconds=v=>.02*Math.pow(75,norm(v));
export const intervalSeconds=v=>.012*Math.pow(80,norm(v));
export const defaults={amplitude:88,granular_grain_size:80,granular_pitch:64,granular_speed:25,granular_randomness:38,granular_random_pitch:8,granular_random_pitch_quantise:42,random_panning:87,trigger_time:23,filter_cutoff:101,filter_resonance:14,filter_type:0,delay_time:71,delay_feedback:64,delay_filter:92,delay_mix:36,reverb_damping:65,reverb_early:45,reverb_mix:74,reverb_roomsize:84,reverb_tail:84,reverb_time:77,pitchshift_1:96,pitchshift_mix_1:32,pitchshift_2:32,pitchshift_mix_2:22,pitchshift_3:83,pitchshift_mix_3:0,amplitude_envelope:[1000,0,1,0,0,0,220,1,0,600,1,0,1000,0,0]};
export function sanitize(values){
 const result={...defaults};
 for(const k of Object.keys(defaults)){
  if(k==='amplitude_envelope'){
   const a=values?.[k];
   if(Array.isArray(a)&&a.length>=9&&a.length<=60&&a.every(Number.isFinite))result[k]=a.slice();
  } else if(Number.isFinite(values?.[k]))result[k]=clamp(values[k],0,127);
 }
 return result;
}
export function envelopePoints(raw){
 const points=[];
 for(let i=3;i+1<raw.length;i+=3)points.push([clamp(raw[i]/1000,0,1),clamp(raw[i+1],0,1)]);
 points.sort((a,b)=>a[0]-b[0]);
 return points.length>=2?points:[[0,0],[.25,1],[.75,1],[1,0]];
}
export function encodeWav(chunks,sampleRate){
 const frames=chunks.reduce((sum,c)=>sum+c[0].length,0);
 const buffer=new ArrayBuffer(44+frames*4),v=new DataView(buffer);
 const str=(offset,s)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};
 str(0,'RIFF');v.setUint32(4,36+frames*4,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,frames*4,true);
 let offset=44;
 for(const [left,right]of chunks)for(let i=0;i<left.length;i++)for(const channel of [left,right]){const s=clamp(channel[i],-1,1);v.setInt16(offset,Math.round(s*(s<0?32768:32767)),true);offset+=2;}
 return buffer;
}
