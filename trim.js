const MAX_CLIP_SECONDS = 120;
const ORIGINAL_FILE_LIMIT = 40 * 1024 * 1024;
const MAX_SOURCE_BYTES = 250 * 1024 * 1024;
let bypassNextChange = false;
let activeObjectUrl = null;

const formatTime = seconds => {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
};

function injectUi() {
  if (document.getElementById('trim-dialog')) return;
  const style = document.createElement('style');
  style.textContent = `
    #trim-dialog{width:min(720px,calc(100vw - 32px));max-width:none;border:1px solid #343a36;border-radius:18px;background:#16191b;color:#eef1ea;padding:0;box-shadow:0 28px 90px #0009}
    #trim-dialog::backdrop{background:#060708cc;backdrop-filter:blur(8px)}
    .trim-shell{padding:24px}.trim-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:18px}.trim-head h2{margin:0;font-size:24px;font-weight:540;letter-spacing:-.02em}.trim-head p{margin:6px 0 0;color:#9da59d;font-size:14px;line-height:1.45}.trim-close{border:0;background:transparent;color:#aeb6ae;font:inherit;font-size:18px;cursor:pointer;padding:5px 8px}
    .trim-audio{width:100%;margin:4px 0 20px;filter:saturate(.75)}.trim-selection{border:1px solid #2d332f;background:#111416;border-radius:14px;padding:18px}.trim-row{display:grid;grid-template-columns:76px 1fr 66px;gap:12px;align-items:center;margin:8px 0}.trim-row label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#8f998f}.trim-row output{text-align:right;font-variant-numeric:tabular-nums;color:#c6f278;font-size:13px}.trim-row input[type=range]{width:100%;accent-color:#c6f278}
    .trim-summary{display:flex;justify-content:space-between;gap:18px;border-top:1px solid #29302b;margin-top:14px;padding-top:14px;color:#9da59d;font-size:13px}.trim-summary strong{color:#edf3e7;font-weight:520}.trim-limit{color:#c6f278}.trim-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.trim-actions button{min-height:42px;border-radius:999px;padding:0 18px;font:inherit;cursor:pointer}.trim-cancel{border:1px solid #39403b;background:transparent;color:#d7ddd6}.trim-use{border:1px solid #c6f278;background:#c6f278;color:#111510;font-weight:600}.trim-use:disabled,.trim-cancel:disabled{opacity:.45;cursor:wait}.trim-progress{min-height:20px;margin:12px 0 0;color:#9da59d;font-size:13px}.trim-progress.error{color:#f0a7a2}
    @media(max-width:600px){.trim-shell{padding:18px}.trim-head h2{font-size:21px}.trim-row{grid-template-columns:60px 1fr 58px;gap:8px}.trim-summary{flex-direction:column;gap:5px}.trim-actions{flex-direction:column-reverse}.trim-actions button{width:100%}}
  `;
  document.head.append(style);

  const dialog = document.createElement('dialog');
  dialog.id = 'trim-dialog';
  dialog.innerHTML = `
    <div class="trim-shell">
      <div class="trim-head"><div><h2>Обрезать аудио</h2><p id="trim-description">Выберите фрагмент до 2 минут. Исходный файл останется без изменений.</p></div><button class="trim-close" id="trim-close" aria-label="Закрыть">✕</button></div>
      <audio class="trim-audio" id="trim-audio" controls preload="metadata"></audio>
      <div class="trim-selection">
        <div class="trim-row"><label for="trim-start">Начало</label><input id="trim-start" type="range" min="0" step="0.05"><output id="trim-start-time">00:00.0</output></div>
        <div class="trim-row"><label for="trim-end">Конец</label><input id="trim-end" type="range" min="0" step="0.05"><output id="trim-end-time">02:00.0</output></div>
        <div class="trim-summary"><span>Файл: <strong id="trim-file"></strong></span><span>Фрагмент: <strong id="trim-duration"></strong> <span class="trim-limit">/ максимум 02:00</span></span></div>
      </div>
      <div class="trim-progress" id="trim-progress" aria-live="polite"></div>
      <div class="trim-actions"><button class="trim-cancel" id="trim-cancel">Отмена</button><button class="trim-use" id="trim-use">Использовать фрагмент</button></div>
    </div>`;
  document.body.append(dialog);
}

function mediaDuration(file) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    const cleanup = () => { audio.removeAttribute('src'); URL.revokeObjectURL(url); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('metadata timeout')); }, 12000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      const duration = audio.duration;
      cleanup();
      Number.isFinite(duration) && duration > 0 ? resolve(duration) : reject(new Error('duration unavailable'));
    };
    audio.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error('metadata failed')); };
    audio.src = url;
  });
}

function dispatchPreparedFile(file) {
  const input = document.getElementById('audio-file');
  if (!input) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  bypassNextChange = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function encodeSelectionToWav(buffer, startSeconds, endSeconds) {
  const sourceRate = buffer.sampleRate;
  const outputRate = Math.min(48000, sourceRate);
  const channels = Math.min(2, buffer.numberOfChannels);
  const duration = Math.max(.05, endSeconds - startSeconds);
  const frames = Math.max(1, Math.floor(duration * outputRate));
  const bytesPerSample = 2;
  const dataBytes = frames * channels * bytesPerSample;
  const out = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(out);
  const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, outputRate, true);
  view.setUint32(28, outputRate * channels * bytesPerSample, true); view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, dataBytes, true);
  const source = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
  const sourceStart = startSeconds * sourceRate;
  const ratio = sourceRate / outputRate;
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    const position = sourceStart + frame * ratio;
    const index = Math.min(buffer.length - 1, Math.floor(position));
    const next = Math.min(buffer.length - 1, index + 1);
    const mix = position - index;
    for (let ch = 0; ch < channels; ch++) {
      const sample = source[ch][index] + (source[ch][next] - source[ch][index]) * mix;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 32768 : clamped * 32767, true);
      offset += 2;
    }
  }
  return out;
}

