export function parseTime(value){
 const text=String(value).trim().replace(',','.');
 if(!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(text))throw Error('Укажите время как 1:30, 01:02:30 или число секунд.');
 const parts=text.split(':').map(Number);
 if(parts.slice(1).some(n=>n>=60))throw Error('Минуты и секунды после двоеточия должны быть меньше 60.');
 return parts.reduce((total,n)=>total*60+n,0);
}
export function parseYouTube(value){
 let url;try{url=new URL(value.trim());}catch{throw Error('Вставьте полную ссылку на видео YouTube.');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)throw Error('Нужна обычная ссылка на видео YouTube.');
 const host=url.hostname.toLowerCase(),parts=url.pathname.split('/').filter(Boolean);let id;
 if(host==='youtu.be'&&parts.length===1)id=parts[0];
 if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)){
  if(url.pathname==='/watch')id=url.searchParams.get('v');
  else if(['shorts','live','embed'].includes(parts[0])&&parts.length===2)id=parts[1];
 }
 if(!/^[\w-]{11}$/.test(id||''))throw Error('Нужна ссылка на отдельное видео YouTube, а не канал или плейлист.');
 const hint=url.searchParams.get('t')||url.searchParams.get('start');let start=0;
 if(hint){if(/^\d+$/.test(hint))start=Number(hint);else{const m=hint.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);if(m)start=Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0);}}
 return{id,url:'https://www.youtube.com/watch?v='+id,start};
}
export function clipRequest(url,start,end){const video=parseYouTube(url);const from=parseTime(start),to=parseTime(end);if(from<0||to-from<.1||to-from>120||to>86400)throw Error('Выберите отрезок от 0,1 до 120 секунд. Конец должен быть позже начала; позиция — в пределах 24 часов.');return{url:video.url,start:from,end:to};}
export function formatTime(seconds){const s=Math.max(0,seconds);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),rest=(s%60).toFixed(3).replace(/\.?0+$/,'');return(h?h+':'+String(m).padStart(2,'0'):m)+':'+(s%60<10?'0':'')+(rest||'0');}

export function setupYouTube({onImport,onBusy,notify}){
 const $=id=>document.getElementById(id),dialog=$('youtube-dialog');let job=null,controller=null,working=false;
 const state=text=>{$('youtube-status').textContent=text;};
 const busy=value=>{working=value;onBusy(value);$('youtube-submit').disabled=value;for(const id of ['youtube-url','youtube-start','youtube-end'])$(id).disabled=value;$('youtube-cancel').textContent=value?'Отменить импорт':'Закрыть';};
 const request=async(path,options={})=>{
  const response=await fetch('/api/youtube'+path,{...options,signal:controller?.signal,headers:{'Content-Type':'application/json',...options.headers}});
  if(!response.ok){let error;try{error=await response.json();}catch{}throw Error(error?.error||'Сервис импорта сейчас недоступен. Попробуйте позже.');}
  return response;
 };
 const cancel=()=>{const id=job;job=null;controller?.abort();controller=null;if(id)fetch('/api/youtube/jobs/'+id,{method:'DELETE'}).catch(()=>{});};
 const close=()=>{if(working)cancel();dialog.close();};
 $('youtube-open').onclick=async()=>{dialog.showModal();$('youtube-url').focus();if(working)return;state('Вставьте ссылку и укажите нужный отрезок.');try{const r=await fetch('/api/youtube/capabilities');const data=await r.json();if(!r.ok||!data.available)state('Импорт YouTube ещё не подключён. Загрузка аудиофайлов работает.');}catch{state('Импорт YouTube ещё не подключён. Загрузка аудиофайлов работает.');}};
 $('youtube-close').onclick=close;$('youtube-cancel').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 $('youtube-url').addEventListener('change',()=>{try{const video=parseYouTube($('youtube-url').value);if(video.start){$('youtube-start').value=formatTime(video.start);$('youtube-end').value=formatTime(video.start+30);}}catch{}});
 $('youtube-form').onsubmit=async event=>{
  event.preventDefault();if(working)return;let spec;try{spec=clipRequest($('youtube-url').value,$('youtube-start').value,$('youtube-end').value);}catch(e){state(e.message);return;}
  controller=new AbortController();const signal=controller.signal;busy(true);state('Получаем аудио…');
  try{
   const created=await(await request('/jobs',{method:'POST',body:JSON.stringify(spec)})).json();
   if(!/^[a-f0-9]{32}$/.test(created.id))throw Error('Сервис вернул некорректный ответ.');job=created.id;
   const deadline=Date.now()+240000;let result;
   while(Date.now()<deadline){
    const item=await(await request('/jobs/'+job)).json();state(item.message||'Обрабатываем отрезок…');
    if(item.status==='failed'||item.status==='cancelled')throw Error(item.error||'Не удалось получить аудио.');
    if(item.status==='ready'){result=item;break;}
    await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},1000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
   }
   if(!result)throw Error('Импорт занял слишком много времени. Попробуйте более короткий отрезок.');
   state('Загружаем отрезок в Ambient…');const response=await request('/jobs/'+job+'/audio');const bytes=await response.arrayBuffer();
   if(signal.aborted)throw new DOMException('Cancelled','AbortError');
   await onImport(bytes,(result.title||'YouTube')+' · '+formatTime(spec.start)+'–'+formatTime(spec.end),signal);
   const id=job;job=null;fetch('/api/youtube/jobs/'+id,{method:'DELETE'}).catch(()=>{});dialog.close();notify('Отрезок загружен. Нажмите «Слушать».');
  }catch(e){cancel();state(e.name==='AbortError'?'Импорт отменён.':e.message);}
  finally{controller=null;busy(false);}
 };
}
