"""Private YouTube clip service. Run one process with gunicorn's threaded worker."""
import concurrent.futures
import hmac
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import parse_qs, urlparse
import wave

TOKEN = os.environ.get('YOUTUBE_IMPORT_TOKEN', '')
JOBS = {}
LOCK = threading.RLock()
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=2)
TTL = 900
MAX_JOBS = 8
MAX_WAV_BYTES = 44100 * 2 * 2 * 120 + 4096


class ImportErrorMessage(Exception):
    pass


def validate(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get('url'), str):
        raise ValueError('Нужна ссылка на видео YouTube.')
    raw = payload['url']
    if len(raw) > 2048:
        raise ValueError('Ссылка слишком длинная.')
    u = urlparse(raw)
    if u.scheme not in ('http', 'https') or u.username or u.password or u.port:
        raise ValueError('Нужна обычная ссылка на YouTube.')
    parts = u.path.strip('/').split('/')
    video_id = None
    if u.hostname == 'youtu.be' and len(parts) == 1:
        video_id = parts[0]
    elif u.hostname in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'):
        if u.path == '/watch':
            video_id = parse_qs(u.query).get('v', [None])[0]
        elif len(parts) == 2 and parts[0] in ('shorts', 'live', 'embed'):
            video_id = parts[1]
    if not video_id or not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
        raise ValueError('Нужна ссылка на отдельное видео YouTube.')
    start, end = payload.get('start'), payload.get('end')
    if any(type(v) not in (int, float) or not math.isfinite(v) for v in (start, end)):
        raise ValueError('Укажите начало и конец отрезка в секундах.')
    if start < 0 or not .1 <= end - start <= 120 or end > 86400:
        raise ValueError('Отрезок должен длиться от 0,1 до 120 секунд, в пределах 24 часов.')
    return {'url': 'https://www.youtube.com/watch?v=' + video_id, 'start': start, 'end': end}


def public(job):
    with LOCK:
        return {k: job[k] for k in ('id', 'status', 'message', 'title', 'error') if k in job}


def update(job, **data):
    with LOCK:
        job.update(data)


def cleanup():
    now = time.monotonic()
    with LOCK:
        expired = [key for key, job in JOBS.items() if now - job['created'] > TTL and job['status'] in ('ready', 'failed', 'cancelled')]
        for key in expired:
            job = JOBS.pop(key)
            if job.get('directory'):
                shutil.rmtree(job['directory'], ignore_errors=True)


def reap_forever():
    while True:
        time.sleep(60)
        cleanup()


threading.Thread(target=reap_forever, daemon=True).start()


def stop_process(proc):
    if proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    proc.wait()


def run(job, command, seconds, output_path=None):
    # No shell, no user-provided flags. Logs never leave this job's temporary directory.
    directory = Path(job['directory'])
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        proc = subprocess.Popen(command, stdout=out, stderr=err, stdin=subprocess.DEVNULL, start_new_session=True)
        deadline = min(time.monotonic() + seconds, job['deadline'])
        try:
            while proc.poll() is None:
                if job['cancel'].is_set():
                    raise ImportErrorMessage('Импорт отменён.')
                if time.monotonic() > deadline:
                    raise ImportErrorMessage('YouTube отвечает слишком долго. Попробуйте ещё раз или выберите другой ролик.')
                if output_path and output_path.exists() and output_path.stat().st_size > MAX_WAV_BYTES:
                    raise ImportErrorMessage('Полученный фрагмент слишком большой.')
                if out.tell() > 4_000_000 or err.tell() > 1_000_000:
                    raise ImportErrorMessage('Сервис получил слишком большой ответ.')
                time.sleep(.1)
            out.seek(0)
            result = out.read(4_000_001)
            if proc.returncode:
                raise ImportErrorMessage('YouTube не отдал аудио. Видео может быть недоступно или требовать входа; попробуйте другое.')
            return result
        finally:
            stop_process(proc)


def checked_media_url(value):
    if not isinstance(value, str):
        raise ImportErrorMessage('У видео нет подходящей аудиодорожки.')
    u = urlparse(value)
    if u.scheme != 'https' or not (u.hostname or '').endswith('.googlevideo.com') or u.username or u.password or u.port:
        raise ImportErrorMessage('Не удалось получить прямую аудиодорожку YouTube.')
    return value


def transcode_command(url, start, duration, output):
    return ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
            '-rw_timeout', '15000000', '-protocol_whitelist', 'https,tls,tcp,http,crypto',
            '-ss', str(start), '-i', url, '-t', str(duration), '-map', '0:a:0', '-vn',
            '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', '-f', 'wav', str(output)]


def verify_wav(path, expected):
    if not path.exists() or not 44 < path.stat().st_size <= MAX_WAV_BYTES:
        raise ImportErrorMessage('Получился пустой или слишком большой аудиофайл.')
    try:
        with wave.open(str(path)) as w:
            duration = w.getnframes() / w.getframerate()
            if w.getnchannels() != 2 or w.getframerate() != 44100 or w.getsampwidth() != 2 or abs(duration - expected) > .15:
                raise ImportErrorMessage('Не удалось точно вырезать выбранный отрезок. Попробуйте другие границы.')
    except (wave.Error, EOFError):
        raise ImportErrorMessage('Не удалось прочитать полученное аудио.')


