const nativeFetch=window.fetch.bind(window);
const presetsUrl=new URL('./presets.json',import.meta.url).href;
window.fetch=(input,init)=>{
  if(typeof input==='string'&&(input==='./presets.json'||input.endsWith('/presets.json'))) return nativeFetch(presetsUrl,init);
  return nativeFetch(input,init);
};
await import('./trim.js');
await import('./app.js');
