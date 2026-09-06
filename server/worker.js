// Compiled with static assets by build_worker.py; secrets are runtime-only.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/youtube/')){
   const path=url.pathname.slice('/api/youtube'.length);
   if(!/^\/(?:capabilities|jobs(?:\/[a-f0-9]{32}(?:\/audio)?)?)$/.test(path))return json({error:'Не найдено.'},404);
   const allowed=path==='/capabilities'?['GET']:path==='/jobs'?['POST']:path.endsWith('/audio')?['GET']:['GET','DELETE'];
   if(!allowed.includes(request.method))return json({error:'Метод не поддерживается.'},405);
   if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Запрос отклонён.'},403);
   if(!env.YOUTUBE_IMPORT_URL||!env.YOUTUBE_IMPORT_TOKEN)return path==='/capabilities'?json({available:false}):json({error:'Импорт YouTube ещё не подключён.'},503);
   let base;try{base=new URL(env.YOUTUBE_IMPORT_URL);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw Error();}catch{return json({error:'Сервис импорта настроен неверно.'},503);}
   let body;if(request.method==='POST'){
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Ожидается JSON.'},415);
    const reader=request.body?.getReader();if(!reader)return json({error:'Пустой запрос.'},400);const chunks=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return json({error:'Запрос слишком большой.'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}body=bytes;
   }
   try{
    const upstream=await fetch(new URL('/api/youtube'+path,base),{method:request.method,body,headers:{'Authorization':'Bearer '+env.YOUTUBE_IMPORT_TOKEN,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
    const headers=new Headers({'Content-Type':upstream.headers.get('Content-Type')||'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if(upstream.headers.has('Content-Length'))headers.set('Content-Length',upstream.headers.get('Content-Length'));
    if(path.endsWith('/audio'))headers.set('Content-Disposition','attachment; filename="youtube-clip.wav"');
    return new Response(upstream.body,{status:upstream.status,headers});
   }catch{return json({error:'Не удалось связаться с сервисом импорта. Попробуйте позже.'},502);}
  }
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const key=url.pathname==='/'?'/index.html':url.pathname;
  const asset=ASSETS[key];if(!asset)return new Response('Not found',{status:404});
  return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'}});
 }
};