def extract(job):
    update(job, status='extracting', message='Получаем аудиодорожку YouTube…', deadline=time.monotonic() + 180)
    directory = tempfile.mkdtemp(prefix='ambient-youtube-')
    update(job, directory=directory)
    try:
        if job['cancel'].is_set():
            raise ImportErrorMessage('Импорт отменён.')
        spec = job['spec']
        command = [sys.executable, '-m', 'yt_dlp', '--ignore-config', '--no-playlist', '--no-cache-dir', '--no-progress',
                   '--no-warnings', '--retries', '1', '--socket-timeout', '15', '--js-runtimes', 'node',
                   '-f', 'bestaudio[ext=m4a][protocol=https]/bestaudio[protocol=https]', '--skip-download', '--dump-single-json', '--', spec['url']]
        info = json.loads(run(job, command, 55))
        duration = info.get('duration')
        if info.get('is_live') or info.get('live_status') in ('is_live', 'is_upcoming'):
            raise ImportErrorMessage('Выберите завершённое видео: прямые эфиры пока не поддерживаются.')
        if not isinstance(duration, (int, float)) or not math.isfinite(duration) or spec['end'] > duration:
            raise ImportErrorMessage('Конец отрезка выходит за пределы видео.')
        media_url = checked_media_url(info.get('url'))
        output = Path(directory) / 'clip.wav'
        update(job, status='cutting', message='Вырезаем отрезок…', title=str(info.get('title', 'YouTube'))[:300])
        run(job, transcode_command(media_url, spec['start'], spec['end'] - spec['start'], output), 120, output)
        verify_wav(output, spec['end'] - spec['start'])
        if job['cancel'].is_set():
            raise ImportErrorMessage('Импорт отменён.')
        update(job, status='ready', message='Отрезок готов.', audio=str(output))
    except ImportErrorMessage as error:
        update(job, status='cancelled' if job['cancel'].is_set() else 'failed', error=str(error))
    except Exception:
        # Do not expose subprocess logs, media URLs or internal details to the client.
        update(job, status='failed', error='Не удалось обработать видео. Попробуйте ещё раз или выберите другое.')
    finally:
        if job['status'] != 'ready' or job['cancel'].is_set():
            shutil.rmtree(directory, ignore_errors=True)


def response(start_response, status, data):
    body = json.dumps(data, ensure_ascii=False).encode()
    start_response(status, [('Content-Type', 'application/json; charset=utf-8'), ('Content-Length', str(len(body))), ('Cache-Control', 'no-store')])
    return [body]


def app(environ, start_response):
    path = environ.get('PATH_INFO', '')
    method = environ.get('REQUEST_METHOD', 'GET')
    if path == '/healthz' and method == 'GET':
        return response(start_response, '200 OK', {'ok': True})
    if not TOKEN or len(TOKEN) < 32:
        return response(start_response, '503 Service Unavailable', {'error': 'Сервис ещё не настроен.'})
    if not hmac.compare_digest(environ.get('HTTP_AUTHORIZATION', ''), 'Bearer ' + TOKEN):
        return response(start_response, '401 Unauthorized', {'error': 'Доступ закрыт.'})
    cleanup()
    if path == '/api/youtube/capabilities' and method == 'GET':
        available = bool(shutil.which('ffmpeg') and shutil.which('node') and importlib.util.find_spec('yt_dlp'))
        return response(start_response, '200 OK', {'available': available, 'max_duration': 120})
    if path == '/api/youtube/jobs' and method == 'POST':
        if not environ.get('CONTENT_TYPE', '').startswith('application/json'):
            return response(start_response, '415 Unsupported Media Type', {'error': 'Ожидается JSON.'})
        try:
            size = int(environ.get('CONTENT_LENGTH', '0'))
            if not 0 < size <= 4096:
                raise ValueError('Пустой или слишком большой запрос.')
            spec = validate(json.loads(environ['wsgi.input'].read(size)))
        except (ValueError, TypeError, UnicodeDecodeError) as error:
            return response(start_response, '400 Bad Request', {'error': str(error)[:200]})
        with LOCK:
            if len(JOBS) >= MAX_JOBS:
                return response(start_response, '429 Too Many Requests', {'error': 'Очередь заполнена. Подождите завершения текущих импортов.'})
            key = secrets.token_hex(16)
            job = {'id': key, 'status': 'queued', 'message': 'В очереди…', 'spec': spec, 'cancel': threading.Event(), 'created': time.monotonic()}
            JOBS[key] = job
            POOL.submit(extract, job)
        return response(start_response, '202 Accepted', {'id': key, 'status': 'queued'})
    match = re.fullmatch(r'/api/youtube/jobs/([a-f0-9]{32})(/audio)?', path)
    if not match:
        return response(start_response, '404 Not Found', {'error': 'Не найдено.'})
    with LOCK:
        job = JOBS.get(match[1])
        if not job:
            return response(start_response, '404 Not Found', {'error': 'Отрезок не найден или срок хранения истёк.'})
        if method == 'DELETE' and not match[2]:
            job['cancel'].set()
            if job['status'] in ('ready', 'failed', 'cancelled'):
                JOBS.pop(job['id'], None)
                shutil.rmtree(job.get('directory', '/nonexistent'), ignore_errors=True)
            return response(start_response, '200 OK', {'status': 'cancelled'})
        if method != 'GET':
            return response(start_response, '405 Method Not Allowed', {'error': 'Метод не поддерживается.'})
        if not match[2]:
            return response(start_response, '200 OK', public(job))
        if job['status'] != 'ready' or job['cancel'].is_set():
            return response(start_response, '409 Conflict', {'error': 'Аудио ещё не готово.'})
        # Open under lock so cancellation/expiry cannot unlink before this handle exists.
        handle = open(job['audio'], 'rb')
        size = os.fstat(handle.fileno()).st_size
    start_response('200 OK', [('Content-Type', 'audio/wav'), ('Content-Length', str(size)), ('Cache-Control', 'no-store')])
    def stream():
        try:
            while chunk := handle.read(65536):
                yield chunk
        finally:
            handle.close()
    return stream()
