const HELP={
  granular_grain_size:{title:'Размер гранулы',what:'Насколько длинный кусочек исходного звука берётся за один раз.',low:'Короче — звук становится более дробным, шуршащим и цифровым.',high:'Длиннее — исходник слышен цельнее, текстура становится мягче и плавнее.',hear:'Если звук «рассыпается на песок» — это короткие гранулы.'},
  granular_speed:{title:'Скорость чтения',what:'Как быстро инструмент движется по исходной записи.',low:'Медленнее — звук растягивается и почти зависает на месте.',high:'Быстрее — запись проходит быстрее и движение становится активнее.',hear:'Это похоже на скорость движения магнитной ленты, но внутри гранулярного движка.'},
  granular_pitch:{title:'Высота звука',what:'Поднимает или опускает основной гранулярный слой по нотам.',low:'Ниже — звук становится глубже и тяжелее.',high:'Выше — звук становится тоньше и светлее.',hear:'±12 полутонов = одна октава вниз или вверх.'},
  granular_randomness:{title:'Разброс позиции',what:'Насколько случайно движок прыгает по разным местам исходной записи.',low:'Меньше — слышно более последовательное движение по файлу.',high:'Больше — кусочки берутся из разных мест, текстура становится непредсказуемее.',hear:'Поднимайте, если хочется меньше узнавать исходную запись.'},
  granular_random_pitch:{title:'Разброс высоты',what:'Добавляет случайное изменение высоты каждой новой гранулы.',low:'Меньше — гранулы звучат примерно на одной высоте.',high:'Больше — каждая гранула может быть заметно выше или ниже предыдущей.',hear:'Большие значения дают хоровой, расстроенный или почти хаотичный эффект.'},
  granular_random_pitch_quantise:{title:'Квантизация высоты',what:'Решает, по каким нотам разрешено прыгать случайной высоте.',modes:['Свободно — любые промежуточные высоты.','По полутонам — только обычные ноты хроматической гаммы.','Пентатоника — прыжки ограничены более музыкальным набором нот.'],hear:'Если случайный pitch звучит слишком фальшиво — попробуйте пентатонику.'},
  pitchshift_1:{title:'Высота слоя 1',what:'Создаёт дополнительную копию гранул на другой высоте.',low:'Ниже — добавляет низкий гармонический слой.',high:'Выше — добавляет высокий гармонический слой.',hear:'Поставьте около +12 st для слоя на октаву выше.'},
  pitchshift_mix_1:{title:'Громкость слоя 1',what:'Сколько первого дополнительного pitch-слоя слышно в общей смеси.',low:'Меньше — слой почти исчезает.',high:'Больше — слой становится заметной частью звука.',hear:'Сначала выставьте высоту слоя, потом медленно добавляйте его уровень.'},
  pitchshift_2:{title:'Высота слоя 2',what:'Высота второго дополнительного гранулярного слоя.',low:'Ниже — второй голос уходит вниз.',high:'Выше — второй голос уходит вверх.',hear:'Несколько разных высот создают аккорд или плотное облако.'},
  pitchshift_mix_2:{title:'Громкость слоя 2',what:'Сколько второго pitch-слоя слышно в общей смеси.',low:'Меньше — слой тише.',high:'Больше — слой громче.',hear:'Используйте как баланс второго голоса.'},
  pitchshift_3:{title:'Высота слоя 3',what:'Высота третьего дополнительного гранулярного слоя.',low:'Ниже — третий голос становится глубже.',high:'Выше — третий голос становится выше.',hear:'Три слоя позволяют собрать аккорд вокруг исходного звука.'},
  pitchshift_mix_3:{title:'Громкость слоя 3',what:'Сколько третьего pitch-слоя слышно в общей смеси.',low:'Меньше — слой тише.',high:'Больше — слой громче.',hear:'Если звук становится слишком плотным, уменьшите уровни дополнительных слоёв.'},
  filter_type:{title:'Тип фильтра',what:'Выбирает, какую часть частот оставить в звуке.',modes:['Low-pass — оставляет низ и срезает верх.','Band-pass — оставляет только полосу вокруг выбранной частоты.','High-pass — оставляет верх и срезает низ.'],hear:'Это выбор формы фильтра; ручка «Частота среза» задаёт, где он работает.'},
  filter_cutoff:{title:'Частота среза',what:'Определяет границу, вокруг которой фильтр убирает частоты.',low:'Ниже — звук обычно становится темнее, тоньше или глуше — зависит от типа фильтра.',high:'Выше — граница фильтра перемещается к высоким частотам.',hear:'На Low-pass это самая понятная ручка «темнее ↔ ярче».'},
  filter_resonance:{title:'Резонанс',what:'Подчёркивает частоты прямо возле точки среза фильтра.',low:'Меньше — фильтр работает мягко и незаметно.',high:'Больше — возле частоты среза появляется заметный свистящий или поющий пик.',hear:'Высокий резонанс делает движение cutoff гораздо заметнее.'},
  delay_time:{title:'Время Delay',what:'Задержка между исходным звуком и каждым эхом.',low:'Короче — повторы идут быстро, почти сливаясь со звуком.',high:'Длиннее — между исходником и эхом появляется заметная пауза.',hear:'Короткие значения дают пространство, длинные — явное эхо.'},
  delay_feedback:{title:'Обратная связь Delay',what:'Сколько эха возвращается обратно в Delay и повторяется ещё раз.',low:'Меньше — один-два коротких повтора.',high:'Больше — эхо повторяется долго и постепенно затухает.',hear:'На больших значениях Delay может стать отдельным длинным слоем.'},
  delay_filter:{title:'Частота повторов',what:'Фильтрует именно эхо, не трогая основной звук.',low:'Ниже — повторы становятся более тёмными и приглушёнными.',high:'Выше — эхо сохраняет больше ярких высоких частот.',hear:'Тёмные повторы обычно лучше уходят на задний план.'},
  delay_mix:{title:'Примесь Delay',what:'Сколько обработанного эхом сигнала добавить к исходному.',low:'Меньше — почти только сухой звук.',high:'Больше — эхо занимает всё больше места в смеси.',hear:'Это баланс «без Delay ↔ много Delay».'},
  reverb_roomsize:{title:'Размер пространства',what:'Меняет ощущаемый размер помещения, в котором находится звук.',low:'Меньше — ближе к маленькой комнате.',high:'Больше — ближе к залу, пещере или большому виртуальному пространству.',hear:'Размер влияет прежде всего на ощущение масштаба, а не только на длину хвоста.'},
  reverb_time:{title:'Длина Reverb',what:'Сколько времени продолжается реверберационный хвост после звука.',low:'Короче — пространство быстро затихает.',high:'Длиннее — звук долго висит в воздухе.',hear:'Для ambient обычно именно эта ручка создаёт длинное облако.'},
  reverb_damping:{title:'Поглощение высоких',what:'Определяет, насколько быстро высокие частоты исчезают внутри реверберации.',low:'Меньше — хвост остаётся более ярким и блестящим.',high:'Больше — хвост быстрее темнеет и становится мягче.',hear:'Представьте пустую ванную против комнаты с шторами и ковром.'},
  reverb_early:{title:'Ранние отражения',what:'Громкость первых коротких отражений от воображаемых стен.',low:'Меньше — пространство ощущается более размытым.',high:'Больше — легче услышать стены и размеры помещения.',hear:'Добавляет ощущение реальной комнаты перед длинным хвостом.'},
  reverb_tail:{title:'Характер хвоста',what:'Меняет то, как плотность реверберации убывает со временем.',low:'Меньше — хвост более ровный и простой.',high:'Больше — хвост становится плотнее и дольше сохраняет массу.',hear:'Используйте вместе с «Длиной», чтобы настроить форму пространства.'},
  reverb_mix:{title:'Примесь Reverb',what:'Сколько реверберации добавить к исходному звуку.',low:'Меньше — звук остаётся близким и сухим.',high:'Больше — источник уходит дальше и растворяется в пространстве.',hear:'Это главный баланс «сухо ↔ мокро» для Reverb.'},
  amplitude:{title:'Громкость',what:'Общая громкость обработанного сигнала перед выходом.',low:'Меньше — весь инструмент звучит тише.',high:'Больше — весь инструмент звучит громче.',hear:'Если индикатор уровня постоянно упирается в максимум, лучше немного уменьшить.'},
  random_panning:{title:'Ширина панорамы',what:'Насколько случайно новые гранулы разлетаются между левым и правым каналом.',low:'Меньше — звук держится ближе к центру.',high:'Больше — гранулы активнее перемещаются по стереополю.',hear:'В наушниках эффект слышен особенно хорошо.'},
  trigger_time:{title:'Интервал гранул',what:'Как часто движок запускает новую гранулу.',low:'Короче интервал — гранул больше, текстура плотнее и непрерывнее.',high:'Длиннее интервал — между гранулами появляется больше воздуха и отдельных событий.',hear:'Это ручка плотности: «сплошное облако ↔ редкие частицы».'}
};