function decodeAudio(file) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return Promise.reject(new Error('Web Audio недоступен'));
  const context = new Offline(1, 1, 44100);
  return file.arrayBuffer().then(data => context.decodeAudioData(data));
}

function trimFile(file, duration) {
  injectUi();
  const dialog = document.getElementById('trim-dialog');
  const audio = document.getElementById('trim-audio');
  const start = document.getElementById('trim-start');
  const end = document.getElementById('trim-end');
  const startTime = document.getElementById('trim-start-time');
  const endTime = document.getElementById('trim-end-time');
  const durationOut = document.getElementById('trim-duration');
  const fileOut = document.getElementById('trim-file');
  const progress = document.getElementById('trim-progress');
  const use = document.getElementById('trim-use');
  const cancel = document.getElementById('trim-cancel');
  const close = document.getElementById('trim-close');

  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = URL.createObjectURL(file);
  audio.src = activeObjectUrl;
  start.max = String(duration);
  end.max = String(duration);
  start.value = '0';
  end.value = String(Math.min(duration, MAX_CLIP_SECONDS));
  fileOut.textContent = `${file.name} · ${formatTime(duration)}`;
  progress.textContent = '';
  progress.classList.remove('error');
  use.disabled = cancel.disabled = false;
  use.textContent = 'Использовать фрагмент';

  const sync = (changed) => {
    let s = Number(start.value), e = Number(end.value);
    if (changed === 'start') {
      s = Math.min(s, duration - .05);
      if (e <= s) e = Math.min(duration, s + .05);
      if (e - s > MAX_CLIP_SECONDS) e = Math.min(duration, s + MAX_CLIP_SECONDS);
      end.value = String(e);
      audio.currentTime = s;
    } else {
      e = Math.max(.05, Math.min(e, duration));
      if (e <= s) s = Math.max(0, e - .05);
      if (e - s > MAX_CLIP_SECONDS) s = Math.max(0, e - MAX_CLIP_SECONDS);
      start.value = String(s);
      audio.currentTime = Math.max(0, e - .25);
    }
    startTime.value = formatTime(s);
    endTime.value = formatTime(e);
    durationOut.textContent = formatTime(e - s);
  };
  sync('start');

  return new Promise(resolve => {
    const finish = value => {
      audio.pause();
      audio.removeAttribute('src');
      if (activeObjectUrl) { URL.revokeObjectURL(activeObjectUrl); activeObjectUrl = null; }
      if (dialog.open) dialog.close();
      start.oninput = end.oninput = use.onclick = cancel.onclick = close.onclick = null;
      resolve(value);
    };
    start.oninput = () => sync('start');
    end.oninput = () => sync('end');
    cancel.onclick = close.onclick = () => finish(null);
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
    use.onclick = async () => {
      const s = Number(start.value), e = Number(end.value);
      if (e - s > MAX_CLIP_SECONDS + .001 || e - s < .05) return;
      use.disabled = cancel.disabled = true;
      use.textContent = 'Готовим…';
      progress.textContent = 'Декодируем исходник и собираем выбранный фрагмент…';
      try {
        const decoded = await decodeAudio(file);
        progress.textContent = 'Обрезаем и подготавливаем WAV…';
        await new Promise(requestAnimationFrame);
        const wav = encodeSelectionToWav(decoded, s, e);
        const base = file.name.replace(/\.[^.]+$/, '') || 'audio';
        const prepared = new File([wav], `${base} · ${formatTime(s).replace(':','-')}–${formatTime(e).replace(':','-')}.wav`, { type: 'audio/wav' });
        finish(prepared);
      } catch (error) {
        progress.textContent = 'Не удалось обрезать этот файл. Попробуйте WAV, MP3 или M4A.';
        progress.classList.add('error');
        use.disabled = cancel.disabled = false;
        use.textContent = 'Попробовать снова';
      }
    };
    dialog.showModal();
  });
}

async function processPickedFile(file) {
  if (!file) return;
  const status = document.getElementById('status');
  if (file.size > MAX_SOURCE_BYTES) {
    if (status) status.textContent = 'Файл слишком большой';
    alert('Для обрезки выберите аудиофайл до 250 МБ.');
    return;
  }
  if (status) status.textContent = 'Проверяем аудио…';
  try {
    const duration = await mediaDuration(file);
    if (duration <= MAX_CLIP_SECONDS && file.size <= ORIGINAL_FILE_LIMIT) {
      dispatchPreparedFile(file);
      return;
    }
    const prepared = await trimFile(file, duration);
    if (prepared) dispatchPreparedFile(prepared);
    else if (status) status.textContent = 'Загрузка отменена';
  } catch {
    dispatchPreparedFile(file);
  }
}

injectUi();
document.addEventListener('change', event => {
  if (event.target?.id !== 'audio-file') return;
  if (bypassNextChange) { bypassNextChange = false; return; }
  const file = event.target.files?.[0];
  if (!file) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  processPickedFile(file);
}, true);

window.addEventListener('drop', event => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  processPickedFile(file);
}, true);
