import functools
import io
import json
import math
from pathlib import Path
import socketserver
import struct
import sys
import tempfile
import threading
import time
import unittest
import wave
from http.server import SimpleHTTPRequestHandler
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import importer


class Tests(unittest.TestCase):
    def test_validate(self):
        spec = importer.validate({'url':'https://youtu.be/BaW_jenozKc?list=x', 'start':1.25, 'end':31.25})
        self.assertEqual(spec['url'], 'https://www.youtube.com/watch?v=BaW_jenozKc')
        for url in ['http://127.0.0.1', 'file:///etc/passwd', 'https://youtube.com.evil.org/watch?v=BaW_jenozKc', 'https://youtube.com@evil.org/watch?v=BaW_jenozKc']:
            with self.assertRaises(ValueError):
                importer.validate({'url':url, 'start':0, 'end':30})
        for end in [float('nan'), float('inf'), True, '30', 121, -1]:
            with self.assertRaises(ValueError):
                importer.validate({'url':spec['url'], 'start':0, 'end':end})
        with self.assertRaises(importer.ImportErrorMessage):
            importer.checked_media_url('https://googlevideo.com.evil.org/a')

    def test_authentication_and_job_api(self):
        def req(path, method='GET', data=None, token=''):
            body = json.dumps(data).encode() if data else b''
            env = {'PATH_INFO':path, 'REQUEST_METHOD':method,'HTTP_AUTHORIZATION':token,'CONTENT_TYPE':'application/json','CONTENT_LENGTH':str(len(body)),'wsgi.input':io.BytesIO(body)}
            status = []
            content = b''.join(importer.app(env, lambda s,h:status.append(s)))
            return status[0], json.loads(content)
        token = 'a'*40
        with patch.object(importer,'TOKEN',token), patch.object(importer.POOL,'submit'):
            self.assertEqual(req('/api/youtube/jobs')[0], '401 Unauthorized')
            code, created = req('/api/youtube/jobs','POST',{'url':'https://youtu.be/BaW_jenozKc','start':1,'end':2},'Bearer '+token)
            self.assertEqual(code,'202 Accepted')
            job = importer.JOBS[created['id']]
            self.assertEqual(req('/api/youtube/jobs/'+job['id'],token='Bearer '+token)[1]['status'],'queued')
            self.assertEqual(req('/api/youtube/jobs/'+job['id']+'/audio',token='Bearer '+token)[0],'409 Conflict')
            req('/api/youtube/jobs/'+job['id'],'DELETE',token='Bearer '+token)
            self.assertTrue(job['cancel'].is_set())
            importer.JOBS.pop(job['id'])

    def test_expiry_removes_files(self):
        directory = tempfile.mkdtemp();Path(directory,'clip.wav').write_bytes(b'test')
        importer.JOBS['expired'] = {'status':'ready','created':time.monotonic()-901,'directory':directory}
        importer.cleanup()
        self.assertFalse(Path(directory).exists());self.assertNotIn('expired',importer.JOBS)

    def test_ffmpeg_extracts_exact_interval(self):
        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self,*args): pass
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory,'input.wav');out=Path(directory,'clip.wav')
            with wave.open(str(source),'wb') as w:
                w.setparams((2,2,44100,0,'NONE','not compressed'))
                frames=bytearray()
                for i in range(44100*3):
                    # Silence in the first second, audible tone after it.
                    value=0 if i<44100 else int(math.sin(i/44100*2*math.pi*440)*8000)
                    frames.extend(struct.pack('<hh',value,-value))
                w.writeframes(frames)
            with socketserver.TCPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=directory)) as http:
                thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
                job={'directory':directory,'deadline':time.monotonic()+15,'cancel':threading.Event()}
                try:
                    command=importer.transcode_command('http://127.0.0.1:'+str(http.server_address[1])+'/input.wav',1.25,.5,out)
                    importer.run(job,command,10,out);importer.verify_wav(out,.5)
                    with wave.open(str(out)) as w:
                        self.assertEqual(w.getnframes(),22050)
                        samples=struct.unpack('<'+'h'*w.getnframes()*2,w.readframes(w.getnframes()))
                        self.assertGreater(max(samples),7000)
                finally:http.shutdown();thread.join()


if __name__=='__main__':unittest.main()