const card=document.createElement('aside');
card.className='param-help-card';
card.hidden=true;
card.setAttribute('role','dialog');
card.setAttribute('aria-label','Объяснение параметра');
card.innerHTML='<button class="param-help-close" type="button" aria-label="Закрыть">×</button><div class="param-help-kicker">ЧТО МЕНЯЕТСЯ</div><h3></h3><p class="param-help-what"></p><div class="param-help-directions"></div><p class="param-help-hear"></p>';
document.body.append(card);

let activeButton=null;
const close=()=>{card.hidden=true;activeButton?.setAttribute('aria-expanded','false');activeButton=null;};
card.querySelector('.param-help-close').onclick=close;

function place(button){
  const r=button.getBoundingClientRect();
  card.style.left='';card.style.right='';card.style.top='';card.style.bottom='';
  if(matchMedia('(max-width: 700px)').matches){card.style.left='12px';card.style.right='12px';card.style.bottom='12px';return;}
  const width=Math.min(360,window.innerWidth-24);
  const left=Math.min(window.innerWidth-width-12,Math.max(12,r.left-width/2+r.width/2));
  card.style.left=left+'px';
  card.style.top=Math.min(window.innerHeight-card.offsetHeight-12,r.bottom+10)+'px';
}
function show(button,key){
  const h=HELP[key];if(!h)return;
  if(activeButton===button&&!card.hidden){close();return;}
  activeButton?.setAttribute('aria-expanded','false');activeButton=button;button.setAttribute('aria-expanded','true');
  card.querySelector('h3').textContent=h.title;
  card.querySelector('.param-help-what').textContent=h.what;
  const directions=card.querySelector('.param-help-directions');directions.replaceChildren();
  if(h.modes){h.modes.forEach((text,i)=>{const row=document.createElement('div');row.className='param-help-mode';row.innerHTML='<span>'+(i+1)+'</span><p></p>';row.querySelector('p').textContent=text;directions.append(row);});}
  else{
    const low=document.createElement('div');low.className='param-help-side';low.innerHTML='<span>← МЕНЬШЕ</span><p></p>';low.querySelector('p').textContent=h.low;
    const high=document.createElement('div');high.className='param-help-side';high.innerHTML='<span>БОЛЬШЕ →</span><p></p>';high.querySelector('p').textContent=h.high;
    directions.append(low,high);
  }
  const hear=card.querySelector('.param-help-hear');hear.textContent=h.hear?'На слух: '+h.hear:'';hear.hidden=!h.hear;
  card.hidden=false;requestAnimationFrame(()=>place(button));
}

for(const input of document.querySelectorAll('.control input[id], .control select[id]')){
  const h=HELP[input.id];if(!h)continue;
  const top=input.closest('.control')?.querySelector('.control-top');const label=top?.querySelector('label');if(!top||!label)continue;
  top.classList.add('with-param-help');
  const button=document.createElement('button');button.type='button';button.className='param-help-button';button.textContent='?';button.setAttribute('aria-label','Что меняет «'+label.textContent+'»');button.setAttribute('aria-expanded','false');
  label.after(button);button.onclick=e=>{e.stopPropagation();show(button,input.id);};
}

document.addEventListener('click',e=>{if(!card.hidden&&!card.contains(e.target)&&!e.target.closest('.param-help-button'))close();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
window.addEventListener('resize',()=>{if(activeButton&&!card.hidden)place(activeButton);});
window.addEventListener('scroll',()=>{if(activeButton&&!card.hidden)place(activeButton);},{passive:true});
